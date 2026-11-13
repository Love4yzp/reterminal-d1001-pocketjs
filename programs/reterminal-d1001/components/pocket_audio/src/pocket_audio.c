/*
 * globalThis.audio for the reTerminal D1001 (contracts/spec/audio.ts).
 *
 * The pure C core owns stream state, rings, mixing and tick-boundary event
 * queues. This adapter owns the FreeRTOS state/write mutexes, the mixer task,
 * PSRAM rings and the QuickJS namespace. Lock order is always write_lock then
 * state_lock. The blocking I2S write runs outside state_lock but inside
 * write_lock, so a stop/pause/destroy waits for the in-flight block instead of
 * mutating state under it.
 */

#include "pocket/audio.h"

#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "d1001_audio.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "pocket_audio_args.h"
#include "pocket_audio_core.h"

static const char *TAG = "pocket_audio";

#define AUDIO_TASK_STACK 6144U
#define AUDIO_TASK_PRIORITY 10U
#define AUDIO_TASK_CORE 0
#define AUDIO_DRAIN_MS 30U
#define AUDIO_RETRY_MS 20U
#define AUDIO_LOG_INTERVAL_MS 1000U
#define AUDIO_EVENT_BYTES 64U

static pocket_audio_core audio_core;
static int16_t *rings;
static int16_t output[POCKET_AUDIO_MIX_SAMPLES];
static TaskHandle_t audio_task;
static SemaphoreHandle_t audio_done;
static SemaphoreHandle_t audio_wake;
static SemaphoreHandle_t state_lock;
static SemaphoreHandle_t write_lock;
static _Atomic bool audio_running;
static bool audio_ready;
static pocket_audio_overflow_reporter overflow_reporter;

static bool lock_state(void) {
  return state_lock != NULL &&
         xSemaphoreTake(state_lock, portMAX_DELAY) == pdTRUE;
}

static void unlock_state(void) { xSemaphoreGive(state_lock); }

static bool lock_write(void) {
  return write_lock != NULL &&
         xSemaphoreTake(write_lock, portMAX_DELAY) == pdTRUE;
}

static void unlock_write(void) { xSemaphoreGive(write_lock); }

static void wake_mixer(void) {
  if (audio_wake != NULL)
    (void)xSemaphoreGive(audio_wake);
}

static bool any_playing(void) {
  if (!lock_state())
    return false;
  const bool playing = pocket_audio_core_any_playing(&audio_core);
  unlock_state();
  return playing;
}

static int32_t create_stream(uint32_t sample_rate, uint32_t channels) {
  if (!lock_state())
    return -1;
  const int32_t handle =
      pocket_audio_core_create_stream(&audio_core, sample_rate, channels);
  unlock_state();
  return handle;
}

static void destroy_stream(int32_t handle) {
  if (!lock_write())
    return;
  if (lock_state()) {
    pocket_audio_core_destroy_stream(&audio_core, handle);
    unlock_state();
  }
  unlock_write();
  wake_mixer();
}

static int32_t write_pcm(int32_t handle, const uint8_t *pcm, size_t bytes) {
  if (!lock_state())
    return 0;
  const int32_t accepted =
      pocket_audio_core_write_pcm(&audio_core, handle, pcm, bytes);
  unlock_state();
  if (accepted > 0)
    wake_mixer();
  return accepted;
}

static void play_stream(int32_t handle) {
  if (!lock_state())
    return;
  pocket_audio_core_play(&audio_core, handle);
  unlock_state();
  wake_mixer();
}

static void pause_stream(int32_t handle) {
  if (!lock_write())
    return;
  if (lock_state()) {
    pocket_audio_core_pause(&audio_core, handle);
    unlock_state();
  }
  unlock_write();
  wake_mixer();
}

static void stop_stream(int32_t handle) {
  if (!lock_write())
    return;
  if (lock_state()) {
    pocket_audio_core_stop(&audio_core, handle);
    unlock_state();
  }
  unlock_write();
  wake_mixer();
}

static void set_volume(int32_t handle, double volume) {
  if (!lock_state())
    return;
  pocket_audio_core_set_volume(&audio_core, handle, volume);
  unlock_state();
}

