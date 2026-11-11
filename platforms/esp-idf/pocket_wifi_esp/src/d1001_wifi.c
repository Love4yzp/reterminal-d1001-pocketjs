/* Scan collection and QuickJS binding derive from pocket-m5 commit aa8a0ca,
 * pocket_system/src/wifi.c and qjs.c. */
#include <inttypes.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "d1001_wifi.h"
#include "esp_event.h"
#include "esp_heap_caps.h"
#include "esp_hosted.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#define D1001_WIFI_TASK_STACK_BYTES (8U * 1024U)
#define D1001_WIFI_POLL_MS 200U
#define D1001_WIFI_SCAN_RECORDS 32U
#define D1001_WIFI_MAX_NETWORKS 16U
#define D1001_WIFI_SSID_BYTES 33U
#define D1001_WIFI_STATUS_BYTES (8U * 1024U)
#define D1001_WIFI_RECONNECT_MIN_MS 1000U
#define D1001_WIFI_RECONNECT_MAX_MS 30000U
#define D1001_WIFI_PRESET_ATTEMPTS 3U
#define D1001_WIFI_RSSI_REFRESH_MS 1000U
#define D1001_WIFI_HAS_STATION_CONFIG                                        \
  (CONFIG_D1001_WIFI_SSID[0] != '\0' || CONFIG_D1001_WIFI_SSID_2[0] != '\0')

static const char *TAG = "d1001_wifi";

typedef enum {
  D1001_WIFI_OFF,
  D1001_WIFI_STARTING,
  D1001_WIFI_IDLE,
  D1001_WIFI_CONNECTING,
  D1001_WIFI_CONNECTED,
} d1001_wifi_state;

typedef struct {
  char ssid[D1001_WIFI_SSID_BYTES];
  int8_t rssi;
  bool secure;
} d1001_found_network;

typedef struct {
  const char *ssid;
  const char *password;
} d1001_wifi_preset;

/* Ordered presets: entry 1 keeps the original single-network Kconfig working. */
static const d1001_wifi_preset PRESETS[] = {
    {CONFIG_D1001_WIFI_SSID, CONFIG_D1001_WIFI_PASSWORD},
    {CONFIG_D1001_WIFI_SSID_2, CONFIG_D1001_WIFI_PASSWORD_2},
};
#define D1001_WIFI_PRESET_COUNT (sizeof PRESETS / sizeof PRESETS[0])
#define D1001_WIFI_NO_PRESET D1001_WIFI_PRESET_COUNT

typedef struct {
  char *data;
  size_t capacity;
  size_t length;
  bool overflow;
} d1001_json_buffer;

static SemaphoreHandle_t lock;
static bool ready;
static d1001_wifi_state state = D1001_WIFI_OFF;
static char current[D1001_WIFI_SSID_BYTES];
static char address[16];
static int8_t rssi;
static char error[160];
static bool scanning;
static bool scan_requested;
static bool scan_done;
static wifi_ap_record_t scan_records[D1001_WIFI_SCAN_RECORDS];
static d1001_found_network networks[D1001_WIFI_MAX_NETWORKS];
static size_t network_count;
static char status_out[D1001_WIFI_STATUS_BYTES];
static int64_t reconnect_at_us;
static uint32_t reconnect_delay_ms = D1001_WIFI_RECONNECT_MIN_MS;
static size_t preset_index;
static size_t preset_failures;
static size_t preset_switch_index = D1001_WIFI_NO_PRESET;
static int64_t rssi_read_at_us;

static void take(void) { xSemaphoreTake(lock, portMAX_DELAY); }

static void give(void) { xSemaphoreGive(lock); }

static int bars(int8_t value) {
  return value >= -55 ? 3 : value >= -66 ? 2 : value >= -77 ? 1 : 0;
}

static bool preset_configured(size_t index) {
  return PRESETS[index].ssid[0] != '\0';
}

/* The first configured preset, or D1001_WIFI_NO_PRESET when there is none. */
static size_t first_configured_preset(void) {
  for (size_t index = 0; index < D1001_WIFI_PRESET_COUNT; ++index)
    if (preset_configured(index))
      return index;
  return D1001_WIFI_NO_PRESET;
}

/* The next configured preset after 'from', wrapping; 'from' when it is the
 * only one, D1001_WIFI_NO_PRESET when none is configured. */
