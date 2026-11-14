#include "d1001_modem.h"

#include <stdatomic.h>
#include <stddef.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"
#include "freertos/stream_buffer.h"
#include "freertos/task.h"
#include "usb/cdc_acm_host.h"
#include "usb/usb_host.h"

#define D1001_MODEM_DEFAULT_RESET_PULSE_MS 100U
#define D1001_MODEM_DEFAULT_POWER_ON_DELAY_MS 1500U
#define D1001_MODEM_DEFAULT_USB_TIMEOUT_MS 3000U
#define D1001_MODEM_DEFAULT_AT_TIMEOUT_MS 750U
#define D1001_MODEM_DEFAULT_TASK_STACK_SIZE 4096U
#define D1001_MODEM_DEFAULT_TASK_PRIORITY 5U
#define D1001_MODEM_STOP_TIMEOUT_MS 10000U
#define D1001_MODEM_RESPONSE_SIZE 512U
#define D1001_MODEM_RX_STREAM_SIZE 1024U
#define D1001_MODEM_DEFAULT_POWER_OFF_DELAY_MS 20U
#define D1001_MODEM_CLEANUP_RETRY_MS 100U
#define MODEM_INSTALL_DONE (1U << 0)
#define MODEM_USB_EXIT (1U << 1)
#define MODEM_CONNECTED (1U << 2)
#define MODEM_DISCONNECTED (1U << 3)
#define MODEM_IO_ERROR (1U << 4)
#define MODEM_REFRESH (1U << 5)
#define MODEM_STOP (1U << 6)
#define MODEM_ABORT_BITS (MODEM_DISCONNECTED | MODEM_IO_ERROR | MODEM_STOP)
#define MODEM_ALL_BITS (MODEM_INSTALL_DONE | MODEM_USB_EXIT | MODEM_CONNECTED | \
                        MODEM_ABORT_BITS | MODEM_REFRESH)

static const char *TAG = "d1001_modem";

static struct {
  d1001_modem_config config;
  d1001_modem_status status;
  EventGroupHandle_t events;
  StaticEventGroup_t events_storage;
  uint16_t candidate_vid;
  uint16_t candidate_pid;
  StreamBufferHandle_t rx_stream;
  SemaphoreHandle_t status_lock;
  StaticSemaphore_t status_lock_storage;
  SemaphoreHandle_t stop_done;
  StaticSemaphore_t stop_done_storage;
  cdc_acm_dev_hdl_t device;
  esp_err_t usb_install_result;
  esp_err_t cleanup_error;
  bool usb_started;
  bool stop_waiting;
  atomic_bool rx_overflow;
  bool running;
} modem;

static void status_lock(void) {
  (void)xSemaphoreTake(modem.status_lock, portMAX_DELAY);
}
static void status_unlock(void) { (void)xSemaphoreGive(modem.status_lock); }

static void set_state(d1001_modem_state state, esp_err_t error) {
  status_lock();
  if (state == D1001_MODEM_STATE_READY &&
      (xEventGroupGetBits(modem.events) & MODEM_STOP) != 0)
    state = D1001_MODEM_STATE_STOPPING;
  modem.status.state = state;
  modem.status.last_error = modem.cleanup_error != ESP_OK ? modem.cleanup_error : error;
  status_unlock();
}

static esp_err_t set_signal(d1001_modem_set_signal_cb callback, bool asserted) {
  return callback != NULL ? callback(modem.config.user_ctx, asserted) : ESP_OK;
}

static TickType_t timeout_ticks(uint32_t timeout_ms) {
  const TickType_t ticks = pdMS_TO_TICKS(timeout_ms);
  return ticks == 0 ? 1 : ticks;
}

static bool stop_requested(void) {
  return (xEventGroupGetBits(modem.events) & MODEM_STOP) != 0;
}

static esp_err_t pending_io_error(void) {
  const EventBits_t bits = xEventGroupGetBits(modem.events);
  if ((bits & MODEM_STOP) != 0)
    return ESP_ERR_INVALID_STATE;
  if ((bits & MODEM_IO_ERROR) != 0)
    return ESP_FAIL;
  if ((bits & MODEM_DISCONNECTED) != 0)
    return ESP_ERR_NOT_FOUND;
  return ESP_OK;
}

static void record_cleanup_error(esp_err_t error) {
  status_lock();
  if (modem.cleanup_error == ESP_OK)
    modem.cleanup_error = error;
  modem.status.last_error = modem.cleanup_error;
  status_unlock();
}

