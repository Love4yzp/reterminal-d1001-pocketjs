/* SNTP setup follows pocket-m5's pocket_system/src/clock.c at aa8a0ca,
 * with an explicit RTC write after synchronization. */
#include "pocket/d1001.h"

#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <time.h>

#include "d1001_drivers.h"
#include "d1001_wifi.h"
#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_netif_sntp.h"
#include "pocket/screen.h"
#include "sdkconfig.h"

#ifndef CONFIG_D1001_HA_SELFTEST
#define CONFIG_D1001_HA_SELFTEST 0
#endif

static const char *TAG = "d1001_panel";

static struct {
  const d1001_board_handles *board;
  i2c_master_dev_handle_t rtc;
  i2c_master_dev_handle_t imu;
  esp_err_t rtc_error;
  esp_err_t imu_error;
  bool imu_failed;
  bool sntp_active;
  atomic_bool sntp_synced;
} panel;

static void rtc_log_error(esp_err_t result) {
  if (result != ESP_OK && result != panel.rtc_error)
    ESP_LOGW(TAG, "RTC unavailable: %s", esp_err_to_name(result));
  panel.rtc_error = result;
}

static esp_err_t imu_ensure(void) {
  if (panel.imu != NULL)
    return ESP_OK;
  if (panel.imu_failed)
    return ESP_ERR_INVALID_STATE;
  if (panel.board == NULL)
    return ESP_ERR_INVALID_STATE;
  const esp_err_t result = d1001_imu_open(panel.board->system_i2c, &panel.imu);
  if (result != ESP_OK)
    panel.imu_failed = true;
  return result;
}

static void imu_log_error(esp_err_t result) {
  if (result != ESP_OK && result != panel.imu_error)
    ESP_LOGW(TAG, "IMU unavailable: %s", esp_err_to_name(result));
  panel.imu_error = result;
}

static void on_sntp_sync(struct timeval *now) {
  const esp_err_t result = panel.rtc == NULL
                               ? ESP_ERR_INVALID_STATE
                               : d1001_rtc_write(panel.rtc, now->tv_sec);
  if (result != ESP_OK) {
    ESP_LOGE(TAG, "could not write SNTP time to RTC: %s",
             esp_err_to_name(result));
    return;
  }
  atomic_store(&panel.sntp_synced, true);
  ESP_LOGI(TAG, "SNTP synchronized; RTC epoch=%lld", (long long)now->tv_sec);
}

static JSValue read_rtc(JSContext *realm) {
  time_t epoch = 0;
  const esp_err_t result = panel.rtc == NULL
                               ? panel.rtc_error
                               : d1001_rtc_read(panel.rtc, &epoch);
  rtc_log_error(result);
  return JS_NewInt64(realm, result == ESP_OK ? (int64_t)epoch : -1);
}

static int utc_offset_minutes(void) {
  const time_t now = time(NULL);
  struct tm local;
  struct tm utc;
  if (now == (time_t)-1 || localtime_r(&now, &local) == NULL ||
      gmtime_r(&now, &utc) == NULL)
    return 0;
  const time_t local_time = mktime(&local);
  const time_t utc_time = mktime(&utc);
  if (local_time == (time_t)-1 || utc_time == (time_t)-1)
    return 0;
  return (int)(difftime(local_time, utc_time) / 60.0);
}

static JSValue read_utc_offset(JSContext *realm) {
  return JS_NewInt32(realm, utc_offset_minutes());
}

static JSValue sync_clock(JSContext *realm) {
  if (!d1001_wifi_online())
    return JS_NewString(realm, "offline");
  if (atomic_load(&panel.sntp_synced))
    return JS_NewString(realm, "synchronized");
  if (panel.sntp_active)
    return JS_NewString(realm, "pending");

  esp_sntp_config_t config =
      ESP_NETIF_SNTP_DEFAULT_CONFIG(CONFIG_D1001_SNTP_SERVER);
  config.start = false;
  config.wait_for_sync = false;
  config.sync_cb = on_sntp_sync;
  esp_err_t result = esp_netif_sntp_init(&config);
  if (result == ESP_OK)
    result = esp_netif_sntp_start();
  if (result != ESP_OK) {
    ESP_LOGE(TAG, "SNTP start failed: %s", esp_err_to_name(result));
    return JS_NewString(realm, "error");
  }
  panel.sntp_active = true;
  ESP_LOGI(TAG, "SNTP started");
  return JS_NewString(realm, "pending");
}