static size_t next_configured_preset(size_t from) {
  if (from >= D1001_WIFI_PRESET_COUNT)
    return first_configured_preset();
  for (size_t step = 1; step <= D1001_WIFI_PRESET_COUNT; ++step) {
    const size_t index = (from + step) % D1001_WIFI_PRESET_COUNT;
    if (preset_configured(index))
      return index;
  }
  return D1001_WIFI_NO_PRESET;
}

/* A missing AP or a refused credential will not heal by retrying the same
 * preset; other disconnect reasons keep the current network. */
static bool preset_failure_reason(uint8_t reason) {
  return reason == WIFI_REASON_NO_AP_FOUND || reason == WIFI_REASON_AUTH_FAIL ||
         reason == WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT ||
         reason == WIFI_REASON_HANDSHAKE_TIMEOUT;
}

/* Caller holds the lock. */
static void schedule_reconnect(void) {
  state = D1001_WIFI_CONNECTING;
  reconnect_at_us = esp_timer_get_time() + reconnect_delay_ms * 1000;
  reconnect_delay_ms = reconnect_delay_ms >= D1001_WIFI_RECONNECT_MAX_MS / 2U
                           ? D1001_WIFI_RECONNECT_MAX_MS
                           : reconnect_delay_ms * 2U;
}

/* Caller holds no lock. Switches the STA configuration to 'index' and leaves
 * the radio ready to connect. */
static bool apply_preset(size_t index) {
  wifi_config_t station_config = {0};
  strlcpy((char *)station_config.sta.ssid, PRESETS[index].ssid,
          sizeof station_config.sta.ssid);
  strlcpy((char *)station_config.sta.password, PRESETS[index].password,
          sizeof station_config.sta.password);
  station_config.sta.pmf_cfg.capable = true;
  const esp_err_t result = esp_wifi_set_config(WIFI_IF_STA, &station_config);
  if (result != ESP_OK) {
    take();
    snprintf(error, sizeof error, "esp_wifi_set_config failed (%s)",
             esp_err_to_name(result));
    schedule_reconnect();
    give();
    ESP_LOGE(TAG, "esp_wifi_set_config failed for SSID=%s (%s)",
             PRESETS[index].ssid, esp_err_to_name(result));
    return false;
  }
  take();
  preset_index = index;
  preset_failures = 0;
  reconnect_delay_ms = D1001_WIFI_RECONNECT_MIN_MS;
  reconnect_at_us = 0;
  state = D1001_WIFI_CONNECTING;
  give();
  ESP_LOGI(TAG, "station preset %u/%u SSID=%s", (unsigned)(index + 1U),
           (unsigned)D1001_WIFI_PRESET_COUNT, PRESETS[index].ssid);
  return true;
}

static void connect_station(void) {
  take();
  const size_t index = preset_index;
  give();
  if (index >= D1001_WIFI_PRESET_COUNT)
    return;
  ESP_LOGI(TAG, "connecting to preset SSID=%s", PRESETS[index].ssid);
  const esp_err_t result = esp_wifi_connect();
  if (result == ESP_OK)
    return;
  take();
  snprintf(error, sizeof error, "esp_wifi_connect failed (%s)",
           esp_err_to_name(result));
  schedule_reconnect();
  give();
  ESP_LOGW(TAG, "esp_wifi_connect failed for SSID=%s (%s)",
           PRESETS[index].ssid, esp_err_to_name(result));
}

static bool radio_esp_failed(const char *operation, esp_err_t result) {
  if (result == ESP_OK)
    return false;
  take();
  ready = false;
  state = D1001_WIFI_OFF;
  scanning = false;
  snprintf(error, sizeof error, "%s failed (%s)", operation,
           esp_err_to_name(result));
  give();
  ESP_LOGE(TAG, "%s failed (%s)", operation, esp_err_to_name(result));
  return true;
}

static bool radio_hosted_failed(const char *operation, int result) {
  if (result == 0)
    return false;
  take();
  ready = false;
  state = D1001_WIFI_OFF;
  scanning = false;
  snprintf(error, sizeof error, "%s failed (%d)", operation, result);
  give();
  ESP_LOGE(TAG, "%s failed (%d)", operation, result);
  return true;
}