static void end_stream(int32_t handle) {
  if (!lock_state())
    return;
  pocket_audio_core_end_stream(&audio_core, handle);
  unlock_state();
  wake_mixer();
}

static void log_output_state(TickType_t *last, bool enabled) {
  const TickType_t now = xTaskGetTickCount();
  if (*last == 0 ||
      now - *last >= pdMS_TO_TICKS(AUDIO_LOG_INTERVAL_MS)) {
    ESP_LOGW(TAG, "could not %s codec output; retrying",
             enabled ? "enable" : "disable");
    *last = now;
  }
}

static void audio_task_main(void *context) {
  (void)context;
  bool output_active = false;
  TickType_t last_log = 0;
  TickType_t last_io_log = 0;
  while (atomic_load_explicit(&audio_running, memory_order_acquire)) {
    if (!any_playing()) {
      if (output_active) {
        vTaskDelay(pdMS_TO_TICKS(AUDIO_DRAIN_MS));
        if (!any_playing()) {
          if (d1001_audio_set_active(false) == ESP_OK) {
            output_active = false;
          } else {
            log_output_state(&last_log, false);
            vTaskDelay(pdMS_TO_TICKS(AUDIO_RETRY_MS));
            continue;
          }
        }
      }
      (void)xSemaphoreTake(audio_wake, portMAX_DELAY);
      continue;
    }
    if (!output_active) {
      if (d1001_audio_set_active(true) == ESP_OK) {
        output_active = true;
      } else {
        log_output_state(&last_log, true);
        vTaskDelay(pdMS_TO_TICKS(AUDIO_RETRY_MS));
        continue;
      }
    }
    if (!lock_write())
      break;
    if (!lock_state()) {
      unlock_write();
      break;
    }
    const bool contributed = pocket_audio_core_mix_block(&audio_core, output);
    unlock_state();
    if (!contributed) {
      unlock_write();
      if (any_playing())
        (void)xSemaphoreTake(audio_wake, portMAX_DELAY);
      continue;
    }
    if (d1001_audio_write(output, POCKET_AUDIO_BLOCK_FRAMES, 1000U) != ESP_OK) {
      const TickType_t now = xTaskGetTickCount();
      if (last_io_log == 0 ||
          now - last_io_log >= pdMS_TO_TICKS(AUDIO_LOG_INTERVAL_MS)) {
        ESP_LOGW(TAG, "I2S write timed out");
        last_io_log = now;
      }
    }
    unlock_write();
  }
  if (output_active)
    (void)d1001_audio_set_active(false);
  if (audio_done != NULL)
    (void)xSemaphoreGive(audio_done);
  vTaskDelete(NULL);
}

