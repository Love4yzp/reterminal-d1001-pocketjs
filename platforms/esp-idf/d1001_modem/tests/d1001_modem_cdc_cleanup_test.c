// Exercise the actual vendored uninstall body with delayed client teardown.
#include "modem_host_fakes.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>

#define BIT0 1U
#define BIT1 2U
#define CDC_ACM_TEARDOWN BIT0
#define CDC_ACM_TEARDOWN_COMPLETE BIT1
#define CDC_ACM_ENTER_CRITICAL() ((void)0)
#define CDC_ACM_EXIT_CRITICAL() ((void)0)
#define CDC_ACM_CHECK_FROM_CRIT(condition, error) \
  do { if (!(condition)) return (error); } while (0)
#define ESP_GOTO_ON_FALSE(condition, error, label, ...) \
  do { if (!(condition)) { ret = (error); goto label; } } while (0)
#define SLIST_EMPTY(head) (!(head)->has_devices)

static const char *TAG = "cdc_cleanup_test";
typedef struct {
  void *cdc_acm_client_hdl;
  SemaphoreHandle_t open_close_mutex;
  EventGroupHandle_t event_group;
  struct { bool has_devices; } cdc_devices_list;
} cdc_acm_obj_t;
static cdc_acm_obj_t *p_cdc_acm_obj;
static bool complete_on_wait;
static unsigned unblock_calls;
static unsigned freed_mutexes;
static unsigned freed_groups;

BaseType_t xSemaphoreTake(SemaphoreHandle_t handle, TickType_t ticks) {
  (void)ticks;
  assert(handle->tokens == 1);
  handle->tokens = 0;
  return pdTRUE;
}
BaseType_t xSemaphoreGive(SemaphoreHandle_t handle) {
  assert(handle->tokens == 0);
  handle->tokens = 1;
  return pdTRUE;
}
static void vSemaphoreDelete(SemaphoreHandle_t handle) {
  assert(handle->tokens == 1);
  ++freed_mutexes;
  free(handle);
}
EventBits_t xEventGroupGetBits(EventGroupHandle_t handle) { return handle->bits; }
EventBits_t xEventGroupSetBits(EventGroupHandle_t handle, EventBits_t bits) {
  return handle->bits |= bits;
}
EventBits_t xEventGroupWaitBits(EventGroupHandle_t handle, EventBits_t bits,
                              BaseType_t clear, BaseType_t all, TickType_t ticks) {
  assert(bits == CDC_ACM_TEARDOWN_COMPLETE && !clear && !all && ticks == 100);
  if (complete_on_wait)
    handle->bits |= CDC_ACM_TEARDOWN_COMPLETE;
  return handle->bits & bits;
}
static void vEventGroupDelete(EventGroupHandle_t handle) {
  assert((handle->bits & CDC_ACM_TEARDOWN_COMPLETE) != 0);
  ++freed_groups;
  free(handle);
}
static void usb_host_client_unblock(void *client) {
  assert(client == &unblock_calls && !complete_on_wait);
  ++unblock_calls;
}

#include "cdc_uninstall_under_test.h"

static void make_driver(void) {
  p_cdc_acm_obj = calloc(1, sizeof *p_cdc_acm_obj);
  assert(p_cdc_acm_obj != NULL);
  p_cdc_acm_obj->open_close_mutex = calloc(1, sizeof(StaticSemaphore_t));
  p_cdc_acm_obj->event_group = calloc(1, sizeof(StaticEventGroup_t));
  assert(p_cdc_acm_obj->open_close_mutex && p_cdc_acm_obj->event_group);
  p_cdc_acm_obj->open_close_mutex->tokens = 1;
  p_cdc_acm_obj->cdc_acm_client_hdl = &unblock_calls;
}
int main(void) {
  (void)TAG;
  make_driver();
  cdc_acm_obj_t *original = p_cdc_acm_obj;
  p_cdc_acm_obj->cdc_devices_list.has_devices = true;
  assert(cdc_acm_host_uninstall() == ESP_ERR_INVALID_STATE);
  assert(p_cdc_acm_obj == original && unblock_calls == 0);
  p_cdc_acm_obj->cdc_devices_list.has_devices = false;
  assert(cdc_acm_host_uninstall() == ESP_ERR_NOT_FINISHED);
  assert(p_cdc_acm_obj == original && unblock_calls == 1);
  assert(freed_mutexes == 0 && freed_groups == 0);
  assert(cdc_acm_host_uninstall() == ESP_ERR_NOT_FINISHED);
  assert(p_cdc_acm_obj == original && unblock_calls == 1);
  // On retry the client may already be gone: never unblock its stale handle.
  complete_on_wait = true;
  assert(cdc_acm_host_uninstall() == ESP_OK);
  assert(p_cdc_acm_obj == NULL && unblock_calls == 1);
  assert(freed_mutexes == 1 && freed_groups == 1);
  assert(cdc_acm_host_uninstall() == ESP_ERR_INVALID_STATE);
  // A fresh driver can be installed and reaped after the timed-out one.
  complete_on_wait = false;
  make_driver();
  assert(cdc_acm_host_uninstall() == ESP_ERR_NOT_FINISHED);
  complete_on_wait = true;
  assert(cdc_acm_host_uninstall() == ESP_OK);
  assert(p_cdc_acm_obj == NULL && freed_mutexes == 2 && freed_groups == 2);
  puts("d1001_modem_cdc_cleanup: all checks passed (vendored function)");
  return 0;
}
