#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define D1001_AUDIO_INPUT_I2C_ADDRESS 0x40U
#define D1001_AUDIO_INPUT_MCLK_HZ 11289600U
#define D1001_AUDIO_INPUT_MCLK_GPIO 29
#define D1001_AUDIO_INPUT_BCLK_GPIO 28
#define D1001_AUDIO_INPUT_WS_GPIO 27
#define D1001_AUDIO_INPUT_DIN_GPIO 26
#define D1001_AUDIO_INPUT_CHANNELS 2U

/** Open the single ES7210/I2S1 RX input at 44100, 22050 or 11025 Hz. */
esp_err_t d1001_audio_input_open(i2c_master_bus_handle_t system_i2c,
                                 uint32_t sample_rate);

/** Read interleaved stereo s16 frames from I2S1 without holding board locks. */
esp_err_t d1001_audio_input_read(int16_t *frames, size_t frame_count,
                                 size_t *frames_read, uint32_t timeout_ms);

void d1001_audio_input_close(void);
bool d1001_audio_input_ready(void);

#ifdef __cplusplus
}
#endif