static bool on_rx(const uint8_t *data, size_t data_len, void *user_ctx) {
  (void)user_ctx;
  // RX storage stays alive until both the CDC client and USB daemon exit.
  const size_t sent = xStreamBufferSend(modem.rx_stream, data, data_len, 0);
  if (sent != data_len)
    atomic_store(&modem.rx_overflow, true);
  return true;
}

static void on_device_event(const cdc_acm_host_dev_event_data_t *event,
                            void *user_ctx) {
  (void)user_ctx;
  // Sticky until the next start: a full refresh queue cannot hide a failure.
  if (event->type == CDC_ACM_HOST_ERROR) {
    ESP_LOGW(TAG, "CDC-ACM error %d", event->data.error);
    (void)xEventGroupSetBits(modem.events, MODEM_IO_ERROR);
  } else if (event->type == CDC_ACM_HOST_DEVICE_DISCONNECTED) {
    (void)xEventGroupSetBits(modem.events, MODEM_DISCONNECTED);
  }
}

static void on_new_device(usb_device_handle_t usb_device) {
  const usb_device_desc_t *descriptor = NULL;
  if (usb_host_get_device_descriptor(usb_device, &descriptor) != ESP_OK)
    return;
  if ((modem.config.usb_vendor_id != 0U &&
       modem.config.usb_vendor_id != descriptor->idVendor) ||
      (modem.config.usb_product_id != 0U &&
       modem.config.usb_product_id != descriptor->idProduct))
    return;
  status_lock();
  modem.candidate_vid = descriptor->idVendor;
  modem.candidate_pid = descriptor->idProduct;
  (void)xEventGroupSetBits(modem.events, MODEM_CONNECTED);
  status_unlock();
}

static void usb_host_task(void *user_ctx) {
  (void)user_ctx;
  const usb_host_config_t host_config = {
      .skip_phy_setup = false,
      .peripheral_map = 1U,
      .intr_flags = ESP_INTR_FLAG_LOWMED,
  };
  esp_err_t error = usb_host_install(&host_config);
  const bool host_installed = error == ESP_OK;
  if (error == ESP_OK) {
    const cdc_acm_host_driver_config_t driver_config = {
        .driver_task_stack_size = 4096,
        .driver_task_priority = modem.config.task_priority + 2U,
        .xCoreID = 0,
        .new_dev_cb = on_new_device,
    };
    error = cdc_acm_host_install(&driver_config);
  }
  modem.usb_install_result = error;
  // Neither wait consumes these bits. Install failure can publish both before
  // the lower-priority worker runs without losing the exit completion.
  (void)xEventGroupSetBits(modem.events, MODEM_INSTALL_DONE);

  if (host_installed) {
    bool has_clients = error == ESP_OK;
    while (has_clients || usb_host_device_free_all() != ESP_OK) {
      uint32_t flags = 0;
      (void)usb_host_lib_handle_events(
          timeout_ticks(D1001_MODEM_CLEANUP_RETRY_MS), &flags);
      if ((flags & USB_HOST_LIB_EVENT_FLAGS_NO_CLIENTS) != 0)
        has_clients = false;
    }
    // Keep ownership of the host until uninstall really succeeds. Transient
    // failures remain visible while stop() can time out and be called again.
    while ((error = usb_host_uninstall()) != ESP_OK) {
      ESP_LOGE(TAG, "USB Host uninstall failed: %s", esp_err_to_name(error));
      record_cleanup_error(error);
      uint32_t flags = 0;
      (void)usb_host_lib_handle_events(0, &flags);
      vTaskDelay(timeout_ticks(D1001_MODEM_CLEANUP_RETRY_MS));
    }
  }
  (void)xEventGroupSetBits(modem.events, MODEM_USB_EXIT);
  vTaskDelete(NULL);
}

static esp_err_t power_on(void) {
  esp_err_t error = set_signal(modem.config.set_disable, false);
  if (error == ESP_OK)
    error = set_signal(modem.config.set_reset, true);
  if (error == ESP_OK)
    error = set_signal(modem.config.set_power, false);
  vTaskDelay(timeout_ticks(modem.config.power_off_delay_ms));
  if (error == ESP_OK)
    error = set_signal(modem.config.set_power, true);
  if (error == ESP_OK) {
    vTaskDelay(timeout_ticks(modem.config.reset_pulse_ms));
    error = set_signal(modem.config.set_reset, false);
  }
  if (error == ESP_OK)
    vTaskDelay(pdMS_TO_TICKS(modem.config.power_on_delay_ms));
  return error;
}

