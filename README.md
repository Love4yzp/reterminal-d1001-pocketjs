# PocketJS for reTerminal D1001

PocketJS firmware for the Seeed reTerminal D1001: ESP32-P4 and an 800x1280 JD9365 MIPI-DSI panel. Applications use a 400x640 logical viewport and render an 800x1280 RGB565 raster at density 2, presented at DPI scale 1.

The board component owns the I2C buses, PCA9535, panel power/reset, DPI panel and backlight. It has no LVGL dependency and creates no tasks. PocketJS is a read-only submodule; QuickJS guests use quickjs-ng 0.14.0.

## Requirements

- Bun 1.4.4 through mise
- Rust 1.98.1 with `riscv32imafc-unknown-none-elf`
- ESP-IDF 6.2 at commit `188e3e55bb20505b5fa9dc49ee390bf42c58b4ee`, with the `esp32p4` tools installed

## Build

```sh
git submodule update --init third_party/pocketjs
bun install
bun run pocket host export --config programs/reterminal-d1001/pocket.host.config.ts --out .pocket-build/programs/reterminal-d1001/profile
. ~/esp/esp-idf-6.2/export.sh
idf.py -C programs/reterminal-d1001 set-target esp32p4
idf.py -C programs/reterminal-d1001 build
```

An existing `programs/reterminal-d1001/sdkconfig` is loaded after `SDKCONFIG_DEFAULTS` and overrides values from `sdkconfig.local`. After changing local settings, move the existing file aside before rebuilding, for example `mv programs/reterminal-d1001/sdkconfig .pocket-build/sdkconfig.previous`. Both locations are ignored by Git.

The embedded application is `apps/worker-http`; `apps/system-test`, `apps/input-test` and `apps/hello-d1001` remain system, input and minimal development-loop examples. The selected app is compiled with `pocketjs_compile_app`. The partition table retains the 4 MiB `apps` data partition for installed packages.

## Flash and monitor

Identify the chip before writing flash, then use the confirmed serial port:

```sh
esptool --port /dev/ttyACM0 chip_id
esptool --port /dev/ttyACM0 flash_id
idf.py -C programs/reterminal-d1001 -p /dev/ttyACM0 flash monitor
```

Runtime logs report the largest internal DMA heap block and runner frame statistics every five seconds. `high_res_even_pairs_different` counts unequal horizontally adjacent pixels, proving native-resolution rendering instead of 2x2 replication. Move counters include pixel volume and aggregate/max duration for scroll profiling.

## App development loop (M2)

With the ESP-IDF environment exported, compile and push an app without rebuilding or reflashing the firmware:

```sh
. ~/esp/esp-idf-6.2/export.sh
time bun run app:push apps/hello-d1001
```

`app:push` compiles against this program's host config, wraps the package in a PKAP v1 header and writes only the `apps` partition at 0x810000 through esptool. It overlaps the esptool connection with compilation, uses the previous image for verified sector-delta writes and hard-resets the P4. It does not call `idf.py`. `D1001_PORT` overrides the default `/dev/ttyACM0`. Resource changes are often under 3 seconds, but density-2 font baking has produced 3.1-second pushes; expect about 3.2–3.3 seconds for text/code changes. If the cached previous image does not match the partition, verification rejects the delta write and esptool rewrites the whole image.

At boot the firmware memory-maps the `apps` partition and admits the first package with `pocket_idf_package_open`. Logs identify `source=apps` with the package slot, size and hash. An empty, damaged or incompatible slot falls back to the embedded app with `source=embedded` and a reason. Edit `apps/hello-d1001/block.svg` for a color-only iteration; its resource changes leave the app bytecode unchanged.

## Input and scroll self-test (M3)

Push `apps/input-test` to exercise the touch panel, side button and retained-move list:

```sh
bun run app:push apps/input-test
```