static bool radio_no_netif_failed(esp_netif_t *netif) {
  if (netif != NULL)
    return false;
  take();
  state = D1001_WIFI_OFF;
  snprintf(error, sizeof error, "%s",
           "esp_netif_create_default_wifi_sta failed");
  give();
  ESP_LOGE(TAG, "%s", error);
  return true;
}

static bool coprocessor_compatible(void) {
  bool compatible = true;
  uint32_t chip_id = 0;
  char target[32] = {0};
  int result = esp_hosted_get_cp_info(&chip_id, target, sizeof target);
  if (result == 0) {
    target[sizeof target - 1U] = '\0';
    ESP_LOGI(TAG, "coprocessor chip_id=%" PRIu32 " target=%s", chip_id, target);
  } else {
    ESP_LOGE(TAG, "esp_hosted_get_cp_info failed (%d)", result);
    compatible = false;
  }

  esp_hosted_coprocessor_fwver_t version;
  memset(&version, 0, sizeof version);
  result = esp_hosted_get_coprocessor_fwversion(&version);
  if (result == 0) {
    ESP_LOGI(TAG, "coprocessor firmware=%u.%u.%u", (unsigned)version.major1,
             (unsigned)version.minor1, (unsigned)version.patch1);
    if (version.major1 == 2U)
      ESP_LOGI(TAG, "host 3.x is back-compatible with the 2.x coprocessor");
    else if (version.major1 != 3U) {
      ESP_LOGE(TAG, "unverified C6 firmware major version %u",
               (unsigned)version.major1);
      compatible = false;
    }
  } else {
    ESP_LOGE(TAG, "esp_hosted_get_coprocessor_fwversion failed (%d)", result);
    compatible = false;
  }
  return compatible;
}

static void on_event(void *argument, esp_event_base_t base, int32_t id,
                     void *data) {
  (void)argument;
  wifi_ap_record_t access_point;
  const bool have_rssi = base == IP_EVENT && id == IP_EVENT_STA_GOT_IP &&
                         esp_wifi_sta_get_ap_info(&access_point) == ESP_OK;
  bool disconnected = false;
  bool switching = false;
  bool rotating = false;
  uint32_t retry_ms = 0;
  char ssid[D1001_WIFI_SSID_BYTES] = {0};
  take();
  if (preset_index < D1001_WIFI_PRESET_COUNT)
    snprintf(ssid, sizeof ssid, "%s", PRESETS[preset_index].ssid);
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
    if (state != D1001_WIFI_CONNECTING && state != D1001_WIFI_CONNECTED)
      state = D1001_WIFI_IDLE;
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_STOP) {
    state = D1001_WIFI_OFF;
    current[0] = '\0';
    address[0] = '\0';
    reconnect_at_us = 0;
    preset_index = 0;
    preset_failures = 0;
    preset_switch_index = D1001_WIFI_NO_PRESET;
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_SCAN_DONE) {
    scan_done = true;
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_CONNECTED) {
    const wifi_event_sta_connected_t *event = data;
    size_t length = event->ssid_len;
    if (length >= sizeof current)
      length = sizeof current - 1U;
    memcpy(current, event->ssid, length);
    current[length] = '\0';
    address[0] = '\0';
    state = D1001_WIFI_CONNECTING;
    reconnect_at_us = 0;
    preset_failures = 0;
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    const wifi_event_sta_disconnected_t *event = data;
    state = D1001_WIFI_IDLE;
    current[0] = '\0';
    address[0] = '\0';
    rssi = 0;
    snprintf(error, sizeof error, "Station disconnected (reason %u)",
             (unsigned)event->reason);
    if (preset_switch_index != D1001_WIFI_NO_PRESET) {
      /* The requested preset takes the next connection. */
      state = D1001_WIFI_CONNECTING;
      reconnect_at_us = esp_timer_get_time();
      reconnect_delay_ms = D1001_WIFI_RECONNECT_MIN_MS;
      preset_failures = 0;
      switching = true;
    } else if (D1001_WIFI_HAS_STATION_CONFIG) {
      disconnected = true;
      retry_ms = reconnect_delay_ms;
      if (preset_failure_reason(event->reason)) {
        preset_failures += 1U;
        const size_t next = next_configured_preset(preset_index);
        if (preset_failures >= D1001_WIFI_PRESET_ATTEMPTS &&
            next != preset_index && next != D1001_WIFI_NO_PRESET) {
          preset_switch_index = next;
          preset_failures = 0;
          reconnect_delay_ms = D1001_WIFI_RECONNECT_MIN_MS;
          state = D1001_WIFI_CONNECTING;
          reconnect_at_us = esp_timer_get_time();
          rotating = true;
        } else {
          schedule_reconnect();
        }
      } else {
        preset_failures = 0;
        schedule_reconnect();
      }
    }
  } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    const ip_event_got_ip_t *event = data;
    snprintf(address, sizeof address, IPSTR, IP2STR(&event->ip_info.ip));
    state = D1001_WIFI_CONNECTED;
    error[0] = '\0';
    reconnect_at_us = 0;
    reconnect_delay_ms = D1001_WIFI_RECONNECT_MIN_MS;
    preset_failures = 0;
    rssi_read_at_us = esp_timer_get_time();
    if (have_rssi)
      rssi = access_point.rssi;
  }
  give();
  if (switching)
    ESP_LOGI(TAG, "station SSID=%s disconnected; applying the requested preset",
             ssid);
  else if (rotating)
    ESP_LOGW(TAG, "station SSID=%s disconnected; switching to the next preset",
             ssid);
  else if (disconnected)
    ESP_LOGW(TAG, "station SSID=%s disconnected; reconnect in %u ms", ssid,
             (unsigned)retry_ms);
  if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    if (have_rssi)
      ESP_LOGI(TAG, "station connected SSID=%s IP=%s RSSI=%d", current, address,
               (int)rssi);
    else
      ESP_LOGI(TAG, "station connected SSID=%s IP=%s RSSI=unknown", current,
               address);
  }
}

