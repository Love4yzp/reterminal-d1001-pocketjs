# PocketJS for reTerminal D1001

PocketJS firmware for the Seeed reTerminal D1001: ESP32-P4, an 800x1280 JD9365 MIPI-DSI panel, and a 400x640 RGB565 application picture presented at 2x.

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

The embedded application is `apps/input-test`; `apps/hello-d1001` remains the minimal development-loop example. Both are compiled with `pocketjs_compile_app` when selected by the firmware build. The partition table retains the 4 MiB `apps` data partition for installed packages.

## Flash and monitor

Identify the chip before writing flash, then use the confirmed serial port:

```sh
esptool --port /dev/ttyACM0 chip_id
esptool --port /dev/ttyACM0 flash_id
idf.py -C programs/reterminal-d1001 -p /dev/ttyACM0 flash monitor
```

Runtime logs report the largest internal DMA heap block and runner frame statistics every five seconds.

## App development loop (M2)

With the ESP-IDF environment exported, compile and push an app without rebuilding or reflashing the firmware:

```sh
. ~/esp/esp-idf-6.2/export.sh
time bun run app:push apps/hello-d1001
```

`app:push` compiles against this program's host config, wraps the package in a PKAP v1 header and writes only the `apps` partition at 0x810000 through esptool. It overlaps the esptool connection with compilation, uses the previous image for verified sector-delta writes and hard-resets the P4. It does not call `idf.py`. `D1001_PORT` overrides the default `/dev/ttyACM0`.

At boot the firmware memory-maps the `apps` partition and admits the first package with `pocket_idf_package_open`. Logs identify `source=apps` with the package slot, size and hash. An empty, damaged or incompatible slot falls back to the embedded app with `source=embedded` and a reason. Edit `apps/hello-d1001/block.svg` for a color-only iteration; its resource changes leave the app bytecode unchanged.

## Input and scroll self-test (M3)

Push `apps/input-test` to exercise the touch panel, side button and retained-move list:

```sh
bun run app:push apps/input-test
```

The app counts contact hits in four corners and the centre, counts GPIO3/CIRCLE presses and automatically scrolls an 80-row virtual list in both directions. Firmware logs include raw, mirrored physical and logical touch coordinates, runner statistics, DMA heap and successful/unsupported/failed display moves. Calibration follows Seeed's `swap_xy=0, mirror_x=1, mirror_y=1`, followed by 0.5 scaling to the logical viewport; see `platforms/esp-idf/d1001_board/README.md`. Physical touch and button hits require validation by a user with the device.