static JSValue read_sensors(JSContext *realm) {
  d1001_imu_sample sample;
  esp_err_t result = imu_ensure();
  if (result == ESP_OK)
    result = d1001_imu_read(panel.imu, &sample);
  imu_log_error(result);

  char json[256];
  int written;
  if (result != ESP_OK) {
    written = snprintf(json, sizeof json, "{\"available\":false}");
  } else {
    written = snprintf(
        json, sizeof json,
        "{\"available\":true,\"acceleration\":{\"x\":%.4f,\"y\":%.4f,\"z\":%.4f},"
        "\"angularRate\":{\"x\":%.4f,\"y\":%.4f,\"z\":%.4f},"
        "\"chipCelsius\":%.3f}",
        sample.acceleration.x, sample.acceleration.y, sample.acceleration.z,
        sample.angular_rate.x, sample.angular_rate.y, sample.angular_rate.z,
        sample.chip_celsius);
  }
  if (written < 0 || (size_t)written >= sizeof json)
    return JS_ThrowInternalError(realm, "sensor JSON overflow");
  return JS_NewString(realm, json);
}

static JSValue set_rgb(JSContext *realm, int argc, JSValueConst *argv) {
  int32_t color[3];
  for (size_t i = 0; i < 3U; ++i) {
    if (JS_ToInt32(realm, &color[i], argc > (int)i ? argv[i] : JS_UNDEFINED) !=
        0)
      return JS_EXCEPTION;
    if (color[i] < 0 || color[i] > 255) {
      ESP_LOGW(TAG, "RGB channel %u is outside 0..255", (unsigned)i);
      return JS_FALSE;
    }
  }
  return JS_NewBool(realm,
                    d1001_board_rgb_set_color((uint8_t)color[0],
                                              (uint8_t)color[1],
                                              (uint8_t)color[2]) == ESP_OK);
}

static bool put(JSContext *realm, JSValue object, const char *name,
                JSValue value) {
  return JS_SetPropertyStr(realm, object, name, value) >= 0;
}

static JSValue ha_config(JSContext *realm) {
  JSValue config = JS_NewObject(realm);
  if (JS_IsException(config))
    return config;
  if (!put(realm, config, "baseUrl", JS_NewString(realm, CONFIG_D1001_HA_BASE_URL)) ||
      !put(realm, config, "token", JS_NewString(realm, CONFIG_D1001_HA_TOKEN)) ||
      !put(realm, config, "lightEntityId",
           JS_NewString(realm, CONFIG_D1001_HA_LIGHT_ENTITY)) ||
      !put(realm, config, "selftest", JS_NewBool(realm, CONFIG_D1001_HA_SELFTEST))) {
    JS_FreeValue(realm, config);
    return JS_EXCEPTION;
  }
  return config;
}

#define D1001_PANEL_STATE_BYTES 4096U
static char panel_state[D1001_PANEL_STATE_BYTES];
static size_t panel_state_length;

static JSValue save_panel_state(JSContext *realm, int argc, JSValueConst *argv) {
  if (argc < 1)
    return JS_FALSE;
  size_t length = 0;
  const char *text = JS_ToCStringLen(realm, &length, argv[0]);
  if (text == NULL)
    return JS_EXCEPTION;
  bool accepted = length < D1001_PANEL_STATE_BYTES && memchr(text, '\0', length) == NULL;
  if (accepted) {
    memcpy(panel_state, text, length);
    panel_state[length] = '\0';
    panel_state_length = length;
  }
  JS_FreeCString(realm, text);
  return JS_NewBool(realm, accepted);
}

static JSValue take_panel_state(JSContext *realm) {
  JSValue value = JS_NewStringLen(realm, panel_state, panel_state_length);
  panel_state[0] = '\0';
  panel_state_length = 0;
  return value;
}

enum {
  OP_READ_RTC,
  OP_UTC_OFFSET_MINUTES,
  OP_SYNC_CLOCK,
  OP_READ_SENSORS,
  OP_SET_RGB,
  OP_HA_CONFIG,
  OP_FIRMWARE_VERSION,
  OP_SET_SCREEN_OFF_SECONDS,
  OP_LANDSCAPE,
  OP_SET_LANDSCAPE,
  OP_SAVE_PANEL_STATE,
  OP_TAKE_PANEL_STATE,
};