The app counts contact hits in four corners and the centre, counts GPIO3/CIRCLE presses and automatically scrolls an 80-row virtual list in both directions. The full-width rectangular list uses the stock GDMA retained-move path; narrow partial-width lists use slower PPA staging bands. Firmware logs include raw, mirrored physical and logical touch coordinates, runner statistics, DMA heap and display-move counters/timings. Calibration follows Seeed's `swap_xy=0, mirror_x=1, mirror_y=1`, followed by 0.5 scaling to the logical viewport; see `platforms/esp-idf/d1001_board/README.md`. Physical touch and button hits require validation by a user with the device.

## System services self-test (M4)

```sh
bun run app:push apps/system-test
```

The app reads `counter.json` through `data.fs`, increments and writes it on every boot, cycles seven color combinations through the standard `led-r`/`led-g`/`led-b` switches, demonstrates backlight 100→25→100 percent and requests a Wi-Fi scan without joining a network. The FAT `storage` partition mounts at `/pocket`; the driver never formats it automatically, so a new partition requires explicit provisioning before use. Board logs report the requested RGB states and LEDC duties; a user must check that all seven physical LED colors match the on-screen labels.

No credentials are committed. `sdkconfig.local` is ignored for local configuration. When `CONFIG_D1001_WIFI_SSID` is non-empty, the firmware sets the STA configuration with `CONFIG_D1001_WIFI_PASSWORD` and joins that network; disconnects reconnect with exponential backoff from 1 to 30 seconds. Wi-Fi configuration uses RAM storage. Empty SSID preserves scan/status and the C6's existing connection behavior. Logs include only the SSID, IP address and RSSI, never the password. Hosted host 3.0.10 is back-compatible with 2.x coprocessors under the upstream migration table. The firmware reads and logs the existing C6 version; an unverified newer major version stops Wi-Fi before `esp_wifi_init`. No Hosted OTA path is called.

## Worker HTTP

```sh
bun run app:push apps/worker-http
```

The app starts a worker with one `http` node, GETs Home Assistant at `http://192.168.77.126:8123/` and retries every five seconds until the STA is online. HTTP status, body bytes and errors are sent to the UI through the `progress` channel and printed to serial.

## HA panel

```sh
bun test apps/ha-panel
bun run app:push apps/ha-panel --wifi <device-ip>
```

The panel provides clock/weather/light/IMU cards and virtual, onboard and HA light adapters. HA is disabled without local configuration. See `apps/ha-panel/README.md` for Kconfig settings, RTC/SNTP, sensor units and the authenticated local mock server.

## Development Wi-Fi hot push

The authenticated HTTP endpoint is compiled out by default. To enable it locally, put this in the ignored `programs/reterminal-d1001/sdkconfig.local`:

```ini
CONFIG_D1001_HOT_PUSH=y
CONFIG_D1001_HOT_PUSH_TOKEN="replace-with-local-token"
```

Build with both files, then use the same token in the host environment:

```sh
export SDKCONFIG_DEFAULTS="$PWD/programs/reterminal-d1001/sdkconfig.defaults;$PWD/programs/reterminal-d1001/sdkconfig.local"
idf.py -C programs/reterminal-d1001 set-target esp32p4
idf.py -C programs/reterminal-d1001 -p /dev/ttyACM0 build flash
D1001_WIFI_TOKEN=replace-with-local-token bun run app:push apps/worker-http --wifi <device-ip>
```

The endpoint is `POST /push` on port 8080. It buffers the complete image in PSRAM and validates the PKAP image and package before stopping the runtime or touching flash. Only changed 4 KiB sectors are erased and written, with the header sector written last. Incomplete uploads leave the installed package untouched. Unauthorized requests return 401 with `Connection: close` and explicitly close the session. A successful push restarts only the runtime; it does not reset the P4 or write the C6. The response reports the package size/hash and confirms the runtime restart. Device logs break down receive, validation, flash and restart timings. The station disables Wi-Fi power save; the default TCP window is 16 KiB and the TCP receive mailbox remains at its default size.
