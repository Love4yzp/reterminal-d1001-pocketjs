#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "driver/i2c_master.h"
#include "driver/i2s_types.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define D1001_AUDIO_SAMPLE_RATE_HZ 44100U
#define D1001_AUDIO_MCLK_HZ (D1001_AUDIO_SAMPLE_RATE_HZ * 256U)
#define D1001_AUDIO_CHANNELS 2U
#define D1001_AUDIO_I2S_NUM I2S_NUM_0
#define D1001_AUDIO_MCLK_GPIO 33
#define D1001_AUDIO_BCLK_GPIO 32
#define D1001_AUDIO_WS_GPIO 31
#define D1001_AUDIO_DOUT_GPIO 30
#define D1001_AUDIO_I2C_ADDRESS 0x18U
#define D1001_AUDIO_DEFAULT_VOLUME_PERCENT 75U

typedef struct {
  /** Codec master volume 0..100. An omitted config or a value above 100 uses
   *  75; zero is 0% (silent). */
  uint8_t volume_percent;
} d1001_audio_config;

/** Initialize ES8311 on the existing system I2C bus and I2S0 TX. */
esp_err_t d1001_audio_init(i2c_master_bus_handle_t system_i2c,
                           const d1001_audio_config *config);

/** Write interleaved stereo s16 frames with an overall timeout budget in ms.
 * Concurrent deinit cancels with ESP_ERR_INVALID_STATE; partial PCM may have
 * been accepted on error. Task context only. */
esp_err_t d1001_audio_write(const int16_t *frames, size_t frame_count,
                            uint32_t timeout_ms);

esp_err_t d1001_audio_set_mute(bool mute);
esp_err_t d1001_audio_set_volume(uint8_t percent);
/** Unmute/enable the PA for playback, or mute/disable it when idle. */
esp_err_t d1001_audio_set_active(bool active);
/** Close TX only. On cleanup failure, retry before initializing TX again. */
esp_err_t d1001_audio_deinit(void);
bool d1001_audio_ready(void);

#ifdef __cplusplus
}
#endif
