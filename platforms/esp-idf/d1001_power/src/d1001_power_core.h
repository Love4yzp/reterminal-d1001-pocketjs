#pragma once
#include <stddef.h>
#include "d1001_power_types.h"

/* All return false for bad pointers/ranges without changing output. */
bool d1001_power_restore_mv(int adc_mv, uint32_t numerator,
                            uint32_t denominator, uint32_t *mv);
uint8_t d1001_power_percent(uint32_t battery_mv);
/* Nine calibrated mV samples, discard min/max then average seven. */
bool d1001_power_filter(const int *samples, size_t count, int *mv);
bool d1001_power_compose(uint32_t battery_mv, uint32_t usb_mv,
                         int charge_level, bool previous_usb_present,
                         uint32_t on_mv, uint32_t off_mv,
                         d1001_power_snapshot_t *snapshot);
