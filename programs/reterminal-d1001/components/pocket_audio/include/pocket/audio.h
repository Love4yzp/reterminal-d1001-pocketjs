#pragma once

#include "driver/i2c_master.h"
#include "esp_err.h"
#include "quickjs.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Initialize ES8311/I2S0 and start the mixer task. Idempotent per app run. */
esp_err_t pocket_audio_setup(i2c_master_bus_handle_t system_i2c);

/** Install the nine audio.pcm ops as globalThis.audio. */
esp_err_t pocket_audio_install(JSContext *realm);

/** Latch mixer facts and credit at the runner tick boundary. */
void pocket_audio_latch(void);

/** Stop the mixer, destroy every stream, mute the codec and disable the PA. */
void pocket_audio_teardown(void);

#ifdef __cplusplus
}
#endif