esp_err_t pocket_audio_setup(i2c_master_bus_handle_t system_i2c) {
  if (audio_ready)
    return ESP_OK;
  overflow_reporter = (pocket_audio_overflow_reporter){0};
  const size_t ring_samples = (size_t)POCKET_AUDIO_STREAM_COUNT *
                              POCKET_AUDIO_RING_FRAMES *
                              POCKET_AUDIO_CHANNELS;
  rings = heap_caps_calloc(ring_samples, sizeof(int16_t),
                           MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (rings == NULL)
    return ESP_ERR_NO_MEM;
  pocket_audio_core_init(&audio_core, rings);
  state_lock = xSemaphoreCreateMutex();
  write_lock = xSemaphoreCreateMutex();
  audio_done = xSemaphoreCreateBinary();
  audio_wake = xSemaphoreCreateBinary();
  esp_err_t err = ESP_OK;
  if (state_lock == NULL || write_lock == NULL || audio_done == NULL ||
      audio_wake == NULL) {
    err = ESP_ERR_NO_MEM;
    goto fail;
  }
  const d1001_audio_config config = {
      .volume_percent = D1001_AUDIO_DEFAULT_VOLUME_PERCENT,
  };
  err = d1001_audio_init(system_i2c, &config);
  if (err != ESP_OK)
    goto fail;
  atomic_store_explicit(&audio_running, true, memory_order_release);
  if (xTaskCreatePinnedToCoreWithCaps(
          audio_task_main, "pocket_audio", AUDIO_TASK_STACK, NULL,
          AUDIO_TASK_PRIORITY, &audio_task, AUDIO_TASK_CORE,
          MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) != pdPASS) {
    atomic_store_explicit(&audio_running, false, memory_order_release);
    audio_task = NULL;
    err = ESP_ERR_NO_MEM;
    goto fail;
  }
  audio_ready = true;
  ESP_LOGI(TAG,
           "4 streams x %u frames in PSRAM, mixer task core %d priority %d",
           (unsigned)POCKET_AUDIO_RING_FRAMES, AUDIO_TASK_CORE,
           AUDIO_TASK_PRIORITY);
  return ESP_OK;

fail:
  if (audio_done != NULL) {
    vSemaphoreDelete(audio_done);
    audio_done = NULL;
  }
  if (audio_wake != NULL) {
    vSemaphoreDelete(audio_wake);
    audio_wake = NULL;
  }
  if (state_lock != NULL) {
    vSemaphoreDelete(state_lock);
    state_lock = NULL;
  }
  if (write_lock != NULL) {
    vSemaphoreDelete(write_lock);
    write_lock = NULL;
  }
  (void)d1001_audio_deinit();
  heap_caps_free(rings);
  rings = NULL;
  return err;
}

void pocket_audio_teardown(void) {
  audio_ready = false;
  overflow_reporter = (pocket_audio_overflow_reporter){0};
  atomic_store_explicit(&audio_running, false, memory_order_release);
  if (audio_task != NULL) {
    if (audio_wake != NULL)
      (void)xSemaphoreGive(audio_wake);
    (void)xSemaphoreTake(audio_done, portMAX_DELAY);
    audio_task = NULL;
  }
  pocket_audio_core_reset(&audio_core);
  d1001_audio_deinit();
  if (audio_done != NULL) {
    vSemaphoreDelete(audio_done);
    audio_done = NULL;
  }
  if (audio_wake != NULL) {
    vSemaphoreDelete(audio_wake);
    audio_wake = NULL;
  }
  if (state_lock != NULL) {
    vSemaphoreDelete(state_lock);
    state_lock = NULL;
  }
  if (write_lock != NULL) {
    vSemaphoreDelete(write_lock);
    write_lock = NULL;
  }
  if (rings != NULL) {
    heap_caps_free(rings);
    rings = NULL;
  }
}

void pocket_audio_latch(void) {
  if (!audio_ready || !lock_state())
    return;
  pocket_audio_core_latch(&audio_core);
  const uint32_t dropped = pocket_audio_core_dropped_events(&audio_core);
  unlock_state();
  const uint32_t now_ms =
      (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
  if (pocket_audio_overflow_observe(&overflow_reporter, dropped, now_ms,
                                    AUDIO_LOG_INTERVAL_MS)) {
    ESP_LOGW(TAG, "audio event queue overflow, dropped=%u",
             (unsigned)dropped);
  }
}

static bool poll_event(char *line, size_t size) {
  if (!lock_state())
    return false;
  pocket_audio_event event;
  const bool found = pocket_audio_core_poll(&audio_core, &event);
  unlock_state();
  if (!found)
    return false;
  switch (event.type) {
  case POCKET_AUDIO_EVENT_ENDED:
    (void)snprintf(line, size, "{\"t\":\"ended\",\"h\":%d}",
                   (int)event.handle);
    return true;
  case POCKET_AUDIO_EVENT_UNDERRUN:
    (void)snprintf(line, size, "{\"t\":\"underrun\",\"h\":%d}",
                   (int)event.handle);
    return true;
  case POCKET_AUDIO_EVENT_CREDIT:
    (void)snprintf(line, size,
                   "{\"t\":\"credit\",\"h\":%d,\"free\":%u}",
                   (int)event.handle, (unsigned)event.free_frames);
    return true;
  default:
    return false;
  }
}

enum {
  AUDIO_OP_CREATE = 1,
  AUDIO_OP_DESTROY,
  AUDIO_OP_WRITE,
  AUDIO_OP_PLAY,
  AUDIO_OP_PAUSE,
  AUDIO_OP_STOP,
  AUDIO_OP_VOLUME,
  AUDIO_OP_END,
  AUDIO_OP_POLL,
};

static JSValue audio_operation(JSContext *ctx, JSValueConst this_value,
                               int argc, JSValueConst *argv, int magic) {
  (void)this_value;
  int32_t handle = 0;
  int32_t value = 0;
  switch (magic) {
  case AUDIO_OP_CREATE:
    if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &value))
      return JS_EXCEPTION;
    const uint32_t sample_rate = (uint32_t)value;
    if (!pocket_audio_argument_i32(ctx, argc, argv, 1, &value))
      return JS_EXCEPTION;
    return JS_NewInt32(ctx, create_stream(sample_rate, (uint32_t)value));
  case AUDIO_OP_DESTROY:
    if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &handle))
      return JS_EXCEPTION;
    destroy_stream(handle);
    return JS_UNDEFINED;
  case AUDIO_OP_WRITE: {
    if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &handle))
      return JS_EXCEPTION;
    size_t bytes = 0;
    uint8_t *pcm = NULL;
    if (!pocket_audio_argument_buffer(ctx, argc, argv, 1, &pcm, &bytes))
      return JS_EXCEPTION;
    return JS_NewInt32(ctx, write_pcm(handle, pcm, bytes));
  }
  case AUDIO_OP_PLAY:
    if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &handle))
      return JS_EXCEPTION;
    play_stream(handle);
    return JS_UNDEFINED;
  case AUDIO_OP_PAUSE:
    if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &handle))
      return JS_EXCEPTION;
    pause_stream(handle);
    return JS_UNDEFINED;
  case AUDIO_OP_STOP:
    if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &handle))
      return JS_EXCEPTION;
    stop_stream(handle);
    return JS_UNDEFINED;
  case AUDIO_OP_VOLUME: {
    if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &handle))
      return JS_EXCEPTION;
    double volume = 0.0;
    if (!pocket_audio_argument_f64(ctx, argc, argv, 1, &volume))
      return JS_EXCEPTION;
    set_volume(handle, volume);
    return JS_UNDEFINED;
  }
  case AUDIO_OP_END:
    if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &handle))
      return JS_EXCEPTION;
    end_stream(handle);
    return JS_UNDEFINED;
  case AUDIO_OP_POLL: {
    char line[AUDIO_EVENT_BYTES];
    return poll_event(line, sizeof line) ? JS_NewString(ctx, line)
                                         : JS_UNDEFINED;
  }
  default:
    return JS_UNDEFINED;
  }
}

