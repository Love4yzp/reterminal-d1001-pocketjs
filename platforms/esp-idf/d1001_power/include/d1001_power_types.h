#pragma once
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    D1001_POWER_USB_ABSENT,
    D1001_POWER_CHARGING,
    D1001_POWER_USB_IDLE, /* USB present, charge pin high; does not prove full. */
    D1001_POWER_INCONSISTENT /* USB absent, charge pin low; transient/fault. */
} d1001_power_charge_state_t;

typedef struct {
    uint32_t battery_mv;
    uint32_t usb_mv;
    uint8_t battery_percent; /* Voltage estimate, not coulomb-counted SOC. */
    bool usb_present;
    bool charge_pin_low;
    d1001_power_charge_state_t charge_state;
} d1001_power_snapshot_t;

#ifdef __cplusplus
}
#endif
