# reTerminal D1001 six-axis IMU

Independent ESP32-P4 BSP component for the LSM6DS3TR-C. It uses the board's existing system I2C bus, creates no tasks, and has no PocketJS, orientation, filtering or gesture-policy dependencies.

## Hardware

- LSM6DS3TR-C, 7-bit I2C address `0x6a`, 400 kHz. `WHO_AM_I` must return `0x6a`.
- System I2C1: SDA GPIO20, SCL GPIO21. The board component owns the bus; this component adds only the sensor device.
- INT1 (`6D_INTn`) is a dedicated connection to ESP32-P4 GPIO19 with no PCA9535 or other circuit on the net. INT2 is not connected.
- R129 is an optional 10 kΩ pull-up from INT1 to VDD_3V3, but the schematic marks it not populated. There is no fitted external pull-up or pull-down. The `6D_INTn` name denotes the intended active-low signaling; open explicitly selects active-low, push-pull output (`H_LACTIVE=1`, `PP_OD=0`) while retaining BDU and address auto-increment. GPIO19 therefore uses falling-edge interrupts with internal pulls disabled.

These connections are documented in the [D1001 schematic](https://files.seeedstudio.com/wiki/reTerminal_d10xx/res/reTerminal_D1001_260715.pdf), sheet 9 (`Misc`), and match Seeed BSP commit `5074d3b2f45626b261298e305aaf792036febc5a`.

## API

`include/d1001_imu.h` provides:

- Caller-owned open/close contexts and independent accelerometer/gyroscope ODR and full-scale configuration.
- One 14-byte burst sample covering temperature, gyroscope X/Y/Z and accelerometer X/Y/Z. Acceleration is returned in m/s², angular rate in deg/s and temperature in °C. Open enables BDU and address auto-increment and clears `CTRL3_C.BLE` to guarantee little-endian output.
- Tap configuration through `TAP_CFG`, `TAP_THS_6D`, `INT_DUR2` and the shared `SINGLE_DOUBLE_TAP` bit in `WAKE_UP_THS`.
- Wake-up configuration through `WAKE_UP_THS`, `WAKE_UP_DUR` and the basic-function enable in `TAP_CFG`.
- Decoded tap and wake-up source registers, raw `D6D_SRC` flags, and read-to-clear support for latched events.
- `MD1_CFG` routing for single tap, double tap, wake-up, free-fall and 6D orientation events.
- GPIO19 falling-edge ISR notification with caller-supplied ISR-safe callback and no driver-owned task.

A NULL open configuration selects 104 Hz, +/-2 g and +/-2000 deg/s. Gyroscope ODR `1.6 Hz` is rejected because that setting is accelerometer-only. Accelerometer ODR `1.6 Hz` automatically selects low-power mode through `XL_HM_MODE`; other accelerometer ODRs select high-performance mode. Tap and wake-up thresholds are raw hardware codes: tap is 0..31 with 1 LSB = FS_XL/32; wake-up is 0..63 with 1 LSB = FS_XL/64. Timing fields likewise retain the register units so the BSP does not impose a gesture policy.

Register read-modify-write operations preserve unrelated fields, including 6D settings, wake-up threshold when selecting double tap, and double-tap mode when setting wake-up threshold. `d1001_imu_set_tap_config` writes the shared LIR bit; `d1001_imu_set_wakeup_config` leaves it unchanged.

`d1001_imu_set_int1_route` enables `TAP_CFG.INTERRUPTS_ENABLE` whenever any supported event is routed, including a 6D-only route. It preserves LIR and all other TAP_CFG fields. An empty route clears MD1_CFG but leaves TAP_CFG unchanged, so removing INT1 routes cannot disable the shared basic-event gate used by other detection or routing settings.

```c
d1001_imu imu;
ESP_ERROR_CHECK(d1001_imu_open(board.system_i2c, NULL, &imu));

d1001_imu_sample sample;
ESP_ERROR_CHECK(d1001_imu_read_sample(&imu, &sample));

const d1001_imu_tap_config tap = {
    .z_enabled = true,
    .threshold = 12,
    .shock = 2,
    .quiet = 2,
    .duration = 4,
    .double_tap_enabled = true,
};
ESP_ERROR_CHECK(d1001_imu_set_tap_config(&imu, &tap));

d1001_imu_tap_source source;
ESP_ERROR_CHECK(d1001_imu_read_tap_source(&imu, &source));
```

## INT1 notifications

Configure detection first, then route the desired events and register the callback:

```c
const d1001_imu_int1_route route = {
    .single_tap = true,
    .double_tap = true,
    .wakeup = true,
};
ESP_ERROR_CHECK(d1001_imu_set_int1_route(&imu, &route));
ESP_ERROR_CHECK(d1001_imu_register_int1(
    &imu, D1001_IMU_INT1_GPIO, on_int1, &notification));
```

The callback runs directly in GPIO ISR context. It must only perform ISR-safe notification, such as `xSemaphoreGiveFromISR` or `xTaskNotifyFromISR`; it must never call I2C or any function in this component. The notified task reads `d1001_imu_read_tap_source`, `d1001_imu_read_wakeup_source` and, when routed, `d1001_imu_read_d6d_source` to identify and clear events.

Registration uses the shared GPIO ISR service. `ESP_ERR_INVALID_STATE` from `gpio_install_isr_service(0)` is accepted as "already installed"; the component never uninstalls that global service. Unregister explicitly or pass GPIO `-1` to `d1001_imu_register_int1`. Closing the sensor first removes its own handler and then resets the pin. Neither operation changes `MD1_CFG` or detection settings.

The driver ISR is in IRAM. The caller-owned `d1001_imu` context must remain in internal RAM until unregister/close finishes; registration rejects contexts in PSRAM. If another component installed the shared service with `ESP_INTR_FLAG_IRAM`, the callback and its entire call chain must also be in IRAM, and `callback_arg` plus all data accessed by that chain must be in internal RAM, not PSRAM or flash. The caller is responsible for this callback contract; the driver cannot validate its transitive dependencies. The driver ISR only forwards the notification, without logging, I2C or blocking operations.

With `LIR=1`, an already-active INT1 stays low and produces no new falling edge. After registration, task code should read every routed source once to discard stale latched events: tap, wake-up/free-fall and/or raw 6D as applicable. Apply the same read-to-clear rule after each notification before waiting for the next edge.

## Host tests

The pure C core in `src/d1001_imu_core.c` contains register encoding, little-endian decoding, physical-unit scaling and event-source decoding. It does not include ESP-IDF headers.

```sh
cmake -S platforms/esp-idf/d1001_imu/tests -B .pocket-build/host-tests/d1001-imu
cmake --build .pocket-build/host-tests/d1001-imu
ctest --test-dir .pocket-build/host-tests/d1001-imu --output-on-failure
```

## Integration boundary

`programs/reterminal-d1001` includes this component through `EXTRA_COMPONENT_DIRS`; `pocket_d1001` requires it privately and uses it in place of the legacy IMU driver. The panel lazily opens the sensor on `board.system_i2c` when `readSensors` is first called, returns the existing acceleration/angular-rate/temperature JSON, and closes the sensor during teardown. Failed opens are retried on a later read at least three seconds after the previous failure; reads during that interval return unavailable without another I2C attempt. Teardown clears the open and retry state.

The panel currently uses polling and does not register INT1 notifications. A native consumer owns any notification object and event task; motion/rotation policy remains separate integration work. The IMU component creates no tasks and has no PocketJS dependency.

Host tests do not validate real I2C transactions, sensor timing, physical tap/wake-up detection or GPIO19 interrupt delivery; those require a D1001 device.
