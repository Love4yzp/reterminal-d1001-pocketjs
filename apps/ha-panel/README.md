# D1001 Home Assistant panel

A 400x640 logical, density-2 portrait panel with clock, weather, lighting and IMU cards. The weather entity is local demonstration data, marked `演示数据`; its attributes have the shape of a HA weather entity.

## Run and test

```sh
bun test apps/ha-panel
bun run app:push apps/ha-panel --wifi <device-ip>
```

`model.ts` owns immutable state transitions, `color.ts` HSV/brightness conversion, `ha-request.ts` HTTP construction and `protocol.ts` fixed-record messages. `devices.ts` is the virtual/onboard/HA adapter boundary, `native.ts` validates native data, `worker.ts` serializes network I/O, and `ui/` contains the cards and gesture controls.

The two virtual lamps and the onboard RGB lamp share `LightState`. HA lights are disabled until an entity is configured. The onboard color API accepts normalized 8-bit channels and scales them to the existing white-balanced LEDC maxima R/G/B=20/8/50; the older boolean board API remains compatible.

## Local configuration

Put panel settings in ignored `programs/reterminal-d1001/sdkconfig.local`:

```ini
CONFIG_D1001_TIMEZONE="CST-8"
CONFIG_D1001_HA_BASE_URL="http://host:8123"
CONFIG_D1001_HA_TOKEN="replace-with-a-local-long-lived-token"
CONFIG_D1001_HA_LIGHT_ENTITY="light.example"
```

Empty base URL/token disables HA HTTP activity and displays `HA 未连接`; local lamps, RTC and IMU continue to work. The token exists only in the generated configuration and in-memory worker messages. Do not log it or commit any generated sdkconfig file. Existing `sdkconfig` takes precedence over defaults; see the root README before rebuilding after a local configuration change.

`D1001_SNTP_SERVER` defaults to `pool.ntp.org`. The PCF8563 stores UTC. When the station is online, the panel starts SNTP and writes a successful synchronization back to the RTC. `D1001_TIMEZONE` accepts a POSIX TZ value and defaults to `CST-8`, so the clock and date display UTC+8 without altering the stored RTC epoch. Other timezones can be set locally; no credentials belong in this setting.

`fonts.json` declares the Simplified Chinese fallback glyphs. `theme.ts` owns the Home Assistant dark palette and radii. Run `bun tools/ha-panel-fonts.ts --check` after editing panel text; regenerate the font subset according to `fonts/README.md` when new characters appear.

The IMU is LSM6DS3 at I2C1 address 0x6a. Acceleration is reported in m/s², angular rate in °/s, and the chip temperature in °C. Its temperature is marked `芯片温度，高于室温`, not ambient temperature. No ambient-light sensor is shown because the Seeed reference does not establish one.

## Mock HA

Run the mock on a host reachable from the device:

```sh
MOCK_HA_TOKEN="replace-with-a-test-token" bun tools/mock-ha.ts
```

It listens on `0.0.0.0:18123`, requires Bearer authentication, and handles `/api/states/light.mock_lamp`, `/api/services/light/turn_on`, `/api/services/light/turn_off`, and the seven `/api/states/sensor.d1001_*` posts. Logs contain request paths and whitelisted body fields, never the Authorization header or token.

For an isolated mock run, set `D1001_HA_BASE_URL` to that host and port, use the same test token in `D1001_HA_TOKEN`, set `D1001_HA_LIGHT_ENTITY="light.mock_lamp"`, and enable `D1001_HA_SELFTEST=y`. The self-test is off by default; it exercises onboard RGB once, changes hue once, and sends one mock light command after the initial state read. Sensor reports are sent every 30 seconds while HA is configured and a valid IMU sample exists.

Temperature reports use HA's `temperature` device class. Acceleration and gyroscope reports include `device_class: null` because HA has no matching standard class; all reports carry units and a friendly name.