static void add_operation(JSContext *ctx, JSValue object, const char *name,
                          int arity, int magic) {
  JS_SetPropertyStr(ctx, object, name,
                    JS_NewCFunctionMagic(ctx, audio_operation, name, arity,
                                         JS_CFUNC_generic_magic, magic));
}

esp_err_t pocket_audio_install(JSContext *realm) {
  if (!audio_ready || realm == NULL)
    return ESP_ERR_INVALID_STATE;
  JSValue global = JS_GetGlobalObject(realm);
  JSValue object = JS_NewObject(realm);
  add_operation(realm, object, "createStream", 2, AUDIO_OP_CREATE);
  add_operation(realm, object, "destroyStream", 1, AUDIO_OP_DESTROY);
  add_operation(realm, object, "writePcm", 2, AUDIO_OP_WRITE);
  add_operation(realm, object, "play", 1, AUDIO_OP_PLAY);
  add_operation(realm, object, "pause", 1, AUDIO_OP_PAUSE);
  add_operation(realm, object, "stop", 1, AUDIO_OP_STOP);
  add_operation(realm, object, "setVolume", 2, AUDIO_OP_VOLUME);
  add_operation(realm, object, "endStream", 1, AUDIO_OP_END);
  add_operation(realm, object, "poll", 0, AUDIO_OP_POLL);
  JS_SetPropertyStr(realm, global, "audio", object);
  const bool failed = JS_HasException(realm);
  JS_FreeValue(realm, global);
  return failed ? ESP_ERR_NO_MEM : ESP_OK;
}
