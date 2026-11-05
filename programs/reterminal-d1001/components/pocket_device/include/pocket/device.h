#pragma once

#include "esp_err.h"
#include "quickjs.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Initialize the D1001 backlight and RGB switch state and start the op task. */
esp_err_t pocket_device_setup(void);

/** Install status, setBrightness and setSwitch on globalThis.device. */
esp_err_t pocket_device_install(JSContext *realm);

/** Restore the backlight and turn the RGB LED off after a guest stops. */
void pocket_device_teardown(void);

#ifdef __cplusplus
}
#endif