static bool bring_up(void) {
  if (radio_esp_failed("nvs_flash_init", nvs_flash_init()))
    return false;
  if (radio_esp_failed("esp_netif_init", esp_netif_init()))
    return false;
  esp_err_t result = esp_event_loop_create_default();
  if (result == ESP_ERR_INVALID_STATE)
    result = ESP_OK;
  if (radio_esp_failed("esp_event_loop_create_default", result))
    return false;
  if (radio_no_netif_failed(esp_netif_create_default_wifi_sta()))
    return false;
  if (radio_hosted_failed("esp_hosted_init", esp_hosted_init()))
    return false;
  if (radio_hosted_failed("esp_hosted_connect_to_slave",
                          esp_hosted_connect_to_slave()))
    return false;
  if (!coprocessor_compatible()) {
    radio_esp_failed("coprocessor compatibility check", ESP_ERR_NOT_SUPPORTED);
    return false;
  }

  wifi_init_config_t config = WIFI_INIT_CONFIG_DEFAULT();
  if (radio_esp_failed("esp_wifi_init", esp_wifi_init(&config)))
    return false;
  if (radio_esp_failed("esp_wifi_set_storage",
                       esp_wifi_set_storage(WIFI_STORAGE_RAM)))
    return false;
  if (radio_esp_failed("esp_wifi_set_mode", esp_wifi_set_mode(WIFI_MODE_STA)))
    return false;
  if (radio_esp_failed("esp_wifi_set_ps", esp_wifi_set_ps(WIFI_PS_NONE)))
    return false;
  ESP_LOGI(TAG, "Wi-Fi power save disabled");
  if (radio_esp_failed("esp_event_handler_register(WIFI_EVENT)",
                       esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                  on_event, NULL)))
    return false;
  if (radio_esp_failed("esp_event_handler_register(IP_EVENT)",
                       esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                  on_event, NULL)))
    return false;

  take();
  state = D1001_WIFI_STARTING;
  give();
  if (radio_esp_failed("esp_wifi_start", esp_wifi_start()))
    return false;
  take();
  ready = true;
  if (state == D1001_WIFI_STARTING)
    state = D1001_WIFI_IDLE;
  error[0] = '\0';
  give();
  if (D1001_WIFI_HAS_STATION_CONFIG) {
    const size_t first = first_configured_preset();
    if (!apply_preset(first)) {
      take();
      ready = false;
      state = D1001_WIFI_OFF;
      give();
      return false;
    }
    connect_station();
    ESP_LOGI(TAG, "station ready; preset SSID=%s", PRESETS[first].ssid);
  } else {
    ESP_LOGI(TAG, "station ready; scan/status only");
  }
  return true;
}

