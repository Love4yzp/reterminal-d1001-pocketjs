# PocketJS for reTerminal D1001

ESP-IDF firmware, board support, and forkable TypeScript/SolidJS HMI apps for the Seeed reTerminal D1001 (ESP32-P4 + 8" 800×1280 JD9365 MIPI-DSI capacitive touch display).

## Why PocketJS on reTerminal D1001

Building touch HMIs for industrial panels, energy storage cabinets, or EV chargers usually forces a tradeoff between writing C/C++ LVGL/Qt boilerplate or maintaining an Android/Linux + WebView stack. This repository adapts [PocketJS](https://github.com/pocket-nexus/pocketjs) to the D1001 hardware with a strict boundary between native ESP-IDF firmware and portable TypeScript apps:

- **TypeScript + SolidJS UI, native ESP32-P4 rendering**: Author screens and state in `@pocketjs/framework` + `solid-js` (`400×640` portrait / `640×400` landscape logical viewports) while native dual-lane PPA and GDMA retained-move scrolling render density-2 RGB565 graphics at 800×1280 without LVGL.
- **No Linux or WebView overhead**: Guest bytecode runs directly on `quickjs-ng 0.14.0` over ESP-IDF, keeping deterministic cold boot and bounded internal DMA display staging (two buffers totaling at most 128 KiB).
- **Desktop WASM preview & ~3s delta hot-push**: Verify layouts and touch flows in the local WASM preview harness (`bun run ops:preview`, `bun run preview`, `bun run showroom:preview`), then push app-only PKAP v1 delta updates over USB or Wi-Fi in ~3 seconds (`bun run app:push`) without rebuilding firmware.
- **Firmware-owned hardware & safety boundary**: Native ESP-IDF code owns I2C buses, PCA9535, backlight, physical `CIRCLE` button arbitration (rotate / wake / screen power / 3 s restart), touch wake-swallow, Wi-Fi preset rotation, and per-slot `data.fs` isolation. Packages are validated against [`programs/reterminal-d1001/pocket.host.json`](programs/reterminal-d1001/pocket.host.json); an empty or invalid `apps` slot falls back to the embedded app (`apps/worker-http`).

## Quick Start

### 1. Desktop WASM preview (no hardware required)

Requires Bun `1.4.4` (via `mise`); see [the build guide](docs/build-and-deploy.md#toolchain-requirements) for the full firmware toolchain.

```sh
git submodule update --init third_party/pocketjs
bun install

# Render portrait & landscape screenshots in the local WASM host
bun run ops:preview --smoke
bun run preview --smoke
bun run showroom:preview --smoke
```

### 2. Push an app or flash firmware on D1001

With ESP-IDF `6.2` exported (for `esptool` and `idf.py`):

```sh
. ~/esp/esp-idf-6.2/export.sh

# App-only PKAP v1 delta push (~3 s, no firmware rebuild)
bun run app:push apps/field-ops-panel
bun run app:push apps/ha-panel --wifi <device-ip>   # requires dev hot-push build
```

For first-time setup, firmware changes, or migrating from an older partition layout, export the host profile and build/flash the ESP32-P4 firmware:

```sh
bun run pocket host export \
  --config programs/reterminal-d1001/pocket.host.config.ts \
  --out .pocket-build/programs/reterminal-d1001/profile
idf.py -C programs/reterminal-d1001 set-target esp32p4
idf.py -C programs/reterminal-d1001 -p /dev/ttyACM0 build flash monitor
```

See [Build, Flash, and Hot-Push Guide](docs/build-and-deploy.md) for partition migration, `sdkconfig.local` override order, and Wi-Fi `POST /push` setup.

## Applications & Repository Layout

### Apps (`apps/`)

| App | Role | Docs & Preview |
|---|---|---|
| [`apps/field-ops-panel`](apps/field-ops-panel) | Forkable industrial HMI baseline (`ess` / `charger` / `lorawan` profiles, live themes, commit→readback receipts, offline lockout, alarm `VirtualList`) | [`README`](apps/field-ops-panel/README.md) · `bun run ops:preview` |
| [`apps/ha-panel`](apps/ha-panel) | Forkable Home Assistant panel (portrait/landscape layouts, virtual/onboard/HA lights, dimmer, RTC/SNTP settings) | [`README`](apps/ha-panel/README.md) · `bun run preview` |
| [`apps/showroom-ha-panel`](apps/showroom-ha-panel) | Bilingual CN/EN HA showroom console (`audio.pcm` tap sound, slot-local `data.fs` provisioning, color-wheel dimmer, action triggers) | [`README`](apps/showroom-ha-panel/README.md) · `bun run showroom:preview` |
| [`apps/worker-http`](apps/worker-http) | Embedded factory fallback app (`source=embedded`): background HTTP polling via `runtime.worker` | [`README`](apps/worker-http/README.md) |
| [`apps/input-test`](apps/input-test) | Touch calibration, GPIO3 `CIRCLE` press counter, and 80-row GDMA retained-move scroll test | — |
| [`apps/system-test`](apps/system-test) | `data.fs` persistence (`counter.json`), 7-color RGB LED cycle, backlight dimming, and Wi-Fi scan | — |
| [`apps/hello-d1001`](apps/hello-d1001) | Minimal package for verifying `~3s` `app:push` cycles (`block.svg` resource-only edits) | — |

### Platform & Tooling

- [`programs/reterminal-d1001`](programs/reterminal-d1001) — ESP32-P4 host program, [`partitions.csv`](programs/reterminal-d1001/partitions.csv), and [`pocket.host.json`](programs/reterminal-d1001/pocket.host.json)
- [`platforms/esp-idf`](platforms/esp-idf) — Native ESP-IDF components (`d1001_board`, `d1001_audio`, `pocket_fs_esp`, `pocket_http_esp`, `pocket_wifi_esp`, `pocket_worker_esp`, `pocket_hot_push_esp`)
- [`tools`](tools) — `app:push`, partition helpers, WASM preview harnesses, mock servers, and provisioning scripts
- [`third_party/pocketjs`](third_party/pocketjs) — Pinned, read-only PocketJS submodule

### Host Capabilities

- **Registered in [`pocket.host.json`](programs/reterminal-d1001/pocket.host.json)**: `audio.pcm` (ES8311 speaker output), `data.fs`, `input.buttons`, `input.touch`, `net.http`, `runtime.worker`, `system.device`, `system.wifi`, `text.glyphs.baked`.
- **Hardware BSP expansion in progress (not yet registered)**: ES7210 dual-mic capture, SC2356 MIPI-CSI camera, LSM6DS3TR 6-axis IMU, and Mini-PCIe 4G LTE.

## Documentation

- [`docs/architecture-and-firmware.md`](docs/architecture-and-firmware.md) — Layering boundaries, host capability boundary, PPA/GDMA rendering, GPIO3 button & wake arbitration, FAT storage, and Wi-Fi preset rotation policy.
- [`docs/build-and-deploy.md`](docs/build-and-deploy.md) — Toolchain setup, `sdkconfig` override precedence, partition migration, serial diagnostics, and USB / Wi-Fi PKAP v1 delta hot-push internals.
- [`platforms/esp-idf/d1001_board/README.md`](platforms/esp-idf/d1001_board/README.md) — Board bring-up, I2C/PCA9535 ownership, and touch calibration.
- [`AGENTS.md`](AGENTS.md) — Repository boundaries and per-change validation checklist.