static esp_err_t power_off(void) {
  esp_err_t first_error = set_signal(modem.config.set_reset, true);
  const esp_err_t error = set_signal(modem.config.set_power, false);
  if (first_error == ESP_OK)
    first_error = error;
  return first_error;
}

static esp_err_t at_command(const char *command, char *response,
                            size_t response_size) {
  if (command == NULL || response == NULL || response_size < 2U ||
      modem.device == NULL)
    return ESP_ERR_INVALID_ARG;
  const esp_err_t pending = pending_io_error();
  if (pending != ESP_OK)
    return pending;
  const size_t command_length = strlen(command);
  if (command_length + 1U > 24U)
    return ESP_ERR_INVALID_ARG;

  uint8_t framed[24];
  memcpy(framed, command, command_length);
  framed[command_length] = '\r';
  response[0] = '\0';
  atomic_store(&modem.rx_overflow, false);
  uint8_t discard[32];
  while (xStreamBufferReceive(modem.rx_stream, discard, sizeof discard, 0) > 0) {
  }

  esp_err_t error = cdc_acm_host_data_tx_blocking(
      modem.device, framed, command_length + 1U, modem.config.at_timeout_ms);
  if (error != ESP_OK)
    return error;

  const TickType_t timeout = timeout_ticks(modem.config.at_timeout_ms);
  const TickType_t started = xTaskGetTickCount();
  size_t response_length = 0;
  while (true) {
    error = pending_io_error();
    if (error != ESP_OK)
      return error;
    if (atomic_load(&modem.rx_overflow))
      return ESP_ERR_INVALID_SIZE;
    const d1001_modem_at_result result =
        d1001_modem_at_response_result(response);
    if (result == D1001_MODEM_AT_OK)
      return ESP_OK;
    if (result == D1001_MODEM_AT_ERROR)
      return ESP_ERR_INVALID_RESPONSE;

    const TickType_t elapsed = xTaskGetTickCount() - started;
    if (elapsed >= timeout)
      return ESP_ERR_TIMEOUT;
    uint8_t chunk[64];
    const size_t received = xStreamBufferReceive(
        modem.rx_stream, chunk, sizeof chunk, timeout - elapsed);
    if (received == 0)
      return ESP_ERR_TIMEOUT;
    if (response_length + received >= response_size) {
      response[response_length] = '\0';
      return ESP_ERR_INVALID_SIZE;
    }
    memcpy(response + response_length, chunk, received);
    response_length += received;
    response[response_length] = '\0';
  }
}

static esp_err_t query_modem(void) {
  char response[D1001_MODEM_RESPONSE_SIZE];
  esp_err_t error = at_command("AT", response, sizeof response);
  if (error != ESP_OK)
    return error;

  d1001_modem_status status;
  status_lock();
  status = modem.status;
  status_unlock();

  error = at_command("AT+CPIN?", response, sizeof response);
  if (error != ESP_OK && error != ESP_ERR_INVALID_RESPONSE)
    return error;
  d1001_modem_sim_status sim_status;
  if (d1001_modem_at_parse_sim(response, &sim_status))
    status.sim_status = sim_status;

  error = at_command("AT+CSQ", response, sizeof response);
  if (error != ESP_OK && error != ESP_ERR_INVALID_RESPONSE)
    return error;
  d1001_modem_signal signal;
  if (error == ESP_OK && d1001_modem_at_parse_csq(response, &signal))
    status.signal = signal;

  error = at_command("AT+COPS?", response, sizeof response);
  if (error != ESP_OK && error != ESP_ERR_INVALID_RESPONSE)
    return error;
  d1001_modem_operator operator_info;
  if (error == ESP_OK &&
      d1001_modem_at_parse_operator(response, &operator_info))
    status.operator_info = operator_info;

  status_lock();
  modem.status.sim_status = status.sim_status;
  modem.status.signal = status.signal;
  modem.status.operator_info = status.operator_info;
  status_unlock();
  return ESP_OK;
}

