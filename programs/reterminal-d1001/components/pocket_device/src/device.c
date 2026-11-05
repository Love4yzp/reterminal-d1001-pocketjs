/*
 * `globalThis.device` on the reTerminal D1001 (contracts/spec/device.ts).
 * The internal-RAM op task and QuickJS binding are ported from pocket-m5's
 * programs/m5stack-tab5/components/pocket_device/src/device.c at aa8a0ca.
 */

#include "pocket/device.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "d1001_board.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

static const char *TAG = "pocket_device";

#define DEVICE_TASK_STACK 6144
#define STATUS_BYTES 768

typedef struct {
  const char *id;
  const char *label;
} switch_t;

static const switch_t SWITCHES[] = {
    {"led-r", "Red LED"},
    {"led-g", "Green LED"},
    {"led-b", "Blue LED"},
};
#define SWITCH_COUNT (sizeof SWITCHES / sizeof SWITCHES[0])

static struct {
  bool switch_on[SWITCH_COUNT];
  uint32_t brightness;
  uint32_t system_brightness;
  char error[96];
  TaskHandle_t task;
  SemaphoreHandle_t busy;
  SemaphoreHandle_t ready;
  SemaphoreHandle_t done;
  void (*job)(void *);
  void *job_context;
  char status[STATUS_BYTES];
} device;

static void device_main(void *unused) {
  (void)unused;
  for (;;) {
    xSemaphoreTake(device.ready, portMAX_DELAY);
    device.job(device.job_context);
    xSemaphoreGive(device.done);
  }
}

static void run(void (*job)(void *), void *context) {
  xSemaphoreTake(device.busy, portMAX_DELAY);
  device.job = job;
  device.job_context = context;
  xSemaphoreGive(device.ready);
  xSemaphoreTake(device.done, portMAX_DELAY);
  xSemaphoreGive(device.busy);
}

static void set_error(const char *text) {
  snprintf(device.error, sizeof device.error, "%s", text);
}

static void build_status(void *unused) {
  (void)unused;
  const int written = snprintf(
      device.status, sizeof device.status,
      "{\"display\":{\"brightness\":%u,\"panel\":\"JD9365\"},"
      "\"volume\":0,\"temperature\":null,\"switches\":["
      "{\"id\":\"%s\",\"label\":\"%s\",\"on\":%s},"
      "{\"id\":\"%s\",\"label\":\"%s\",\"on\":%s},"
      "{\"id\":\"%s\",\"label\":\"%s\",\"on\":%s}],"
      "\"ports\":[],\"pins\":[],"
      "\"card\":{\"mounted\":false,\"totalBytes\":0,\"freeBytes\":0},"
      "\"error\":\"%s\"}",
      (unsigned)device.brightness, SWITCHES[0].id, SWITCHES[0].label,
      device.switch_on[0] ? "true" : "false", SWITCHES[1].id,
      SWITCHES[1].label, device.switch_on[1] ? "true" : "false",
      SWITCHES[2].id, SWITCHES[2].label,
      device.switch_on[2] ? "true" : "false", device.error);
  if (written < 0 || (size_t)written >= sizeof device.status)
    snprintf(device.status, sizeof device.status,
             "{\"error\":\"status overflow\"}");
}

typedef struct {
  const char *text;
  int32_t number;
  bool ok;
} call_t;

static void set_brightness(void *context) {
  call_t *call = context;
  const uint32_t percent = call->number < 0     ? 0
                           : call->number > 100 ? 100
                                                : (uint32_t)call->number;
  call->ok = d1001_board_backlight_set(percent) == ESP_OK;
  if (call->ok)
    device.brightness = percent;
  set_error(call->ok ? "" : "the backlight did not change");
}

static void set_switch(void *context) {
  call_t *call = context;
  call->ok = false;
  for (size_t i = 0; i < SWITCH_COUNT; ++i) {
    if (strcmp(SWITCHES[i].id, call->text) != 0)
      continue;
    const bool previous = device.switch_on[i];
    device.switch_on[i] = call->number != 0;
    call->ok = d1001_board_rgb_set(device.switch_on[0], device.switch_on[1],
                                   device.switch_on[2]) == ESP_OK;
    if (!call->ok)
      device.switch_on[i] = previous;
    set_error(call->ok ? "" : "the RGB LED did not change");
    ESP_LOGI(TAG, "%s %s%s", SWITCHES[i].id, call->number ? "on" : "off",
             call->ok ? "" : " failed");
    return;
  }
  set_error("no such switch");
}

