# d1001_power

Independent Phase 1 firmware component for reTerminal D1001 / ESP32-P4 / ESP-IDF 6.2. Owns synchronous ADC1 sampling and GPIO15 input. Creates no task, ISR, I2C device, board, LVGL or PocketJS dependency. Board wiring and app integration are separate work.

## Hardware contract and evidence

Primary sources:

- [Seeed official getting-started resource list](https://wiki.seeedstudio.com/getting_started_with_reterminal_D1001/), also available as [official Markdown](https://github.com/Seeed-Studio/wiki-documents/blob/docusaurus-version/sites/en/docs/Sensor/LCD_Displays/reTerminal_D10xx/getting_started_with_reterminal_D1001.md#resources).
- [Seeed main-board schematic PDF](https://files.seeedstudio.com/wiki/reTerminal_d10xx/res/reTerminal_D1001_260715.pdf): page numbers below are PDF pages, not inferred from the BSP.
- [Reference BSP header](https://github.com/Love4yzp/reTerminal-D1001/blob/5074d3b2f45626b261298e305aaf792036febc5a/components/esp32_p4_re_terminal_d1001/include/esp32_p4_re_terminal_d1001.h#L80) and [reference BSP implementation](https://github.com/Love4yzp/reTerminal-D1001/blob/5074d3b2f45626b261298e305aaf792036febc5a/components/esp32_p4_re_terminal_d1001/src/esp32_p4_re_terminal_d1001.c). This is hardware evidence only; no BSP code/dependency is linked.
- [TI BQ25616 datasheet](https://www.ti.com/lit/ds/symlink/bq25616.pdf), pin functions and section 9.3.8.2 / Table 9-6.
- [ESP32-P4 datasheet supplied by Seeed](https://files.seeedstudio.com/wiki/reTerminal_d10xx/res/Espressif_ESP32-P4NRW32_Datasheet.pdf), section 5.5 / Table 5-6; [IDF ADC calibration guide](https://docs.espressif.com/projects/esp-idf/en/v6.2/esp32p4/api-reference/peripherals/adc/adc_calibration.html).

| Signal | Confirmed schematic/code evidence | Component behavior |
| --- | --- | --- |
| Battery | Schematic p1: READ_VBAT → GPIO18; p2: Q9 CJ3407 + Q10 BSS138, EN_READ_VBAT; p1/p9: EXP_GPO6 → U27 PCA9535 P06. BSP header: ADC1 channel 2, mask `1U << 6`; BSP line 1415 enables with high. | Callback `true` must drive P6 high; `false` low. No charge-enable control. |
| Battery divider | p2: R19/R21 = 10 kΩ each, 1%; C69 = 10 nF to ground. R121/R122 = 100 kΩ in switching circuit. | Calibrated pin mV × 2. Nominal battery 4.2 V → pin 2.1 V. |
| USB | p1: PWR_IN_VOLT → GPIO17; p7: TYPEC_5V after F1/FB4 → R72 5.1 kΩ → ADC node, R131 5.1 kΩ to ground, both 1%; C19 100 nF. BSP header confirms ADC1 channel 1; task lines 1090–1091 multiply both ADC readings by 2. | Pin mV × 2. Detects voltage on this rail, not USB enumeration, cable identity, current capability or guaranteed external source direction (e.g. OTG). |
| Charge | p2: U16 BQ25616 STAT pin 5 → CHARGE_STATE; p1: GPIO15. No discrete STAT pull-up shown on p2; reference BSP enables internal pull-up, disables pull-down and reads low as charging (lines 1038–1043 / 1178–1185). | Input with internal pull-up, no ISR. Preserve raw low/high and combine with USB presence. |
| ADC | Local IDF 6.2 `components/soc/esp32p4/include/soc/adc_channel.h` confirms GPIO17/18 channels 1/2; `components/esp_adc/esp32p4/include/adc_cali_schemes.h` enables curve fitting. Reference BSP uses 12-bit / 12 dB and per-channel curve-fitting handles. P4 datasheet ATTEN3 calibrated range is 0–3300 mV. | Uses same attenuation/bit width, requires successful per-channel calibration. No hard-coded Vref or raw/4095 × 3.3 V fallback. Calibrated mV must be 0–3300; raw full-scale saturation is an error. |

The voltage-to-percent knots in the reference BSP (lines 95–98) represent 0..100% in 5% increments:

```text
3262 3390 3467 3554 3619 3659 3686 3710 3731 3752 3774
3797 3827 3855 3880 3901 3915 3934 3958 3978 4047 mV
```

This component interpolates each segment to integer 1% resolution and clamps outside the endpoints. The reference UI additionally quantizes to 5%; that UI policy is not used. The table reaches 100% at 4047 mV, not 4200 mV. It is an estimate from reference code, not a measured SOC curve for the installed cell; battery absence cannot be determined from a zero reading alone. No capacity, battery-health or coulomb-count claim is made.

## Chosen policies, not measured hardware guarantees

- Battery divider nominal Thevenin RC: `(10k || 10k) × 10nF = 50 µs`; USB: `(5.1k || 5.1k) × 100nF = 255 µs`. These calculations exclude MOSFET gate delays, source impedance, ADC loading and component variation. `settle_ms` defaults to 10 ms (allowed 1..1000), with an extra scheduler tick to ensure a minimum delay. This needs measurement on the board.
- Default USB hysteresis uses restored rail voltage: absent → present at **≥4400 mV**, present → absent at **≤4000 mV**. Inside the band, retain the last successful read's state; initial state is absent. Thresholds are configurable. The reference BSP uses >4000 mV for its main USB branch but has no equivalent hysteresis contract.
- Each read enables the divider, waits, discards the first conversion per channel, takes nine calibrated readings per channel, removes one minimum and maximum, then averages seven. Invalid/saturated samples fail the whole read rather than fabricating a clamped voltage. There is no poll-rate-dependent history filter.
- GPIO15 is sampled before and after the ADC burst; a detected change returns `ESP_ERR_INVALID_RESPONSE`. This is not fault blink detection or a guarantee that no transition occurred between observations.

| USB present | GPIO15 | Snapshot charge state | Meaning |
| --- | --- | --- | --- |
| No | High | `D1001_POWER_USB_ABSENT` | USB rail absent; no active charge indication |
| No | Low | `D1001_POWER_INCONSISTENT` | Inconsistent/transitional indication; no charging claim |
| Yes | Low | `D1001_POWER_CHARGING` | STAT low charging indication at sampling time |
| Yes | High | `D1001_POWER_USB_IDLE` | Not actively indicating charging; full/disabled/sleep/boost cannot be distinguished |

TI explicitly documents STAT as open-drain: low during charging, high at termination **or** charge disable/sleep/boost, and blinking at 1 Hz for charge suspend/faults. A single synchronous snapshot can observe either half of a fault blink. `CHARGING` is an indication, not proof of current flow; none of these states diagnoses a fault or certifies a full battery. Follow-up: characterize blink behavior and, if required, add caller-driven temporal fault interpretation.

## API, ownership and rollback

```c
#include "d1001_power.h"

d1001_power_config_t config = D1001_POWER_CONFIG_DEFAULT();
config.set_bat_adc_enable = my_board_battery_divider_control;
config.control_context = board_context;
esp_err_t err = d1001_power_init(&config);
if (err == ESP_OK) {
    d1001_power_snapshot_t snapshot;
    err = d1001_power_read(&snapshot);
    /* Consume snapshot only when err == ESP_OK. */
}
/* Also call after a failed init. Retry if cleanup returns an error. */
esp_err_t cleanup_err = d1001_power_deinit();
```

The caller supplies the real callback; it must configure P6 output and serialize expander register updates with other board users. It must not reenter this component. A NULL callback means the divider is externally kept enabled; the component cannot turn it off. Callback context must remain valid until successful deinit, including failed-init recovery.

This is a single-instance task-context API. It exclusively owns ADC1 and GPIO15/17/18; coordinate other ADC consumers before init. A permanent lazy libc mutex serializes init/read/deinit, so queued readers cannot race a destroyed handle or deleted mutex. Calls block through callback and settling; do not call from an ISR, scheduler-suspended context or a callback. The lock intentionally remains for the firmware lifetime; there is no per-init lock allocation/deletion race.

Init rejects invalid config and repeated initialization. It first drives the divider off when a callback exists. Every successful resource acquisition is tracked; failed initialization attempts cleanup. A cleanup failure takes precedence in the returned error, leaves the remaining resource flags intact, and requires deinit retry before init can succeed again. GPIO resets occur after ADC release. The component resets its pins rather than restoring a previous owner's configuration.

Read always attempts divider disable, including after a failed enable callback (which might already have affected hardware). A disable failure takes precedence, stops further reads, and requires deinit retry. Otherwise ADC/callback errors propagate. Output and USB hysteresis history are published together only on success; caller-owned snapshots remain valid copies after deinit. Successful deinit releases calibration handles, ADC unit and GPIO state, then clears ownership. It is idempotent; failed deinit preserves cleanup state for retry. No callback is invoked after successful cleanup.

## Files and validation

- `CMakeLists.txt`, `idf_component.yml`: ESP32-P4 target, IDF 6.2 dependency range and strict warnings.
- `include/d1001_power.h`, `include/d1001_power_types.h`: public configuration, synchronous API and snapshot types.
- `src/d1001_power.c`: IDF acquisition, calibrated sampling, lifetime serialization and cleanup.
- `src/d1001_power_core.c`, `src/d1001_power_core.h`: IDF-independent conversion, filtering, curve and state composition.
- `tests/CMakeLists.txt`, `tests/d1001_power_core_test.c`: standalone C11 host tests; assertions remain enabled in Release too.

Host verification:

```sh
cmake -S platforms/esp-idf/d1001_power/tests -B /tmp/d1001-power-host-test -DCMAKE_BUILD_TYPE=Debug
cmake --build /tmp/d1001-power-host-test
ctest --test-dir /tmp/d1001-power-host-test --output-on-failure
```

Tests exercise zero/under/full voltages, all 21 knots, monotonicity, interpolation, overflow/invalid arguments, sample outliers and boundaries, all USB/charge combinations and exact hysteresis thresholds. These tests establish core logic only; IDF error paths/concurrency are not host fault-injection tested.

The temporary `/tmp/d1001-power-idf-check` project registers this directory via `EXTRA_COMPONENT_DIRS`, includes the public header and links init/read/deinit from `app_main`. Build with:

```sh
. "$HOME/esp/esp-idf-6.2/export.sh"
idf.py -C /tmp/d1001-power-idf-check set-target esp32p4 build
```

Both component sources compile with `-Wall -Wextra -Werror`. Validation records are under ignored `.pocket-build/validation/d1001-power/phase1/`. No generated build/config files belong in this component.

**Unverified on hardware:** resistor population/tolerance, measured RC and switch turn-on/off settling, ADC accuracy against a meter, cell-specific voltage/SOC behavior under load/charge/temperature, STAT pull-up level and fault waveform, USB insertion/removal under brownout/OTG, and callback/ADC cleanup failures under real concurrency. Host export, full firmware integration, preview `--all`, flash and 30-second serial/DMA/runner capture are not performed for this isolated Phase 1; flashing and device testing are explicitly out of scope.

Next integration step: provide the existing board's serialized P6 callback, poll from an upper-layer owner at a suitable interval, and validate the hardware measurements before exposing a registered native power capability. App work follows separately.