static esp_err_t wait_for_cdc_device(void) {
  const TickType_t timeout = timeout_ticks(modem.config.usb_probe_timeout_ms);
  const TickType_t started = xTaskGetTickCount();
  while (true) {
    const esp_err_t pending = pending_io_error();
    if (pending != ESP_OK)
      return pending;
    const TickType_t elapsed = xTaskGetTickCount() - started;
    if (elapsed >= timeout)
      return ESP_ERR_TIMEOUT;
    const EventBits_t bits = xEventGroupWaitBits(
        modem.events, MODEM_CONNECTED | MODEM_ABORT_BITS, pdFALSE, pdFALSE,
        timeout - elapsed);
    if ((bits & MODEM_ABORT_BITS) != 0)
      return pending_io_error();
    if ((bits & MODEM_CONNECTED) == 0)
      return ESP_ERR_TIMEOUT;

    status_lock();
    const uint16_t vid = modem.candidate_vid;
    const uint16_t pid = modem.candidate_pid;
    (void)xEventGroupClearBits(modem.events, MODEM_CONNECTED);
    status_unlock();
    const cdc_acm_host_device_config_t device_config = {
        .connection_timeout_ms = modem.config.at_timeout_ms,
        .out_buffer_size = 512,
        .in_buffer_size = 0,
        .user_arg = NULL,
        .event_cb = on_device_event,
        .data_cb = on_rx,
    };
    const esp_err_t error = cdc_acm_host_open(
        vid, pid, modem.config.at_interface_index, &device_config, &modem.device);
    if (error != ESP_OK) {
      ESP_LOGW(TAG, "CDC open failed for %04x:%04x interface %u: %s",
               vid, pid, modem.config.at_interface_index, esp_err_to_name(error));
      return error;
    }
    status_lock();
    modem.status.usb_vendor_id = vid;
    modem.status.usb_product_id = pid;
    status_unlock();
    return pending_io_error();
  }
}

static void release_usb(void) {
  if (!modem.usb_started)
    return;
  while (modem.device != NULL) {
    const esp_err_t error = cdc_acm_host_close(modem.device);
    if (error == ESP_OK) {
      modem.device = NULL;
    } else {
      record_cleanup_error(error);
      ESP_LOGE(TAG, "CDC close failed: %s", esp_err_to_name(error));
      vTaskDelay(timeout_ticks(D1001_MODEM_CLEANUP_RETRY_MS));
    }
  }
  if (modem.usb_install_result == ESP_OK) {
    while (true) {
      const esp_err_t error = cdc_acm_host_uninstall();
      if (error == ESP_OK)
        break;
      record_cleanup_error(error);
      ESP_LOGE(TAG, "CDC uninstall failed: %s", esp_err_to_name(error));
      // The pinned local CDC override retains its object on NOT_FINISHED,
      // so this worker can retry and reclaim it once client teardown completes.
      vTaskDelay(timeout_ticks(D1001_MODEM_CLEANUP_RETRY_MS));
    }
  }
  (void)xEventGroupWaitBits(modem.events, MODEM_USB_EXIT, pdFALSE, pdTRUE,
                            portMAX_DELAY);
  modem.usb_started = false;
}

static void release_io_buffers(void) {
  if (modem.usb_started)
    return;
  status_lock();
  if (modem.rx_stream != NULL) {
    vStreamBufferDelete(modem.rx_stream);
    modem.rx_stream = NULL;
  }
  status_unlock();
}

static void finish_worker(d1001_modem_state state, esp_err_t error) {
  status_lock();
  if (modem.cleanup_error != ESP_OK) {
    state = D1001_MODEM_STATE_ERROR;
    error = modem.cleanup_error;
  }
  modem.status.state = state;
  modem.status.last_error = error;
  modem.running = false;
  // Publish completion in the same critical section as running=false. A stop
  // timeout cannot slip between the state transition and the semaphore give.
  if (modem.stop_waiting)
    (void)xSemaphoreGive(modem.stop_done);
  status_unlock();
  // No config, callbacks or per-run storage may be accessed beyond this point.
  vTaskDelete(NULL);
}

