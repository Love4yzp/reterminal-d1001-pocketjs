#include "d1001_power_core.h"
#include <limits.h>

bool d1001_power_restore_mv(int adc_mv, uint32_t numerator,
                            uint32_t denominator, uint32_t *mv)
{
    if (!mv || adc_mv < 0 || adc_mv > 3300 || !numerator || !denominator) {
        return false;
    }
    uint64_t restored = ((uint64_t)adc_mv * numerator + denominator / 2U) / denominator;
    if (restored > UINT32_MAX) {
        return false;
    }
    *mv = (uint32_t)restored;
    return true;
}

uint8_t d1001_power_percent(uint32_t battery_mv)
{
    /* Reference BSP knots, 0..100% in 5% increments; interpolate to 1%. */
    static const uint16_t knots[] = {
        3262, 3390, 3467, 3554, 3619, 3659, 3686, 3710, 3731, 3752,
        3774, 3797, 3827, 3855, 3880, 3901, 3915, 3934, 3958, 3978, 4047
    };
    if (battery_mv <= knots[0]) {
        return 0;
    }
    for (size_t i = 1; i < sizeof(knots) / sizeof(knots[0]); ++i) {
        if (battery_mv < knots[i]) {
            return (uint8_t)((i - 1U) * 5U +
                   (battery_mv - knots[i - 1U]) * 5U / (knots[i] - knots[i - 1U]));
        }
    }
    return 100;
}

bool d1001_power_filter(const int *samples, size_t count, int *mv)
{
    if (!samples || !mv || count != 9) {
        return false;
    }
    int min = INT_MAX, max = 0, sum = 0;
    for (size_t i = 0; i < count; ++i) {
        if (samples[i] < 0 || samples[i] > 3300) {
            return false;
        }
        if (samples[i] < min) { min = samples[i]; }
        if (samples[i] > max) { max = samples[i]; }
        sum += samples[i];
    }
    *mv = (sum - min - max + 3) / 7;
    return true;
}

bool d1001_power_compose(uint32_t battery_mv, uint32_t usb_mv,
                         int charge_level, bool previous_usb_present,
                         uint32_t on_mv, uint32_t off_mv,
                         d1001_power_snapshot_t *snapshot)
{
    if (!snapshot || battery_mv > 6600 || usb_mv > 6600 ||
        (charge_level != 0 && charge_level != 1) || !on_mv ||
        on_mv > 6600 || off_mv >= on_mv) {
        return false;
    }
    bool present = previous_usb_present ? usb_mv > off_mv : usb_mv >= on_mv;
    bool low = charge_level == 0;
    *snapshot = (d1001_power_snapshot_t){
        .battery_mv = battery_mv, .usb_mv = usb_mv,
        .battery_percent = d1001_power_percent(battery_mv),
        .usb_present = present, .charge_pin_low = low,
        .charge_state = present ? (low ? D1001_POWER_CHARGING : D1001_POWER_USB_IDLE)
                               : (low ? D1001_POWER_INCONSISTENT : D1001_POWER_USB_ABSENT)
    };
    return true;
}
