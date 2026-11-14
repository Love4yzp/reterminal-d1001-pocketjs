# Build, Flash, and Hot-Push Guide

This document covers toolchain requirements, ESP-IDF firmware builds, partition migration, serial diagnostics, and USB/Wi-Fi delta hot-push internals.

## Toolchain requirements

- **Bun**: `>= 1.4.4` ([bun.sh](https://bun.sh/))
- **Rust**: `1.98.1` with target `riscv32imafc-unknown-none-elf`
- **ESP-IDF**: `6.2` at commit `188e3e55bb20505b5fa9dc49ee390bf42c58b4ee`, with `esp32p4` tools installed

## Building the firmware

```sh
git submodule update --init third_party/pocketjs
bun install
bun run pocket host export \
  --config programs/reterminal-d1001/pocket.host.config.ts \
  --out .pocket-build/programs/reterminal-d1001/profile
. ~/esp/esp-idf-6.2/export.sh
idf.py -C programs/reterminal-d1001 set-target esp32p4
idf.py -C programs/reterminal-d1001 build
```

### `sdkconfig` and `sdkconfig.local` precedence

An existing `programs/reterminal-d1001/sdkconfig` is loaded after `SDKCONFIG_DEFAULTS` and overrides values from `sdkconfig.local`. After editing local settings, move `sdkconfig` aside before rebuilding:

```sh
mv programs/reterminal-d1001/sdkconfig .pocket-build/sdkconfig.previous
```

Both files are git-ignored.

### Embedded app and flash partition layout

The factory firmware embeds `apps/worker-http` via `pocketjs_compile_app`. [`programs/reterminal-d1001/partitions.csv`](../programs/reterminal-d1001/partitions.csv) defines the layout:

| Partition | Type / SubType | Offset | Size | Notes |
|---|---|---|---|---|
| `factory` | `app` / `factory` | `0x10000` | `5M` | Bootable ESP-IDF host + embedded fallback app |
| `apps` | `data` / `0x40` | `0x510000` | `7M` | Installed PKAP v1 guest app slot |
| `storage` | `data` / `fat` | `0xC10000` | `0x3F0000` | Mounted at `/pocket`; holds per-slot `data.fs` |

## Partition migration

Devices running an older partition layout require a full bootloader, partition-table, and factory-firmware flash rather than an app-only push:

```sh
. ~/esp/esp-idf-6.2/export.sh
idf.py -C programs/reterminal-d1001 -p /dev/ttyACM0 flash
```

This does **not** run `erase_flash`, and it leaves `storage` and the C6 coprocessor untouched. Because no valid package exists at the new `apps` offset (`0x510000`), expect a PKAP rejection log and automatic fallback to the embedded app on first boot; install an app afterwards with `bun run app:push <app-dir>`.

## Flashing and serial diagnostics

Identify the chip before flashing, then flash and monitor:

```sh
esptool --port /dev/ttyACM0 chip_id
esptool --port /dev/ttyACM0 flash_id
idf.py -C programs/reterminal-d1001 -p /dev/ttyACM0 flash monitor
```

Key runtime diagnostics in serial logs:

- **Memory & runner (every 5 s)**: Largest free internal DMA heap block and runner frame statistics.
- **Display & scroll**: Portrait (`800x1280` raster / `400x640` logical) or landscape (`1280x800` / `640x400`), two staging buffers totaling at most 128 KiB, `high_res_even_pairs_different` (confirms native-resolution rendering rather than 2×2 replication), and scroll move counters (pixel volume, aggregate/max duration).
- **Package admission**: `pocket_idf_package_open` logs `source=apps` with slot, size, and hash on valid admission, or `source=embedded` with a reason when `apps` is empty, damaged, or incompatible.
- **Touch coordinates** (when exercising input): Raw, mirrored physical, and orientation-aware logical touch coordinates.

## USB / serial delta hot-push (`app:push`)

With the ESP-IDF environment exported (for `esptool`), compile and push an app without rebuilding or reflashing firmware:

```sh
. ~/esp/esp-idf-6.2/export.sh
time bun run app:push apps/hello-d1001
```

Environment overrides:
- `D1001_PORT`: Overrides the default `/dev/ttyACM0` serial port.
- `D1001_PYTHON`: Points to the ESP-IDF Python executable if the system `python` lacks `esptool`.

### How `app:push` works

1. Compiles the app against `programs/reterminal-d1001/pocket.host.config.ts` and wraps it with a PKAP v1 header (without invoking `idf.py`).
2. Reads the `apps` partition offset and capacity from `partitions.csv` via [`tools/partitions.ts`](../tools/partitions.ts).
3. Overlaps opening the `esptool` serial connection with app compilation, diffs against the cached previous image for sector-delta writes, and hard-resets the ESP32-P4 on completion.
4. Each contiguous changed region is written and hash-checked independently, with the PKAP header region written last.
5. A whole-image MD5 check skips flashing when nothing changed; if the cached image does not match what is on flash, the tool falls back to writing the full image via `esptool`.

Typical push times: resource-only edits (e.g., editing `apps/hello-d1001/block.svg`, which leaves app bytecode unchanged) often complete under 3 seconds; density-2 font baking takes ~3.1 seconds; code/text edits in smaller apps take ~3.2–3.3 seconds.

## Development Wi-Fi hot-push (`POST /push`)

The authenticated HTTP push endpoint is compiled out by default. To enable it in local development builds, add to git-ignored `programs/reterminal-d1001/sdkconfig.local`:

```ini
CONFIG_D1001_HOT_PUSH=y
CONFIG_D1001_HOT_PUSH_TOKEN="replace-with-local-token"
```

Build and flash with both defaults and local config, then push over Wi-Fi using the matching token:

```sh
export SDKCONFIG_DEFAULTS="$PWD/programs/reterminal-d1001/sdkconfig.defaults;$PWD/programs/reterminal-d1001/sdkconfig.local"
idf.py -C programs/reterminal-d1001 set-target esp32p4
idf.py -C programs/reterminal-d1001 -p /dev/ttyACM0 build flash
D1001_WIFI_TOKEN=replace-with-local-token bun run app:push apps/worker-http --wifi <device-ip>
```

### Endpoint behavior and constraints

- **Endpoint**: `POST /push` on port `8080`. Image size is capped at the runtime `apps` partition size.
- **Pre-flash validation**: Buffers the complete image in PSRAM and validates both the PKAP header and package before stopping the JS runtime or touching flash. Logs report total PSRAM, free space before/after allocation, minimum free space, and peak usage.
- **Sector-delta write**: Erases and writes only changed 4 KiB sectors, writing the header sector last. Incomplete uploads leave the installed package untouched.
- **Auth & restart**: Unauthorized requests receive `401` with `Connection: close` and close the session immediately. Valid pushes restart only the JS runtime (no ESP32-P4 reset or C6 touch), return package size/hash, and log receive, validation, flash, and restart timings.
- **Network tuning**: Wi-Fi power save is disabled on the station; the default TCP window is 16 KiB and the TCP receive mailbox uses the default size.
