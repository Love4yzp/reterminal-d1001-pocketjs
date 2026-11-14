#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef int esp_err_t;
#define ESP_OK 0
#define ESP_FAIL (-1)
#define ESP_ERR_NO_MEM 0x101
#define ESP_ERR_INVALID_ARG 0x102
#define ESP_ERR_INVALID_STATE 0x103
#define ESP_ERR_INVALID_SIZE 0x104
#define ESP_ERR_NOT_FOUND 0x105
#define ESP_ERR_TIMEOUT 0x107
#define ESP_ERR_INVALID_RESPONSE 0x108
#define ESP_ERR_NOT_FINISHED 0x10c

typedef uint32_t TickType_t;
typedef uint32_t EventBits_t;
typedef int BaseType_t;
typedef struct { EventBits_t bits; } StaticEventGroup_t;
typedef StaticEventGroup_t *EventGroupHandle_t;
typedef struct { unsigned tokens; } StaticSemaphore_t;
typedef StaticSemaphore_t *SemaphoreHandle_t;
typedef void *StreamBufferHandle_t;
typedef void *TaskHandle_t;
#define pdTRUE 1
#define pdFALSE 0
#define pdPASS 1
#define portMAX_DELAY UINT32_MAX
#define pdMS_TO_TICKS(ms) ((TickType_t)(ms))

SemaphoreHandle_t xSemaphoreCreateMutexStatic(StaticSemaphore_t *storage);
SemaphoreHandle_t xSemaphoreCreateBinaryStatic(StaticSemaphore_t *storage);
BaseType_t xSemaphoreTake(SemaphoreHandle_t handle, TickType_t ticks);
BaseType_t xSemaphoreGive(SemaphoreHandle_t handle);
EventGroupHandle_t xEventGroupCreateStatic(StaticEventGroup_t *storage);
EventBits_t xEventGroupGetBits(EventGroupHandle_t handle);
EventBits_t xEventGroupSetBits(EventGroupHandle_t handle, EventBits_t bits);
EventBits_t xEventGroupClearBits(EventGroupHandle_t handle, EventBits_t bits);
EventBits_t xEventGroupWaitBits(EventGroupHandle_t handle, EventBits_t bits,
                              BaseType_t clear, BaseType_t all, TickType_t ticks);
StreamBufferHandle_t xStreamBufferCreate(size_t size, size_t trigger);
void vStreamBufferDelete(StreamBufferHandle_t handle);
size_t xStreamBufferSend(StreamBufferHandle_t handle, const void *data,
                         size_t length, TickType_t ticks);
size_t xStreamBufferReceive(StreamBufferHandle_t handle, void *data,
                            size_t length, TickType_t ticks);
BaseType_t xTaskCreate(void (*task)(void *), const char *name, uint32_t stack,
                       void *arg, unsigned priority, TaskHandle_t *handle);
void vTaskDelete(TaskHandle_t handle);
void vTaskDelay(TickType_t ticks);
TickType_t xTaskGetTickCount(void);

void host_log(const char *tag, const char *format, ...);
#define ESP_LOGW(...) host_log(__VA_ARGS__)
#define ESP_LOGE(...) host_log(__VA_ARGS__)
#define ESP_LOGI(...) host_log(__VA_ARGS__)
const char *esp_err_to_name(esp_err_t error);

typedef void *usb_device_handle_t;
typedef void *cdc_acm_dev_hdl_t;
typedef struct { uint16_t idVendor; uint16_t idProduct; } usb_device_desc_t;
typedef struct {
  bool skip_phy_setup;
  uint32_t peripheral_map;
  int intr_flags;
} usb_host_config_t;
#define ESP_INTR_FLAG_LOWMED 1
#define USB_HOST_LIB_EVENT_FLAGS_NO_CLIENTS 1U

typedef enum {
  CDC_ACM_HOST_ERROR,
  CDC_ACM_HOST_DEVICE_DISCONNECTED,
} cdc_acm_host_dev_event_t;
typedef struct {
  cdc_acm_host_dev_event_t type;
  union { int error; cdc_acm_dev_hdl_t cdc_hdl; } data;
} cdc_acm_host_dev_event_data_t;
typedef struct {
  uint32_t driver_task_stack_size;
  unsigned driver_task_priority;
  int xCoreID;
  void (*new_dev_cb)(usb_device_handle_t);
} cdc_acm_host_driver_config_t;
typedef struct {
  uint32_t connection_timeout_ms;
  size_t out_buffer_size;
  size_t in_buffer_size;
  void *user_arg;
  void (*event_cb)(const cdc_acm_host_dev_event_data_t *, void *);
  bool (*data_cb)(const uint8_t *, size_t, void *);
} cdc_acm_host_device_config_t;

esp_err_t usb_host_install(const usb_host_config_t *config);
esp_err_t usb_host_uninstall(void);
esp_err_t usb_host_device_free_all(void);
esp_err_t usb_host_lib_handle_events(TickType_t ticks, uint32_t *flags);
esp_err_t usb_host_get_device_descriptor(usb_device_handle_t device,
                                          const usb_device_desc_t **descriptor);
esp_err_t cdc_acm_host_install(const cdc_acm_host_driver_config_t *config);
esp_err_t cdc_acm_host_uninstall(void);
esp_err_t cdc_acm_host_open(uint16_t vid, uint16_t pid, uint8_t interface_index,
                            const cdc_acm_host_device_config_t *config,
                            cdc_acm_dev_hdl_t *device);
esp_err_t cdc_acm_host_close(cdc_acm_dev_hdl_t device);
esp_err_t cdc_acm_host_data_tx_blocking(cdc_acm_dev_hdl_t device,
                                        const uint8_t *data, size_t length,
                                        uint32_t timeout_ms);
