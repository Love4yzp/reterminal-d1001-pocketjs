#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/lock.h>

#include "driver/i2s_std.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

/* One instance per direction. Lifecycle operations and codec controls take
 * owner_lock; PCM calls only pin the channel under the short state spinlock.
 * Never acquire owner_lock from a pinned PCM call. */
typedef struct {
  _lock_t owner_lock;
  portMUX_TYPE state_lock;
  size_t io_users;
  bool ready;
  bool closing;
} audio_lifecycle;

#define AUDIO_LIFECYCLE_INITIALIZER {.state_lock = portMUX_INITIALIZER_UNLOCKED}

static inline bool audio_lifecycle_ready(audio_lifecycle *state) {
  portENTER_CRITICAL(&state->state_lock);
  const bool ready = state->ready && !state->closing;
  portEXIT_CRITICAL(&state->state_lock);
  return ready;
}

static inline void audio_lifecycle_publish(audio_lifecycle *state, bool ready) {
  portENTER_CRITICAL(&state->state_lock);
  state->ready = ready;
  state->closing = !ready;
  portEXIT_CRITICAL(&state->state_lock);
}

static inline bool audio_io_begin(audio_lifecycle *state) {
  portENTER_CRITICAL(&state->state_lock);
  const bool allowed = state->ready && !state->closing;
  if (allowed)
    ++state->io_users;
  portEXIT_CRITICAL(&state->state_lock);
  return allowed;
}

static inline void audio_io_end(audio_lifecycle *state) {
  portENTER_CRITICAL(&state->state_lock);
  --state->io_users;
  portEXIT_CRITICAL(&state->state_lock);
}

/* Called after disabling the channel, with owner_lock held. Pins cover the
 * interval before entry into IDF as well as calls already inside the driver. */
static inline void audio_io_drain(audio_lifecycle *state) {
  for (;;) {
    portENTER_CRITICAL(&state->state_lock);
    const bool idle = state->io_users == 0U;
    portEXIT_CRITICAL(&state->state_lock);
    if (idle)
      return;
    vTaskDelay(1);
  }
}

/* A caller preempted just before entering IDF can resume after disable. Bound
 * each driver wait so it can observe closing without an unbounded semaphore
 * wait on the disabled channel. The public timeout is an overall budget. */
static inline esp_err_t audio_io_transfer(audio_lifecycle *state,
                                          i2s_chan_handle_t channel,
                                          void *buffer, size_t bytes,
                                          size_t *transferred,
                                          uint32_t timeout_ms, bool receive) {
  const int64_t deadline = esp_timer_get_time() + (int64_t)timeout_ms * 1000;
  *transferred = 0U;
  while (*transferred < bytes) {
    if (!audio_lifecycle_ready(state))
      return ESP_ERR_INVALID_STATE;
    const int64_t remaining = deadline - esp_timer_get_time();
    uint32_t wait_ms =
        remaining > 0 ? (uint32_t)((remaining + 999) / 1000) : 0U;
    if (wait_ms > 20U)
      wait_ms = 20U;
    size_t chunk = bytes - *transferred;
    if (chunk > 1024U)
      chunk = 1024U;
    size_t done = 0U;
    uint8_t *cursor = (uint8_t *)buffer + *transferred;
    const esp_err_t err =
        receive ? i2s_channel_read(channel, cursor, chunk, &done, wait_ms)
                : i2s_channel_write(channel, cursor, chunk, &done, wait_ms);
    *transferred += done;
    if (!audio_lifecycle_ready(state))
      return ESP_ERR_INVALID_STATE;
    /* IDF also reports a busy read/write semaphore as INVALID_STATE. Closing
     * was checked above; while ready, retry contention within our budget. */
    if (err != ESP_OK && err != ESP_ERR_TIMEOUT && err != ESP_ERR_INVALID_STATE)
      return err;
    if (*transferred == bytes)
      return ESP_OK;
    /* Zero timeout polls all immediately available chunks without waiting. */
    if (timeout_ms == 0U) {
      if (err != ESP_OK || done == 0U)
        return ESP_ERR_TIMEOUT;
      continue;
    }
    if (esp_timer_get_time() >= deadline)
      return ESP_ERR_TIMEOUT;
  }
  return ESP_OK;
}