static void scan_failed(const char *operation, esp_err_t result) {
  take();
  scanning = false;
  snprintf(error, sizeof error, "%s failed (%s)", operation,
           esp_err_to_name(result));
  give();
  ESP_LOGE(TAG, "%s failed (%s)", operation, esp_err_to_name(result));
}

static void start_scan(void) {
  wifi_scan_config_t config;
  memset(&config, 0, sizeof config);
  esp_err_t result = esp_wifi_scan_start(&config, false);
  if (result != ESP_OK)
    scan_failed("esp_wifi_scan_start", result);
}

static void collect_scan(void) {
  uint16_t count = 0;
  esp_err_t result = esp_wifi_scan_get_ap_num(&count);
  if (result != ESP_OK) {
    scan_failed("esp_wifi_scan_get_ap_num", result);
    return;
  }
  if (count > D1001_WIFI_SCAN_RECORDS)
    count = D1001_WIFI_SCAN_RECORDS;
  result = esp_wifi_scan_get_ap_records(&count, scan_records);
  if (result != ESP_OK) {
    scan_failed("esp_wifi_scan_get_ap_records", result);
    return;
  }

  d1001_found_network found[D1001_WIFI_MAX_NETWORKS];
  size_t found_count = 0;
  for (uint16_t i = 0; i < count; ++i) {
    const wifi_ap_record_t *record = &scan_records[i];
    size_t ssid_length =
        strnlen((const char *)record->ssid, sizeof record->ssid);
    if (ssid_length == 0)
      continue;
    char ssid[D1001_WIFI_SSID_BYTES];
    memcpy(ssid, record->ssid, ssid_length);
    ssid[ssid_length] = '\0';

    size_t found_index = found_count;
    for (size_t j = 0; j < found_count; ++j) {
      if (strcmp(found[j].ssid, ssid) == 0) {
        found_index = j;
        break;
      }
    }
    if (found_index < found_count) {
      if (record->rssi > found[found_index].rssi) {
        found[found_index].rssi = record->rssi;
        found[found_index].secure = record->authmode != WIFI_AUTH_OPEN;
      }
      continue;
    }
    if (found_count == D1001_WIFI_MAX_NETWORKS)
      continue;
    d1001_found_network *network = &found[found_count++];
    snprintf(network->ssid, sizeof network->ssid, "%s", ssid);
    network->rssi = record->rssi;
    network->secure = record->authmode != WIFI_AUTH_OPEN;
  }

  for (size_t i = 0; i < found_count; ++i) {
    for (size_t j = i + 1U; j < found_count; ++j) {
      if (found[j].rssi > found[i].rssi) {
        d1001_found_network swap = found[i];
        found[i] = found[j];
        found[j] = swap;
      }
    }
  }

  take();
  memcpy(networks, found, found_count * sizeof found[0]);
  network_count = found_count;
  scanning = false;
  error[0] = '\0';
  give();

  ESP_LOGI(TAG, "scan complete: %u unique networks", (unsigned)found_count);
  for (size_t i = 0; i < found_count; ++i) {
    ESP_LOGI(TAG, "SSID=%s RSSI=%d secure=%s", found[i].ssid,
             (int)found[i].rssi, found[i].secure ? "true" : "false");
  }
}

/* Caller holds no lock. Applies a requested preset once the station is not
 * connected; a connected station is disconnected first and the resulting
 * STA_DISCONNECTED event completes the switch. Returns true when this call
 * applied a preset and started the connection. */
static bool service_preset_switch(void) {
  take();
  const size_t target = preset_switch_index;
  const bool connected = state == D1001_WIFI_CONNECTED;
  if (target != D1001_WIFI_NO_PRESET && !connected) {
    preset_switch_index = D1001_WIFI_NO_PRESET;
    preset_failures = 0;
    reconnect_at_us = 0;
    state = D1001_WIFI_CONNECTING;
    give();
    if (apply_preset(target))
      connect_station();
    return true;
  }
  give();
  if (target == D1001_WIFI_NO_PRESET)
    return false;
  if (esp_wifi_disconnect() == ESP_OK)
    return false;
  take();
  preset_switch_index = D1001_WIFI_NO_PRESET;
  preset_failures = 0;
  give();
  if (apply_preset(target))
    connect_station();
  return true;
}