static void modem_worker(void *user_ctx) {
  (void)user_ctx;
  d1001_modem_state final_state = D1001_MODEM_STATE_NOT_PRESENT;
  esp_err_t final_error = ESP_OK;
  esp_err_t error = power_on();
  if (error != ESP_OK) {
    final_state = D1001_MODEM_STATE_ERROR;
    final_error = error;
    goto done;
  }

  if (stop_requested()) {
    final_state = D1001_MODEM_STATE_IDLE;
    goto done;
  }
  modem.rx_stream = xStreamBufferCreate(D1001_MODEM_RX_STREAM_SIZE, 1);
  if (modem.rx_stream == NULL) {
    final_state = D1001_MODEM_STATE_ERROR;
    final_error = ESP_ERR_NO_MEM;
    goto done;
  }

  modem.usb_install_result = ESP_ERR_INVALID_STATE;
  const BaseType_t created = xTaskCreate(
      usb_host_task, "d1001_usb", modem.config.usb_task_stack_size,
      NULL, modem.config.task_priority + 1U, NULL);
  if (created != pdPASS) {
    final_state = D1001_MODEM_STATE_ERROR;
    final_error = ESP_ERR_NO_MEM;
    goto done;
  }
  modem.usb_started = true;
  (void)xEventGroupWaitBits(modem.events, MODEM_INSTALL_DONE, pdFALSE, pdTRUE,
                            portMAX_DELAY);
  error = modem.usb_install_result;
  if (error != ESP_OK) {
    final_state = D1001_MODEM_STATE_ERROR;
    final_error = error;
    goto done;
  }

  if (!stop_requested()) {
    error = wait_for_cdc_device();
    if (error == ESP_ERR_TIMEOUT) {
      goto done;
    }
    if (error != ESP_OK && error != ESP_ERR_INVALID_STATE) {
      final_state = D1001_MODEM_STATE_ERROR;
      final_error = error;
      goto done;
    }
  }
  if (stop_requested()) {
    final_state = D1001_MODEM_STATE_IDLE;
    goto done;
  }

  error = query_modem();
  if (error != ESP_OK) {
    final_state = D1001_MODEM_STATE_ERROR;
    final_error = error;
    goto done;
  }
  set_state(D1001_MODEM_STATE_READY, ESP_OK);
  ESP_LOGI(TAG, "USB CDC modem AT port ready");

  while (true) {
    const EventBits_t bits = xEventGroupWaitBits(
        modem.events, MODEM_REFRESH | MODEM_ABORT_BITS, pdFALSE, pdFALSE,
        portMAX_DELAY);
    if ((bits & MODEM_STOP) != 0) {
      final_state = D1001_MODEM_STATE_IDLE;
      break;
    }
    if ((bits & MODEM_IO_ERROR) != 0) {
      final_state = D1001_MODEM_STATE_ERROR;
      final_error = ESP_FAIL;
      break;
    }
    if ((bits & MODEM_DISCONNECTED) != 0)
      break;
    if ((bits & MODEM_REFRESH) != 0) {
      (void)xEventGroupClearBits(modem.events, MODEM_REFRESH);
      error = query_modem();
      if (error != ESP_OK) {
        final_state = D1001_MODEM_STATE_ERROR;
        final_error = error;
        break;
      }
    }
  }

done:
  if (stop_requested())
    final_state = D1001_MODEM_STATE_IDLE;
  set_state(D1001_MODEM_STATE_STOPPING, final_error);
  // Do not leave the slot powered while a USB teardown retry is pending.
  error = power_off();
  if (error != ESP_OK)
    record_cleanup_error(error);
  release_usb();
  release_io_buffers();
  finish_worker(final_state, final_error);
}

static void apply_defaults(d1001_modem_config *config) {
  if (config->power_off_delay_ms == 0U)
    config->power_off_delay_ms = D1001_MODEM_DEFAULT_POWER_OFF_DELAY_MS;
  if (config->reset_pulse_ms == 0U)
    config->reset_pulse_ms = D1001_MODEM_DEFAULT_RESET_PULSE_MS;
  if (config->power_on_delay_ms == 0U)
    config->power_on_delay_ms = D1001_MODEM_DEFAULT_POWER_ON_DELAY_MS;
  if (config->usb_probe_timeout_ms == 0U)
    config->usb_probe_timeout_ms = D1001_MODEM_DEFAULT_USB_TIMEOUT_MS;
  if (config->at_timeout_ms == 0U)
    config->at_timeout_ms = D1001_MODEM_DEFAULT_AT_TIMEOUT_MS;
  if (config->task_stack_size == 0U)
    config->task_stack_size = D1001_MODEM_DEFAULT_TASK_STACK_SIZE;
  if (config->usb_task_stack_size == 0U)
    config->usb_task_stack_size = D1001_MODEM_DEFAULT_TASK_STACK_SIZE;
  if (config->task_priority == 0U)
    config->task_priority = D1001_MODEM_DEFAULT_TASK_PRIORITY;
}

