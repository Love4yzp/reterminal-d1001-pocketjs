// Deterministic host fault injection, not a FreeRTOS/device simulation.
#include "modem_host_fakes.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../src/d1001_modem.c"

static TickType_t ticks_now;
static esp_err_t install_error;
static esp_err_t cdc_install_error;
static unsigned host_uninstall_failures;
static unsigned cdc_uninstall_failures;
static unsigned close_failures;
static unsigned host_uninstall_calls;
static unsigned cdc_uninstall_calls;
static unsigned close_calls;
static unsigned tx_calls;
static unsigned live_streams;
static unsigned deleted_tasks;
static bool power_enabled;
static bool run_usb_inline;
static bool signal_usb_exit;
static bool timeout_after_completion;
static void (*wait_hook)(void);
static const char *responses[4];
static const char *remaining_response;
static void (*worker_task)(void *);

SemaphoreHandle_t xSemaphoreCreateMutexStatic(StaticSemaphore_t *storage) {
  storage->tokens = 1;
  return storage;
}
SemaphoreHandle_t xSemaphoreCreateBinaryStatic(StaticSemaphore_t *storage) {
  storage->tokens = 0;
  return storage;
}
BaseType_t xSemaphoreTake(SemaphoreHandle_t handle, TickType_t ticks) {
  if (handle->tokens == 0 && ticks != 0 && wait_hook != NULL) {
    void (*hook)(void) = wait_hook;
    wait_hook = NULL;
    hook();
    if (timeout_after_completion) {
      timeout_after_completion = false;
      return pdFALSE;
    }
  }
  if (handle->tokens == 0) {
    assert(ticks != portMAX_DELAY); // A deadlock is a test failure.
    ticks_now += ticks;
    return pdFALSE;
  }
  --handle->tokens;
  return pdTRUE;
}
BaseType_t xSemaphoreGive(SemaphoreHandle_t handle) {
  assert(handle->tokens == 0);
  ++handle->tokens;
  return pdTRUE;
}
EventGroupHandle_t xEventGroupCreateStatic(StaticEventGroup_t *storage) {
  storage->bits = 0;
  return storage;
}
EventBits_t xEventGroupGetBits(EventGroupHandle_t handle) { return handle->bits; }
EventBits_t xEventGroupSetBits(EventGroupHandle_t handle, EventBits_t bits) {
  return handle->bits |= bits;
}
EventBits_t xEventGroupClearBits(EventGroupHandle_t handle, EventBits_t bits) {
  EventBits_t previous = handle->bits;
  handle->bits &= ~bits;
  return previous;
}
EventBits_t xEventGroupWaitBits(EventGroupHandle_t handle, EventBits_t bits,
                              BaseType_t clear, BaseType_t all, TickType_t ticks) {
  bool ready = all ? (handle->bits & bits) == bits : (handle->bits & bits) != 0;
  if (!ready && wait_hook != NULL) {
    void (*hook)(void) = wait_hook;
    wait_hook = NULL;
    hook();
    ready = all ? (handle->bits & bits) == bits : (handle->bits & bits) != 0;
  }
  if (!ready) {
    assert(ticks != portMAX_DELAY);
    ticks_now += ticks;
  }
  const EventBits_t result = handle->bits;
  if (clear && ready)
    handle->bits &= ~bits;
  return result;
}
StreamBufferHandle_t xStreamBufferCreate(size_t size, size_t trigger) {
  (void)trigger;
  ++live_streams;
  void *buffer = malloc(size);
  assert(buffer != NULL);
  return buffer;
}
void vStreamBufferDelete(StreamBufferHandle_t handle) {
  assert(handle != NULL && live_streams != 0);
  --live_streams;
  free(handle);
}
size_t xStreamBufferSend(StreamBufferHandle_t handle, const void *data,
                        size_t length, TickType_t ticks) {
  (void)handle; (void)data; (void)ticks;
  return length;
}
size_t xStreamBufferReceive(StreamBufferHandle_t handle, void *data,
                           size_t length, TickType_t ticks) {
  (void)handle;
  if (ticks == 0)
    return 0;
  if (remaining_response == NULL || *remaining_response == '\0') {
    ticks_now += ticks;
    return 0;
  }
  size_t received = strlen(remaining_response);
  if (received > length)
    received = length;
  memcpy(data, remaining_response, received);
  remaining_response += received;
  return received;
}
BaseType_t xTaskCreate(void (*task)(void *), const char *name, uint32_t stack,
                      void *arg, unsigned priority, TaskHandle_t *handle) {
  (void)stack; (void)priority; (void)handle;
  if (strcmp(name, "d1001_modem") == 0) {
    worker_task = task;
  } else if (run_usb_inline) {
    task(arg);
  } else {
    // USB client installed; its daemon completes only after uninstall below.
    modem.usb_install_result = ESP_OK;
    modem.candidate_vid = 0x2c7c;
    modem.candidate_pid = 0x0125;
    (void)xEventGroupSetBits(modem.events, MODEM_INSTALL_DONE | MODEM_CONNECTED);
  }
  return pdPASS;
}
void vTaskDelete(TaskHandle_t handle) { (void)handle; ++deleted_tasks; }
void vTaskDelay(TickType_t ticks) { ticks_now += ticks; }
TickType_t xTaskGetTickCount(void) { return ticks_now; }
void host_log(const char *tag, const char *format, ...) { (void)tag; (void)format; }
const char *esp_err_to_name(esp_err_t error) { (void)error; return "injected"; }
esp_err_t usb_host_install(const usb_host_config_t *config) {
  assert(config->peripheral_map == 1U);
  return install_error;
}
esp_err_t usb_host_uninstall(void) {
  ++host_uninstall_calls;
  if (host_uninstall_failures != 0) {
    --host_uninstall_failures;
    return ESP_ERR_INVALID_STATE;
  }
  return ESP_OK;
}
esp_err_t usb_host_device_free_all(void) { return ESP_OK; }
esp_err_t usb_host_lib_handle_events(TickType_t ticks, uint32_t *flags) {
  ticks_now += ticks;
  *flags = USB_HOST_LIB_EVENT_FLAGS_NO_CLIENTS;
  return ESP_OK;
}
esp_err_t usb_host_get_device_descriptor(usb_device_handle_t device,
                                       const usb_device_desc_t **descriptor) {
  (void)device;
  static const usb_device_desc_t value = {0x2c7c, 0x0125};
  *descriptor = &value;
  return ESP_OK;
}
esp_err_t cdc_acm_host_install(const cdc_acm_host_driver_config_t *config) {
  (void)config;
  return cdc_install_error;
}
esp_err_t cdc_acm_host_uninstall(void) {
  ++cdc_uninstall_calls;
  if (cdc_uninstall_failures != 0) {
    --cdc_uninstall_failures;
    return ESP_ERR_NOT_FINISHED;
  }
  if (signal_usb_exit)
    (void)xEventGroupSetBits(modem.events, MODEM_USB_EXIT);
  return ESP_OK;
}
esp_err_t cdc_acm_host_open(uint16_t vid, uint16_t pid, uint8_t interface_index,
                          const cdc_acm_host_device_config_t *config,
                          cdc_acm_dev_hdl_t *device) {
  (void)vid; (void)pid; (void)interface_index; (void)config;
  *device = &modem;
  return ESP_OK;
}
esp_err_t cdc_acm_host_close(cdc_acm_dev_hdl_t device) {
  assert(device != NULL);
  ++close_calls;
  if (close_failures != 0) {
    --close_failures;
    return ESP_FAIL;
  }
  return ESP_OK;
}
esp_err_t cdc_acm_host_data_tx_blocking(cdc_acm_dev_hdl_t device,
                                      const uint8_t *data, size_t length,
                                      uint32_t timeout_ms) {
  (void)data; (void)length; (void)timeout_ms;
  assert(device != NULL && tx_calls < 4);
  remaining_response = responses[tx_calls++];
  return ESP_OK;
}