static JSValue operation(JSContext *realm, JSValueConst this_value, int argc,
                         JSValueConst *argv, int magic) {
  (void)this_value;
  switch (magic) {
  case OP_READ_RTC:
    return read_rtc(realm);
  case OP_UTC_OFFSET_MINUTES:
    return read_utc_offset(realm);
  case OP_SYNC_CLOCK:
    return sync_clock(realm);
  case OP_READ_SENSORS:
    return read_sensors(realm);
  case OP_SET_RGB:
    return set_rgb(realm, argc, argv);
  case OP_HA_CONFIG:
    return ha_config(realm);
  case OP_FIRMWARE_VERSION:
    return JS_NewString(realm, esp_app_get_description()->version);
  case OP_SET_SCREEN_OFF_SECONDS: {
    int32_t seconds = -1;
    if (argc > 0 && JS_ToInt32(realm, &seconds, argv[0]) != 0)
      return JS_EXCEPTION;
    return JS_NewBool(realm, seconds >= 0 &&
        d1001_screen_set_timeout_seconds(d1001_screen_get(), (uint32_t)seconds));
  }
  case OP_LANDSCAPE:
    return JS_NewBool(realm, d1001_screen_landscape(d1001_screen_get()));
  case OP_SET_LANDSCAPE:
    return JS_NewBool(realm, argc > 0 &&
        d1001_screen_request_landscape(d1001_screen_get(),
                                      JS_ToBool(realm, argv[0]) != 0));
  case OP_SAVE_PANEL_STATE:
    return save_panel_state(realm, argc, argv);
  case OP_TAKE_PANEL_STATE:
    return take_panel_state(realm);
  default:
    return JS_UNDEFINED;
  }
}

static void add(JSContext *realm, JSValue object, const char *name, int magic) {
  JS_SetPropertyStr(realm, object, name,
                    JS_NewCFunctionMagic(realm, operation, name, 0,
                                         JS_CFUNC_generic_magic, magic));
}

esp_err_t d1001_panel_install(JSContext *realm, const d1001_board_handles *board) {
  if (realm == NULL || board == NULL)
    return ESP_ERR_INVALID_ARG;
  if (panel.board != NULL)
    return ESP_ERR_INVALID_STATE;
  if (setenv("TZ", CONFIG_D1001_TIMEZONE, 1) != 0) {
    ESP_LOGE(TAG, "could not set display timezone");
    return ESP_ERR_NO_MEM;
  }
  tzset();
  ESP_LOGI(TAG, "firmware version=%s", esp_app_get_description()->version);
  ESP_LOGI(TAG, "display timezone=%s UTC offset=%d minutes",
           CONFIG_D1001_TIMEZONE, utc_offset_minutes());
  panel.board = board;
  const esp_err_t rtc_result = d1001_rtc_open(board->system_i2c, &panel.rtc);
  if (rtc_result == ESP_OK)
    ESP_LOGI(TAG, "RTC opened during panel install");
  rtc_log_error(rtc_result);
  JSValue global = JS_GetGlobalObject(realm);
  JSValue object = JS_NewObject(realm);
  add(realm, object, "readRtc", OP_READ_RTC);
  add(realm, object, "utcOffsetMinutes", OP_UTC_OFFSET_MINUTES);
  add(realm, object, "syncClock", OP_SYNC_CLOCK);
  add(realm, object, "readSensors", OP_READ_SENSORS);
  add(realm, object, "setRgb", OP_SET_RGB);
  add(realm, object, "haConfig", OP_HA_CONFIG);
  add(realm, object, "firmwareVersion", OP_FIRMWARE_VERSION);
  add(realm, object, "setScreenOffSeconds", OP_SET_SCREEN_OFF_SECONDS);
  add(realm, object, "landscape", OP_LANDSCAPE);
  add(realm, object, "setLandscape", OP_SET_LANDSCAPE);
  add(realm, object, "savePanelState", OP_SAVE_PANEL_STATE);
  add(realm, object, "takePanelState", OP_TAKE_PANEL_STATE);
  JS_SetPropertyStr(realm, global, "d1001", object);
  const bool failed = JS_HasException(realm);
  JS_FreeValue(realm, global);
  return failed ? ESP_ERR_NO_MEM : ESP_OK;
}

void d1001_panel_teardown(void) {
  if (panel.sntp_active)
    esp_netif_sntp_deinit();
  if (panel.rtc != NULL) {
    const esp_err_t result = d1001_rtc_close(&panel.rtc);
    if (result != ESP_OK)
      ESP_LOGW(TAG, "RTC close failed: %s", esp_err_to_name(result));
  }
  if (panel.imu != NULL) {
    const esp_err_t result = d1001_imu_close(&panel.imu);
    if (result != ESP_OK)
      ESP_LOGW(TAG, "IMU close failed: %s", esp_err_to_name(result));
  }
  memset(&panel, 0, sizeof panel);
}
