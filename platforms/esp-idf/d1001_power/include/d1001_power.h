#pragma once
#include <stddef.h>
#include "esp_err.h"
#include "d1001_power_types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    /* Callback must serialize shared expander RMW, configure P6 as output and
     * map true to high. Must not reenter this component. NULL = externally on. */
    esp_err_t (*set_bat_adc_enable)(void *ctx, bool enable);
    void *control_context;
    uint32_t settle_ms; /* 1..1000; default 10, not a measured RC guarantee. */
    uint32_t usb_on_mv; /* 1..6600, strictly greater than usb_off_mv. */
    uint32_t usb_off_mv;
} d1001_power_config_t;

#define D1001_POWER_CONFIG_DEFAULT() { \
    .set_bat_adc_enable = NULL, .control_context = NULL, \
    .settle_ms = 10, .usb_on_mv = 4400, .usb_off_mv = 4000 }

/* Singleton exclusively owns ADC1 and GPIO15/17/18 while initialized.
 * Task context only. All APIs serialize, including failed-init cleanup.
 * Call deinit after ANY failed init; it may retain resources for retry.
 * Repeated init is INVALID_STATE; repeated successful deinit is OK. */
esp_err_t d1001_power_init(const d1001_power_config_t *config);
/* On error, output and USB hysteresis history remain unchanged. */
esp_err_t d1001_power_read(d1001_power_snapshot_t *snapshot);
/* On failure, sensing stops and cleanup state is retained; retry deinit.
 * The internal libc lock intentionally lives for the process lifetime. */
esp_err_t d1001_power_deinit(void);

#ifdef __cplusplus
}
#endif