static esp_err_t set_power(void *ctx, bool enabled) {
  assert(ctx == &power_enabled);
  power_enabled = enabled;
  return ESP_OK;
}
static esp_err_t set_reset(void *ctx, bool asserted) {
  (void)asserted;
  assert(ctx == &power_enabled);
  return ESP_OK;
}
static d1001_modem_config config(void) {
  return (d1001_modem_config){.user_ctx = &power_enabled,
      .set_power = set_power, .set_reset = set_reset, .power_off_delay_ms = 45};
}
static void reset_fakes(void) {
  assert(live_streams == 0 && !modem.running);
  ticks_now = 0;
  install_error = cdc_install_error = ESP_OK;
  host_uninstall_failures = cdc_uninstall_failures = close_failures = 0;
  host_uninstall_calls = cdc_uninstall_calls = close_calls = tx_calls = 0;
  deleted_tasks = 0;
  run_usb_inline = false;
  signal_usb_exit = true;
  timeout_after_completion = false;
  wait_hook = NULL;
  remaining_response = NULL;
  responses[0] = "OK\r\n";
  responses[1] = "+CPIN: READY\r\nOK\r\n";
  responses[2] = "+CSQ: 20,99\r\nOK\r\n";
  responses[3] = "+COPS: 0,0,\"test\",7\r\nOK\r\n";
}
static void start(void) {
  const d1001_modem_config value = config();
  assert(d1001_modem_start(&value) == ESP_OK);
  assert(modem.config.power_off_delay_ms == 45);
}
static void test_install_failure_completions(void) {
  reset_fakes();
  run_usb_inline = true;
  install_error = ESP_FAIL;
  start();
  worker_task(NULL);
  assert(!modem.running && !power_enabled && live_streams == 0);
  assert(modem.status.state == D1001_MODEM_STATE_ERROR);
  assert((xEventGroupGetBits(modem.events) & (MODEM_INSTALL_DONE | MODEM_USB_EXIT))
         == (MODEM_INSTALL_DONE | MODEM_USB_EXIT));
  assert(deleted_tasks == 2);
}
static void test_host_uninstall_retry(void) {
  reset_fakes();
  run_usb_inline = true;
  cdc_install_error = ESP_ERR_NO_MEM;
  host_uninstall_failures = 2;
  start();
  worker_task(NULL);
  assert(host_uninstall_calls == 3);
  assert(!modem.running && !modem.usb_started && live_streams == 0);
  assert(modem.status.last_error == ESP_ERR_INVALID_STATE);
  assert(d1001_modem_stop() == ESP_ERR_INVALID_STATE);
}
static void disconnect_with_refresh_flood(void) {
  for (unsigned i = 0; i < 1000; ++i)
    assert(d1001_modem_refresh() == ESP_OK);
  const cdc_acm_host_dev_event_data_t event = {
      .type = CDC_ACM_HOST_DEVICE_DISCONNECTED, .data.cdc_hdl = modem.device};
  on_device_event(&event, NULL);
}
static void fatal_error_with_refresh_flood(void) {
  disconnect_with_refresh_flood();
  const cdc_acm_host_dev_event_data_t event = {
      .type = CDC_ACM_HOST_ERROR, .data.error = 3};
  on_device_event(&event, NULL);
}
static void test_disconnect_and_error_latched(void) {
  reset_fakes();
  start();
  wait_hook = disconnect_with_refresh_flood;
  worker_task(NULL);
  assert(!modem.running && !power_enabled && live_streams == 0);
  assert(modem.status.state == D1001_MODEM_STATE_NOT_PRESENT);
  reset_fakes();
  start();
  wait_hook = fatal_error_with_refresh_flood;
  worker_task(NULL);
  assert(!modem.running && !power_enabled && live_streams == 0);
  assert(modem.status.state == D1001_MODEM_STATE_ERROR);
  assert(modem.status.last_error == ESP_FAIL);
}
static void test_cdc_cleanup_retry(void) {
  reset_fakes();
  start();
  close_failures = 1;
  cdc_uninstall_failures = 2;
  wait_hook = disconnect_with_refresh_flood;
  worker_task(NULL);
  assert(close_calls == 2 && cdc_uninstall_calls == 3);
  assert(!modem.running && !modem.usb_started && live_streams == 0);
  assert(modem.status.last_error == ESP_FAIL);
  assert(d1001_modem_stop() == ESP_FAIL);
  // Cleanup errors do not permanently lock out the next generation.
  reset_fakes();
  start();
  responses[0] = NULL;
  worker_task(NULL);
  assert(!modem.running);
}
static void complete_stop_at_deadline(void) {
  // Model a wait returning timeout although completion acquired the mutex
  // immediately before the caller's final locked check.
  timeout_after_completion = true;
  finish_worker(D1001_MODEM_STATE_IDLE, ESP_OK);
}
static void test_stop_completion_not_reused(void) {
  reset_fakes();
  start();
  assert(d1001_modem_stop() == ESP_ERR_TIMEOUT);
  assert(modem.running && !modem.stop_waiting);
  assert(modem.status.state == D1001_MODEM_STATE_STOPPING);
  // A worker publishing READY after the stop request must not hide STOPPING.
  set_state(D1001_MODEM_STATE_READY, ESP_OK);
  assert(modem.status.state == D1001_MODEM_STATE_STOPPING);
  finish_worker(D1001_MODEM_STATE_IDLE, ESP_OK);
  assert(modem.stop_done->tokens == 0);
  start();
  wait_hook = complete_stop_at_deadline;
  assert(d1001_modem_stop() == ESP_OK);
  assert(modem.stop_done->tokens == 0);
  start();
  assert(d1001_modem_stop() == ESP_ERR_TIMEOUT);
  assert(modem.running); // No earlier completion may satisfy this run.
  finish_worker(D1001_MODEM_STATE_IDLE, ESP_OK);
}
static void test_at_timeout_aborts_following_commands(void) {
  for (unsigned command = 0; command < 4; ++command) {
    reset_fakes();
    start();
    responses[command] = NULL;
    worker_task(NULL);
    assert(tx_calls == command + 1);
    assert(!modem.running && !power_enabled && live_streams == 0);
    assert(modem.status.last_error == ESP_ERR_TIMEOUT);
  }
  reset_fakes();
  start();
  // Complete final errors preserve synchronization and may be followed by CSQ.
  responses[1] = "+CME ERROR: SIM not inserted\r\n";
  wait_hook = disconnect_with_refresh_flood;
  worker_task(NULL);
  assert(tx_calls == 4 && modem.status.sim_status == D1001_MODEM_SIM_ABSENT);
}
int main(void) {
  test_install_failure_completions();
  test_host_uninstall_retry();
  test_disconnect_and_error_latched();
  test_cdc_cleanup_retry();
  test_stop_completion_not_reused();
  test_at_timeout_aborts_following_commands();
  puts("d1001_modem_lifecycle: all checks passed (host fakes)");
  return 0;
}
