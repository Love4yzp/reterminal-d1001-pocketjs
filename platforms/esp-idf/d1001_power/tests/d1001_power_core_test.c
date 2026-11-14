#include "d1001_power_core.h"
#include <assert.h>
#include <limits.h>
#include <stdio.h>
#include <string.h>

static void test_voltage(void)
{
    uint32_t mv = 17;
    assert(d1001_power_restore_mv(0, 2, 1, &mv) && mv == 0);
    assert(d1001_power_restore_mv(2100, 2, 1, &mv) && mv == 4200);
    assert(d1001_power_restore_mv(2500, 2, 1, &mv) && mv == 5000);
    assert(d1001_power_restore_mv(3300, 2, 1, &mv) && mv == 6600);
    assert(d1001_power_restore_mv(1001, 3, 2, &mv) && mv == 1502);
    mv = 17;
    assert(!d1001_power_restore_mv(-1, 2, 1, &mv) && mv == 17);
    assert(!d1001_power_restore_mv(3301, 2, 1, &mv) && mv == 17);
    assert(!d1001_power_restore_mv(INT_MAX, 2, 1, &mv));
    assert(!d1001_power_restore_mv(3300, UINT32_MAX, 1, &mv) && mv == 17);
    assert(!d1001_power_restore_mv(1, 0, 1, &mv));
    assert(!d1001_power_restore_mv(1, 2, 0, &mv));
    assert(!d1001_power_restore_mv(1, 2, 1, NULL));
}

static void test_percent(void)
{
    const uint32_t knots[] = {
        3262, 3390, 3467, 3554, 3619, 3659, 3686, 3710, 3731, 3752,
        3774, 3797, 3827, 3855, 3880, 3901, 3915, 3934, 3958, 3978, 4047
    };
    assert(d1001_power_percent(0) == 0);
    assert(d1001_power_percent(3000) == 0);
    for (size_t i = 0; i < sizeof(knots) / sizeof(knots[0]); ++i) {
        assert(d1001_power_percent(knots[i]) == i * 5);
    }
    assert(d1001_power_percent(3326) == 2);
    assert(d1001_power_percent(4046) == 99);
    assert(d1001_power_percent(4200) == 100);
    assert(d1001_power_percent(UINT32_MAX) == 100);
    for (uint32_t mv = 1; mv <= 6600; ++mv) {
        assert(d1001_power_percent(mv) >= d1001_power_percent(mv - 1));
        assert(d1001_power_percent(mv) <= 100);
    }
}

static void test_filter(void)
{
    int samples[] = {0, 2100, 2100, 2100, 2100, 2100, 2100, 2100, 3300};
    int mv = -9;
    assert(d1001_power_filter(samples, 9, &mv) && mv == 2100);
    int zeros[9] = {0};
    assert(d1001_power_filter(zeros, 9, &mv) && mv == 0);
    for (size_t i = 0; i < 9; ++i) { samples[i] = 3300; }
    assert(d1001_power_filter(samples, 9, &mv) && mv == 3300);
    mv = -9;
    samples[0] = -1;
    assert(!d1001_power_filter(samples, 9, &mv) && mv == -9);
    samples[0] = 3301;
    assert(!d1001_power_filter(samples, 9, &mv));
    assert(!d1001_power_filter(NULL, 9, &mv));
    assert(!d1001_power_filter(zeros, 0, &mv));
    assert(!d1001_power_filter(zeros, SIZE_MAX, &mv));
    assert(!d1001_power_filter(zeros, 9, NULL));
}

static void test_state(void)
{
    d1001_power_snapshot_t s;
    for (int usb = 0; usb <= 1; ++usb) {
        for (int level = 0; level <= 1; ++level) {
            assert(d1001_power_compose(3774, usb ? 5000 : 0, level,
                                      false, 4400, 4000, &s));
            assert(s.usb_present == (bool)usb);
            assert(s.charge_pin_low == (level == 0));
            assert(s.battery_mv == 3774 && s.battery_percent == 50);
            d1001_power_charge_state_t expected = usb
                ? (level ? D1001_POWER_USB_IDLE : D1001_POWER_CHARGING)
                : (level ? D1001_POWER_USB_ABSENT : D1001_POWER_INCONSISTENT);
            assert(s.charge_state == expected);
        }
    }
    assert(d1001_power_compose(0, 4399, 1, false, 4400, 4000, &s) && !s.usb_present);
    assert(d1001_power_compose(0, 4400, 1, false, 4400, 4000, &s) && s.usb_present);
    assert(d1001_power_compose(0, 4200, 1, true, 4400, 4000, &s) && s.usb_present);
    assert(d1001_power_compose(0, 4200, 1, false, 4400, 4000, &s) && !s.usb_present);
    assert(d1001_power_compose(0, 4001, 1, true, 4400, 4000, &s) && s.usb_present);
    assert(d1001_power_compose(0, 4000, 1, true, 4400, 4000, &s) && !s.usb_present);
    d1001_power_snapshot_t before = s;
    assert(!d1001_power_compose(6601, 0, 1, false, 4400, 4000, &s));
    assert(!d1001_power_compose(0, 6601, 1, false, 4400, 4000, &s));
    assert(!d1001_power_compose(0, 0, -1, false, 4400, 4000, &s));
    assert(!d1001_power_compose(0, 0, 2, false, 4400, 4000, &s));
    assert(!d1001_power_compose(0, 0, 1, false, 0, 0, &s));
    assert(!d1001_power_compose(0, 0, 1, false, 6601, 4000, &s));
    assert(!d1001_power_compose(0, 0, 1, false, 4400, 4400, &s));
    assert(!d1001_power_compose(0, 0, 1, false, 4400, 4401, &s));
    assert(!d1001_power_compose(0, 0, 1, false, 4400, 4000, NULL));
    assert(memcmp(&s, &before, sizeof(s)) == 0);
}

int main(void)
{
    test_voltage();
    test_percent();
    test_filter();
    test_state();
    puts("d1001_power_core: all checks passed");
    return 0;
}