/* Caller holds no lock. Keeps the reported RSSI current while connected. */
static void refresh_rssi(void) {
  const int64_t now = esp_timer_get_time();
  take();
  const bool connected = ready && state == D1001_WIFI_CONNECTED;
  give();
  if (!connected ||
      now - rssi_read_at_us < (int64_t)D1001_WIFI_RSSI_REFRESH_MS * 1000)
    return;
  rssi_read_at_us = now;
  wifi_ap_record_t access_point;
  if (esp_wifi_sta_get_ap_info(&access_point) != ESP_OK)
    return;
  take();
  if (state == D1001_WIFI_CONNECTED)
    rssi = access_point.rssi;
  give();
}

static void radio_task(void *argument) {
  (void)argument;
  if (!bring_up()) {
    vTaskDelete(NULL);
    return;
  }
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(D1001_WIFI_POLL_MS));
    take();
    const bool start = scan_requested;
    const bool finish = scan_done;
    const bool reconnect = D1001_WIFI_HAS_STATION_CONFIG &&
                           state == D1001_WIFI_CONNECTING &&
                           reconnect_at_us != 0 &&
                           esp_timer_get_time() >= reconnect_at_us;
    scan_requested = false;
    scan_done = false;
    if (reconnect)
      reconnect_at_us = 0;
    give();
    if (start)
      start_scan();
    if (finish)
      collect_scan();
    if (service_preset_switch())
      continue;
    if (reconnect)
      connect_station();
    refresh_rssi();
  }
}

