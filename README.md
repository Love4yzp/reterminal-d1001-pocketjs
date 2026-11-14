# PocketJS for reTerminal D1001

![PocketJS](https://img.shields.io/badge/PocketJS-0.16.0-0ea5e9)
![ESP-IDF](https://img.shields.io/badge/ESP--IDF-6.2-E7352C)
![Target](https://img.shields.io/badge/Target-ESP32--P4%20%7C%20reTerminal%20D1001-22c55e)
![Runtime](https://img.shields.io/badge/Runtime-QuickJS--ng%200.14.0-f59e0b)
![License](https://img.shields.io/badge/License-MIT-64748b)

**English** | [简体中文](README.zh-CN.md)

PocketJS app runtime and ESP-IDF host firmware for the Seeed reTerminal D1001 (ESP32-P4 + 8" 800×1280 JD9365 MIPI-DSI touchscreen). Applications are written in TypeScript and SolidJS, compiled to `quickjs-ng 0.14.0` bytecode, verified in the local WASM host, and pushed to the device over USB or Wi-Fi without LVGL, Qt, or a Linux/WebView stack.

## Showcase

Screenshots below are rendered by the repository's built-in WASM host using the same `@pocketjs/framework` + `solid-js` pipeline as the ESP32-P4 firmware (`400×640` portrait / `640×400` landscape logical viewports at `rasterDensity: 2`, driving the `800×1280` / `1280×800` panel).

### Portrait (`400×640` logical)

| [`apps/ha-panel`](apps/ha-panel) — Smart Home Panel | [`apps/showroom-ha-panel`](apps/showroom-ha-panel) — RGB Color Wheel | [`apps/field-ops-panel`](apps/field-ops-panel) — ESS Microgrid Ops |
| :---: | :---: | :---: |
| ![ha-panel portrait home](docs/assets/showcase/ha-panel-portrait-home.png) | ![showroom-ha-panel portrait color wheel](docs/assets/showcase/showroom-portrait-dimmer.png) | ![field-ops-panel portrait ESS overview](docs/assets/showcase/field-ops-portrait-ess.png) |
| Lighting cards, active dimmer bar, scene actions & bottom nav bar. | Interactive HSV color wheel, power/mode toggles & vertical brightness slider. | SoC gauge, DC bus / cell telemetry, unacked alarm banner & quick actions. |

### Landscape (`640×400` logical)

| [`apps/showroom-ha-panel`](apps/showroom-ha-panel) — Bilingual Home (EN) | [`apps/showroom-ha-panel`](apps/showroom-ha-panel) — System Settings | [`apps/field-ops-panel`](apps/field-ops-panel) — LoRaWAN Gateway |
| :---: | :---: | :---: |
| ![showroom-ha-panel landscape home EN](docs/assets/showcase/showroom-landscape-home-en.png) | ![showroom-ha-panel landscape settings](docs/assets/showcase/showroom-landscape-settings.png) | ![field-ops-panel landscape LoRaWAN](docs/assets/showcase/field-ops-landscape-lorawan.png) |
| CN/EN toggle, battery & USB 5V status (`readPower`), sensor cards & Reachy/arm actions. | Backlight slider, auto-sleep timeout, Wi-Fi/HA status, battery state & portrait return. | Online node ratio, T1000-E tracker count, gateway RSSI & active SOS alert. |

## Architecture & Trade-offs

| Aspect | Implementation | Constraints & Trade-offs |
|---|---|---|
| **UI & Rendering** | `@pocketjs/framework` + `solid-js` (`400×640` / `640×400`, density 2); ESP32-P4 dual-lane PPA and GDMA retained-move drive the `800×1280` RGB565 panel without LVGL. | Full-width rectangular lists use GDMA retained-move; partial-width lists fall back to slower PPA staging bands. |
| **Runtime & Memory** | App bytecode runs on `quickjs-ng 0.14.0` directly over ESP-IDF (8 MiB guest heap, 192 KiB task stack, 144 KiB stack limit); internal DMA display staging uses two buffers totaling ≤ 128 KiB. | No DOM, Node APIs, or Linux syscalls; apps can only call capabilities registered by the host firmware. |
| **Preview & Hot-Push** | Local WASM host renders portrait/landscape PNGs offline; `bun run app:push` writes changed 4 KiB sectors in the `apps` partition (`~3s` typical loop). | Wi-Fi hot-push (`POST /push`) is compiled out by default and requires `sdkconfig.local` opt-in + token; USB push requires `esptool` from ESP-IDF 6.2. |
| **Firmware Boundary** | ESP-IDF owns I2C buses, PCA9535, backlight, GPIO3 `CIRCLE` button arbitration, Wi-Fi preset rotation, and slot-isolated `data.fs` (`/pocket`). Empty/invalid `apps` slots fall back to embedded `apps/worker-http`. | Apps never store Wi-Fi passwords or touch hardware buses directly; device credentials stay in `storage` (`data.fs`) or ignored `sdkconfig.local`. |

## Quick Start

Local WASM previews require only [Bun](https://bun.sh/) (`>= 1.4.4`):

```sh
git submodule update --init third_party/pocketjs
bun install

# Render smoke PNGs in the local WASM host (no device required)
bun run preview --smoke
bun run ops:preview --smoke
bun run showroom:preview --smoke
```

Push an app to a D1001 (requires [ESP-IDF 6.2](docs/build-and-deploy.md#toolchain-requirements) sourced for `esptool` / `idf.py`):

```sh
. ~/esp/esp-idf-6.2/export.sh

# App-only sector-delta push (~3s, no firmware rebuild)
bun run app:push apps/ha-panel
bun run app:push apps/ha-panel --wifi <device-ip>   # requires dev hot-push firmware
```

First-time flashing, partition migration, and firmware builds (requires Rust `1.98.1` with `riscv32imafc-unknown-none-elf`): see [docs/build-and-deploy.md](docs/build-and-deploy.md).

## Development Workflows

The repository supports coding-agent workflows (via `AGENTS.md` and the app-dev skill) as well as standard manual TypeScript development:

| Stage | AI-Assisted Workflow | Manual TypeScript Workflow | Reference / Command |
|---|---|---|---|
| **1. Scaffold & UI** | Point an agent at an existing [`apps/`](apps) template; changes stay bounded by [`pocket.host.json`](programs/reterminal-d1001/pocket.host.json). | Create `apps/<my-app>/pocket.app.json`, `main.tsx` (SolidJS), and optional `worker.ts` (HTTP polling). | [`AGENTS.md`](AGENTS.md), [`SKILL.md`](skills/pocketjs-app-dev/SKILL.md) |
| **2. Fonts & Contract** | Agent updates CJK font subsets if text changed and validates manifest capabilities + flash budget. | Run the font subset script for CJK text, then validate manifest and `apps` partition budget (`7 MiB`). | [`apps/field-ops-panel/fonts/tool.ts`](apps/field-ops-panel/fonts/tool.ts), `bun run pocket check` |
| **3. Local Verification** | Agent runs unit tests and inspects `--smoke` / `--all` WASM screenshots. | Write `*.test.ts` and a WASM preview script to test touch gestures and both orientations offline. | `bun test`, [`tools/ha-panel-preview.ts`](tools/ha-panel-preview.ts) |
| **4. Device Push** | Push app-only PKAP v1 delta updates over USB/Wi-Fi; rebuild firmware only for C/IDF changes. | Compile and flash only the `apps` partition (`0x510000`) via `app:push`. | `bun run app:push apps/<app>`, `idf.py -C programs/reterminal-d1001 flash monitor` |

Manual contract check command:

```sh
bun run pocket check --manifest apps/<my-app>/pocket.app.json \
  --host-config programs/reterminal-d1001/pocket.host.config.ts
```

## Hardware Capabilities & BSP Status

### Registered Host Capabilities (`programs/reterminal-d1001/pocket.host.json`)

| Capability | Provider Component | Hardware / Behavior |
|---|---|---|
| `input.touch`, `input.buttons` | `d1001_board` + `pocket_d1001` | GSL3670 touch (180° mirror + orientation mapping) and GPIO3 `CIRCLE` button (native rotation, screen sleep/wake, 3s restart arbitration). |
| `audio.pcm` | `d1001_audio` (`ES8311`) | I2S0 44.1 kHz stereo speaker playback; PCA9535 P13 amplifier gated only during active streams. |
| `data.fs` | `pocket_fs_esp` | FAT `storage` partition mounted at `/pocket` (`0xC10000`, `0x3F0000` bytes), isolated per app slot; no auto-format. |
| `net.http`, `runtime.worker` | `pocket_http_esp`, `pocket_worker_esp` | Background HTTP worker (`nodes.http: 1`) running independently of the UI tick loop. |
| `system.wifi` | `pocket_wifi_esp` | ESP-Hosted host 3.0.10 + C6 2.3.2 (2.4 GHz), 2 Kconfig presets with automatic failover rotation and `wifi.nextPreset()`. |
| `system.device`, `text.glyphs.baked` | `pocket_device` + host packager | Device backlight/system control and baked density-2 font atlases. |

### Panel Native Bindings & Expanding ESP-IDF BSPs

| Component | Hardware / Interface | Current Status | Notes |
|---|---|---|---|
| [`d1001_power`](platforms/esp-idf/d1001_power/README.md) | `ADC1` ch1/ch2 (`GPIO17`/`GPIO18`), `GPIO15` (BQ25616 `STAT`), PCA9535 `P06` | **Integrated into firmware** (`d1001.readPower()`) | Exposes battery mV/%, USB 5V presence, and `chargeState` (`usb_absent` / `charging` / `usb_idle` / `inconsistent`) with a 2 s cache; used by [`apps/showroom-ha-panel`](apps/showroom-ha-panel). Not a separate key in `pocket.host.json`; board-level RC settling and meter calibration are pending. |
| [`d1001_imu`](platforms/esp-idf/d1001_imu/README.md) | `LSM6DS3TR-C` (`0x6a` on I2C1, `INT1` on `GPIO19`) | **Partially wired** (`d1001.readSensors()`) | `d1001_panel.c` lazily opens the IMU and returns accel/gyro/temperature JSON; `INT1` tap/wake routing and a `pocket.host.json` motion capability are not wired yet. |
| [`d1001_audio`](platforms/esp-idf/d1001_audio/README.md) (RX) | `ES7210` dual-mic (`0x40` on I2C1, I2S1 RX) | **Phase 1 BSP only** | `d1001_audio_input` driver implemented; not yet wired into `pocket_audio` or registered in `pocket.host.json`. |
| [`d1001_camera`](platforms/esp-idf/d1001_camera/README.md) | `SC2356` MIPI-CSI0 (`0x36` on I2C0, 576 Mbps RAW8) | **Phase 1 BSP only** | Linked in `programs/reterminal-d1001` build; not yet wired into `main.c` / `d1001_panel.c` or registered in `pocket.host.json`. |
| Mini-PCIe 4G LTE | Onboard Mini-PCIe cellular slot | **Planned** | No BSP component merged on `main` yet. |

## Repository Overview

| App / Directory | Purpose | Reference |
|---|---|---|
| [`apps/ha-panel`](apps/ha-panel) | Forkable dual-orientation dashboard with virtual/onboard/HA light adapters, dimmer & RTC/SNTP settings | [`README`](apps/ha-panel/README.md) |
| [`apps/field-ops-panel`](apps/field-ops-panel) | Multi-profile industrial template (`ess`/`charger`/`lorawan`), live themes, offline cache lockout & `VirtualList` | [`README`](apps/field-ops-panel/README.md) |
| [`apps/showroom-ha-panel`](apps/showroom-ha-panel) | Bilingual CN/EN console with `audio.pcm` feedback, HSV wheel, `d1001.readPower()` battery/USB badge & slot `data.fs` | [`README`](apps/showroom-ha-panel/README.md) |
| [`apps/worker-http`](apps/worker-http) | Minimal embedded factory fallback app (`runtime.worker` HTTP polling) | [`README`](apps/worker-http/README.md) |
| [`apps/input-test`](apps/input-test) | Touch calibration, GPIO3 `CIRCLE` press & 80-row GDMA scroll self-test | — |
| [`apps/system-test`](apps/system-test) | `data.fs` persistence, 7-color RGB LED, backlight & Wi-Fi scan self-test | — |
| [`apps/hello-d1001`](apps/hello-d1001) | Minimal package for benchmarking `~3s` `app:push` loops | — |
| [`platforms/esp-idf`](platforms/esp-idf) | Native ESP-IDF BSP (`d1001_board`, `d1001_audio`, `d1001_power`, `d1001_imu`, `d1001_camera`) & `pocket_*_esp` drivers | [`d1001_board`](platforms/esp-idf/d1001_board/README.md) |
| [`programs/reterminal-d1001`](programs/reterminal-d1001) | ESP32-P4 host firmware, `partitions.csv`, and [`pocket.host.json`](programs/reterminal-d1001/pocket.host.json) | [Architecture](docs/architecture-and-firmware.md) |
| [`tools`](tools) | `app:push`, partition guards, WASM preview harnesses & mock HTTP servers | [Build & Deploy](docs/build-and-deploy.md) |

## Documentation

| Document | When to Read | Topics Covered |
|---|---|---|
| [`docs/architecture-and-firmware.md`](docs/architecture-and-firmware.md) | Modifying firmware, display, input, or Wi-Fi behavior | Layering rules, PPA/GDMA rendering, GPIO3 & wake arbitration, FAT storage, Wi-Fi preset rotation |
| [`docs/build-and-deploy.md`](docs/build-and-deploy.md) | Building firmware, migrating partitions, or debugging pushes | Toolchain versions, `sdkconfig.local` precedence, `partitions.csv`, serial diagnostics, USB/Wi-Fi hot-push |
| [`AGENTS.md`](AGENTS.md) & [`skills/pocketjs-app-dev/SKILL.md`](skills/pocketjs-app-dev/SKILL.md) | Writing apps or configuring coding agents | Engineering invariants, verification gates, and agent workflows |
