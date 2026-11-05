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

The application is `apps/hello-d1001`; its package is embedded by `pocketjs_compile_app`. The partition table retains the 4 MiB `apps` data partition for later milestones.

## Flash and monitor

Identify the chip before writing flash, then use the confirmed serial port:

```sh
esptool --port /dev/ttyACM0 chip_id
esptool --port /dev/ttyACM0 flash_id
idf.py -C programs/reterminal-d1001 -p /dev/ttyACM0 flash monitor
```

Runtime logs report the largest internal DMA heap block and runner frame statistics every five seconds.