void d1001_wifi_start(void) {
  if (lock != NULL)
    return;
  lock = xSemaphoreCreateMutex();
  if (lock == NULL) {
    ESP_LOGE(TAG, "could not create the Wi-Fi lock");
    return;
  }
  const BaseType_t created = xTaskCreatePinnedToCoreWithCaps(
      radio_task, "d1001_wifi", D1001_WIFI_TASK_STACK_BYTES, NULL, 2, NULL, 0,
      MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  if (created != pdPASS) {
    ESP_LOGE(TAG, "could not create the internal-RAM radio task");
    vSemaphoreDelete(lock);
    lock = NULL;
  }
}

static bool request_scan(void) {
  if (lock == NULL)
    return false;
  take();
  bool accepted = ready && state != D1001_WIFI_OFF;
  if (!accepted) {
    if (error[0] == '\0')
      snprintf(error, sizeof error, "%s", "Wi-Fi is not ready");
  } else if (!scanning) {
    scanning = true;
    scan_requested = true;
    error[0] = '\0';
  }
  give();
  return accepted;
}

/* Ask the radio task to join the next configured preset. */
static bool request_next_preset(void) {
  if (lock == NULL)
    return false;
  take();
  const size_t next = next_configured_preset(preset_index);
  bool accepted = ready && state != D1001_WIFI_OFF &&
                  next != D1001_WIFI_NO_PRESET && next != preset_index;
  if (accepted) {
    preset_switch_index = next;
    preset_failures = 0;
    error[0] = '\0';
  } else if (error[0] == '\0') {
    snprintf(error, sizeof error, "%s",
             "No other Wi-Fi preset is configured");
  }
  give();
  return accepted;
}

bool d1001_wifi_online(void) {
  if (lock == NULL)
    return false;
  take();
  const bool online =
      ready && state == D1001_WIFI_CONNECTED && address[0] != '\0';
  give();
  return online;
}

static void json_format(d1001_json_buffer *out, const char *format, ...) {
  if (out->overflow)
    return;
  const size_t available = out->capacity - out->length;
  va_list arguments;
  va_start(arguments, format);
  const int written =
      vsnprintf(out->data + out->length, available, format, arguments);
  va_end(arguments);
  if (written < 0 || (size_t)written >= available) {
    out->overflow = true;
    out->data[out->length] = '\0';
    return;
  }
  out->length += (size_t)written;
}

static void json_text(d1001_json_buffer *out, const char *text) {
  json_format(out, "%s", text);
}

static void json_string(d1001_json_buffer *out, const char *text) {
  json_text(out, "\"");
  for (const unsigned char *cursor = (const unsigned char *)text; *cursor != 0;
       ++cursor) {
    switch (*cursor) {
    case '\"':
      json_text(out, "\\\"");
      break;
    case '\\':
      json_text(out, "\\\\");
      break;
    case '\b':
      json_text(out, "\\b");
      break;
    case '\f':
      json_text(out, "\\f");
      break;
    case '\n':
      json_text(out, "\\n");
      break;
    case '\r':
      json_text(out, "\\r");
      break;
    case '\t':
      json_text(out, "\\t");
      break;
    default:
      if (*cursor < 0x20U)
        json_format(out, "\\u%04x", (unsigned)*cursor);
      else
        json_format(out, "%c", (int)*cursor);
      break;
    }
  }
  json_text(out, "\"");
}

static const char *status_json(void) {
  static const char *const NAMES[] = {"off", "starting", "idle", "connecting",
                                      "connected"};
  if (lock == NULL)
    return "{\"state\":\"off\",\"ssid\":\"\",\"strength\":0,"
           "\"rssi\":null,\"address\":\"\",\"online\":false,\"error\":"
           "\"Wi-Fi is not started\",\"scanning\":false,\"networks\":[]}";

  take();
  d1001_json_buffer out = {
      .data = status_out,
      .capacity = sizeof status_out,
  };
  status_out[0] = '\0';
  json_text(&out, "{\"state\":");
  json_string(&out, NAMES[state]);
  json_text(&out, ",\"ssid\":");
  json_string(&out, current);
  json_format(&out, ",\"strength\":%d",
              state == D1001_WIFI_CONNECTED ? bars(rssi) : 0);
  json_text(&out, ",\"rssi\":");
  if (state == D1001_WIFI_CONNECTED)
    json_format(&out, "%d", (int)rssi);
  else
    json_text(&out, "null");
  json_text(&out, ",\"address\":");
  json_string(&out, address);
  json_format(&out, ",\"online\":%s",
              state == D1001_WIFI_CONNECTED && address[0] != '\0' ? "true"
                                                                  : "false");
  json_text(&out, ",\"error\":");
  json_string(&out, error);
  json_format(&out, ",\"scanning\":%s,\"networks\":[",
              scanning ? "true" : "false");
  for (size_t i = 0; i < network_count; ++i) {
    if (i > 0)
      json_text(&out, ",");
    json_text(&out, "{\"ssid\":");
    json_string(&out, networks[i].ssid);
    json_format(&out, ",\"rssi\":%d,\"strength\":%d,\"secure\":%s}",
                (int)networks[i].rssi, bars(networks[i].rssi),
                networks[i].secure ? "true" : "false");
  }
  json_text(&out, "]}");
  const char *result = out.overflow
                           ? "{\"state\":\"off\",\"ssid\":\"\",\"strength\":0,"
                             "\"rssi\":null,\"address\":\"\",\"online\":false,"
                             "\"error\":\"Wi-Fi status overflow\",\"scanning\":"
                             "false,\"networks\":[]}"
                           : status_out;
  give();
  return result;
}

static JSValue wifi_operation(JSContext *ctx, JSValueConst this_value, int argc,
                              JSValueConst *argv, int magic) {
  (void)this_value;
  (void)argc;
  (void)argv;
  if (magic == 0)
    return JS_NewBool(ctx, request_scan());
  if (magic == 1)
    return JS_NewString(ctx, status_json());
  if (magic == 4)
    return JS_NewBool(ctx, request_next_preset());
  return JS_NewBool(ctx, false);
}

static void add(JSContext *ctx, JSValue object, const char *name, int magic) {
  JS_SetPropertyStr(ctx, object, name,
                    JS_NewCFunctionMagic(ctx, wifi_operation, name, 0,
                                         JS_CFUNC_generic_magic, magic));
}

esp_err_t d1001_wifi_install(JSContext *ctx) {
  if (ctx == NULL)
    return ESP_ERR_INVALID_ARG;
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue wifi = JS_NewObject(ctx);
  add(ctx, wifi, "scan", 0);
  add(ctx, wifi, "status", 1);
  add(ctx, wifi, "setEnabled", 2);
  add(ctx, wifi, "connect", 3);
  add(ctx, wifi, "nextPreset", 4);
  JS_SetPropertyStr(ctx, global, "wifi", wifi);
  const bool failed = JS_HasException(ctx);
  JS_FreeValue(ctx, global);
  return failed ? ESP_ERR_NO_MEM : ESP_OK;
}