esp_err_t d1001_modem_start(const d1001_modem_config *config) {
  if (config == NULL || config->set_power == NULL || config->set_reset == NULL)
    return ESP_ERR_INVALID_ARG;
  if (config->task_priority > 20U ||
      (config->task_stack_size != 0U && config->task_stack_size < 3072U) ||
      (config->usb_task_stack_size != 0U &&
       config->usb_task_stack_size < 3072U))
    return ESP_ERR_INVALID_ARG;
  if (modem.status_lock == NULL)
    modem.status_lock = xSemaphoreCreateMutexStatic(&modem.status_lock_storage);
  if (modem.stop_done == NULL)
    modem.stop_done = xSemaphoreCreateBinaryStatic(&modem.stop_done_storage);
  if (modem.events == NULL)
    modem.events = xEventGroupCreateStatic(&modem.events_storage);

  status_lock();
  if (modem.running || modem.stop_waiting) {
    status_unlock();
    return ESP_ERR_INVALID_STATE;
  }
  modem.config = *config;
  apply_defaults(&modem.config);
  modem.device = NULL;
  modem.rx_stream = NULL;
  modem.usb_started = false;
  modem.stop_waiting = false;
  atomic_store(&modem.rx_overflow, false);
  // Discard previous-run completion only after all old owners have finished.
  (void)xSemaphoreTake(modem.stop_done, 0);
  (void)xEventGroupClearBits(modem.events, MODEM_ALL_BITS);
  modem.cleanup_error = ESP_OK;
  modem.running = true;
  memset(&modem.status, 0, sizeof modem.status);
  modem.status.state = D1001_MODEM_STATE_PROBING;
  modem.status.operator_info.access_technology = -1;
  status_unlock();

  const BaseType_t created =
      xTaskCreate(modem_worker, "d1001_modem", modem.config.task_stack_size,
                  NULL, modem.config.task_priority, NULL);
  if (created != pdPASS) {
    set_state(D1001_MODEM_STATE_ERROR, ESP_ERR_NO_MEM);
    status_lock();
    modem.running = false;
    status_unlock();
    return ESP_ERR_NO_MEM;
  }
  return ESP_OK;
}

esp_err_t d1001_modem_refresh(void) {
  if (modem.status_lock == NULL)
    return ESP_ERR_INVALID_STATE;
  status_lock();
  if (!modem.running || modem.status.state != D1001_MODEM_STATE_READY ||
      modem.events == NULL) {
    status_unlock();
    return ESP_ERR_INVALID_STATE;
  }
  (void)xEventGroupSetBits(modem.events, MODEM_REFRESH);
  status_unlock();
  return ESP_OK;
}

esp_err_t d1001_modem_get_status(d1001_modem_status *status) {
  if (status == NULL)
    return ESP_ERR_INVALID_ARG;
  if (modem.status_lock == NULL) {
    memset(status, 0, sizeof *status);
    status->operator_info.access_technology = -1;
    return ESP_OK;
  }
  status_lock();
  *status = modem.status;
  status_unlock();
  return ESP_OK;
}

esp_err_t d1001_modem_stop(void) {
  if (modem.status_lock == NULL)
    return ESP_OK;
  status_lock();
  if (!modem.running) {
    const esp_err_t error = modem.cleanup_error;
    status_unlock();
    return error;
  }
  if (modem.stop_waiting) {
    status_unlock();
    return ESP_ERR_INVALID_STATE;
  }
  modem.stop_waiting = true;
  modem.status.state = D1001_MODEM_STATE_STOPPING;
  (void)xEventGroupSetBits(modem.events, MODEM_STOP);
  status_unlock();

  (void)xSemaphoreTake(modem.stop_done,
                       timeout_ticks(D1001_MODEM_STOP_TIMEOUT_MS));
  status_lock();
  // finish_worker publishes both the signal and !running under this mutex.
  // A timeout racing completion therefore cannot leave a late token behind.
  const esp_err_t error = modem.running ? ESP_ERR_TIMEOUT : modem.cleanup_error;
  (void)xSemaphoreTake(modem.stop_done, 0);
  modem.stop_waiting = false;
  status_unlock();
  return error;
}