static void release_guest(void *unused) {
  (void)unused;
  if (d1001_board_rgb_set(false, false, false) == ESP_OK)
    memset(device.switch_on, 0, sizeof device.switch_on);
  if (device.brightness != device.system_brightness &&
      d1001_board_backlight_set(device.system_brightness) == ESP_OK)
    device.brightness = device.system_brightness;
  set_error("");
}

enum {
  OP_STATUS,
  OP_SET_BRIGHTNESS,
  OP_SET_SWITCH,
};

static int32_t argument_int(JSContext *ctx, int argc, JSValueConst *argv,
                            int index) {
  int32_t value = 0;
  if (index < argc) {
    if (JS_IsBool(argv[index]))
      value = JS_ToBool(ctx, argv[index]);
    else
      JS_ToInt32(ctx, &value, argv[index]);
  }
  return value;
}

static JSValue operation(JSContext *ctx, JSValueConst this_value, int argc,
                         JSValueConst *argv, int magic) {
  (void)this_value;
  call_t call = {0};
  switch (magic) {
  case OP_STATUS:
    run(build_status, NULL);
    return JS_NewString(ctx, device.status);
  case OP_SET_BRIGHTNESS:
    call.number = argument_int(ctx, argc, argv, 0);
    run(set_brightness, &call);
    break;
  case OP_SET_SWITCH: {
    if (argc < 1 || !JS_IsString(argv[0]))
      return JS_FALSE;
    const char *text = JS_ToCString(ctx, argv[0]);
    if (text == NULL)
      return JS_EXCEPTION;
    call.text = text;
    call.number = argument_int(ctx, argc, argv, 1);
    run(set_switch, &call);
    JS_FreeCString(ctx, text);
    break;
  }
  default:
    return JS_UNDEFINED;
  }
  return JS_NewBool(ctx, call.ok);
}

static void add(JSContext *ctx, JSValue object, const char *name, int arity,
                int magic) {
  JS_SetPropertyStr(ctx, object, name,
                    JS_NewCFunctionMagic(ctx, operation, name, arity,
                                         JS_CFUNC_generic_magic, magic));
}

esp_err_t pocket_device_install(JSContext *realm) {
  if (device.task == NULL)
    return ESP_ERR_INVALID_STATE;
  JSValue global = JS_GetGlobalObject(realm);
  JSValue object = JS_NewObject(realm);
  add(realm, object, "status", 0, OP_STATUS);
  add(realm, object, "setBrightness", 1, OP_SET_BRIGHTNESS);
  add(realm, object, "setSwitch", 2, OP_SET_SWITCH);
  JS_SetPropertyStr(realm, global, "device", object);
  const bool failed = JS_HasException(realm);
  JS_FreeValue(realm, global);
  return failed ? ESP_ERR_NO_MEM : ESP_OK;
}

void pocket_device_teardown(void) {
  if (device.task != NULL)
    run(release_guest, NULL);
}

static void release_task_resources(void) {
  if (device.busy != NULL)
    vSemaphoreDelete(device.busy);
  if (device.ready != NULL)
    vSemaphoreDelete(device.ready);
  if (device.done != NULL)
    vSemaphoreDelete(device.done);
  device.busy = NULL;
  device.ready = NULL;
  device.done = NULL;
}

esp_err_t pocket_device_setup(void) {
  if (device.task != NULL)
    return ESP_OK;
  device.brightness = 100;
  device.system_brightness = 100;
  memset(device.switch_on, 0, sizeof device.switch_on);
  set_error("");
  esp_err_t err = d1001_board_backlight_set(device.brightness);
  if (err != ESP_OK)
    return err;
  err = d1001_board_rgb_set(false, false, false);
  if (err != ESP_OK)
    return err;
  device.busy = xSemaphoreCreateMutex();
  device.ready = xSemaphoreCreateBinary();
  device.done = xSemaphoreCreateBinary();
  if (device.busy == NULL || device.ready == NULL || device.done == NULL) {
    release_task_resources();
    return ESP_ERR_NO_MEM;
  }
  if (xTaskCreateWithCaps(device_main, "pocket_device", DEVICE_TASK_STACK, NULL,
                          5, &device.task,
                          MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) != pdPASS) {
    release_task_resources();
    return ESP_ERR_NO_MEM;
  }
  return ESP_OK;
}
