# Architecture and Firmware Details

This document covers the firmware/application boundary, host capabilities, display and input arbitration, and Wi-Fi/storage behavior for the Seeed reTerminal D1001 target.

## Layering and boundaries

As defined in [`AGENTS.md`](../AGENTS.md), hardware ownership and application iteration are strictly separated:

1. **Firmware & BSP layer** ([`platforms/esp-idf`](../platforms/esp-idf), [`programs/reterminal-d1001`](../programs/reterminal-d1001)): Owns hardware drivers, input arbitration, Wi-Fi preset management, storage, and native capabilities. Features are implemented, hardware-validated, and registered in [`programs/reterminal-d1001/pocket.host.json`](../programs/reterminal-d1001/pocket.host.json) before apps can consume them.
   - `d1001_board` initializes I2C buses, PCA9535, panel power/reset, the DPI panel, and backlight; it returns handles, creates no tasks, and has no LVGL dependency.
   - Other native components: `d1001_audio`, `pocket_fs_esp`, `pocket_http_esp`, `pocket_wifi_esp`, `pocket_worker_esp`, `pocket_hot_push_esp`.
2. **Guest application layer** (`apps/*`): Apps run inside an isolated `quickjs-ng 0.14.0` realm, declare required capabilities in `pocket.app.json`, and call only registered host capabilities and status APIs. Apps never hold Wi-Fi credentials or access raw hardware buses.
3. **Device data boundary**: Deployment credentials and per-device entity maps live in the `storage` partition (`data.fs` per-slot isolation) or git-ignored `programs/reterminal-d1001/sdkconfig.local`, never inside committed app packages.

### Host capabilities (registered vs. expanding)

- **Registered in [`pocket.host.json`](../programs/reterminal-d1001/pocket.host.json)**:
  `audio.pcm` (ES8311 speaker output), `data.fs`, `input.buttons`, `input.touch`, `net.http`, `runtime.worker`, `system.device`, `system.wifi`, `text.glyphs.baked`.
- **Hardware BSP expansion in progress (not yet registered)**:
  ES7210 dual-mic capture (`audio.capture`), SC2356 MIPI-CSI camera (`camera.qr` / `camera.photo`), LSM6DS3TR 6-axis IMU (`motion` input and tamper/tap-wake sensing), and Mini-PCIe 4G LTE cellular connectivity for Wi-Fi-free deployments.

## Display, touch, and input arbitration (M3)

### Rendering and DMA budget

- **Viewports**: `800×1280` raster / `400×640` logical in portrait; `1280×800` raster / `640×400` logical in landscape. Rendered as density-2 RGB565 presented at DPI scale 1.
- **Compositing & scroll**: Uses native ESP32-P4 dual-lane PPA with two staging buffers totaling at most 128 KiB in internal DMA RAM. Full-width rectangular lists use the stock GDMA retained-move path; narrow partial-width lists use slower PPA staging bands.

### Physical `CIRCLE` button (GPIO3) and touch wake

The native input task delivers raw debounced `CIRCLE` press/release events to apps that request `input.buttons`, while independently arbitrating screen power and orientation:

- **Single short release (< 600 ms)**: Rotates orientation after a 350 ms double-click window.
- **Double short release**: Toggles screen power.
- **1 s hold**: Gives wake feedback.
- **3 s hold**: Logs a reason and restarts. Releasing before 3 s cancels without triggering a short or double action.
- **Touch wake-swallow**: When the screen is off, the first touch wakes the display and is swallowed until release.

### Orientation restart and touch calibration

- **Runtime-only rotation**: Rotating restarts only the JS runtime with a new layout and synchronized touch coordinates. Panels snapshot lights, route, and screen timeout into native RAM before restart and consume the snapshot in the new realm; landscape settings provide a return to portrait.
- **Landscape admission**: Copies the installed package to PSRAM, rewrites its plan viewport to `640×400`, and leaves the flash package untouched.
- **Touch calibration**: Follows Seeed's `swap_xy=0, mirror_x=1, mirror_y=1`, followed by orientation-aware logical mapping. See [`platforms/esp-idf/d1001_board/README.md`](../platforms/esp-idf/d1001_board/README.md).

### Input self-test (`apps/input-test`)

```sh
bun run app:push apps/input-test
```

Counts touch hits in the four corners and center, counts GPIO3/`CIRCLE` presses, and automatically scrolls an 80-row virtual list in both directions. Physical touch and button hits require verification on real hardware; run [`tools/d1001-input-acceptance.sh`](../tools/d1001-input-acceptance.sh) for the guided timeout, wake, button, rotation, and touch acceptance sequence.

## Storage, LEDs, backlight, and Wi-Fi (M4)

### System services self-test (`apps/system-test`)

```sh
bun run app:push apps/system-test
```

On boot, `apps/system-test` reads and increments `counter.json` via `data.fs`, cycles seven color combinations through the standard `led-r` / `led-g` / `led-b` switches, steps backlight brightness `100 → 25 → 100%`, and requests a Wi-Fi scan without joining a network.

- **Storage provisioning**: The FAT `storage` partition mounts at `/pocket`. The driver never formats it automatically, so a blank partition requires explicit provisioning before use.
- **LED validation**: Board logs report requested RGB states and LEDC duties; check on-device that all seven physical LED colors match the on-screen labels.

### Wi-Fi preset rotation and ESP-Hosted compatibility

No Wi-Fi credentials are committed; local settings belong in ignored `programs/reterminal-d1001/sdkconfig.local`:

- **Ordered Kconfig presets**: `CONFIG_D1001_WIFI_SSID` / `CONFIG_D1001_WIFI_PASSWORD` is entry 1; `CONFIG_D1001_WIFI_SSID_2` / `CONFIG_D1001_WIFI_PASSWORD_2` is entry 2 (empty by default). Wi-Fi config uses RAM storage, and the C6 coprocessor is 2.4 GHz only.
- **Empty preset behavior**: Leaving both SSIDs empty preserves scan/status and the C6's existing connection state.
- **Rotation triggers**: The station joins entry 1 first. When entry 2 is also configured, three conditions rotate to the other preset and reset backoff:
  1. Three consecutive `NO_AP_FOUND` or authentication failures.
  2. Three associated disconnects within 120 seconds.
  3. Connected RSSI staying below `CONFIG_D1001_WIFI_WEAK_RSSI` (default `-82` dBm) for 60 continuous seconds.
- **Anti-ping-pong & backoff**: A weak-link rotation blocks another weak-link rotation for 5 minutes, though join failures on the other preset still fall back after three attempts. Other disconnects reconnect with exponential backoff from 1 to 30 seconds.
- **Log redaction**: Firmware logs only SSID, IP address, RSSI, and disconnect reason—never passwords.
- **Guest Wi-Fi API**: `wifi.status()` returns state, SSID, IPv4 address, RSSI (dBm), and 0–3 strength bars. `wifi.nextPreset()` switches to the next configured preset (returning `false` if none is configured) under the existing `system.wifi` capability.
- **ESP-Hosted C6 version check**: Hosted host 3.0.10 is back-compatible with 2.x coprocessors under the upstream migration table. The firmware reads and logs the C6 version; an unverified newer major version stops Wi-Fi before `esp_wifi_init`. No Hosted OTA path is called.

## Embedded fallback and baseline applications

- [`apps/worker-http`](../apps/worker-http/README.md): Embedded factory fallback (`source=embedded`). Runs a worker with one `http` node polling `http://192.168.77.126:8123/` every 5 seconds until STA is online, publishing status, byte count, and errors to the UI `progress` channel and serial console.
- [`apps/field-ops-panel`](../apps/field-ops-panel/README.md): Forkable industrial HMI baseline (`ess` / `charger` / `lorawan` profiles, live themes, commit→readback receipts, offline cache lockout, alarm `VirtualList`).
- [`apps/ha-panel`](../apps/ha-panel/README.md): Forkable Home Assistant panel with virtual/onboard/HA light adapters, dimmer, RTC/SNTP settings, and local mock server.
- [`apps/showroom-ha-panel`](../apps/showroom-ha-panel/README.md): Independent bilingual CN/EN HA showroom console (`dev.pocket-nexus.d1001.showroom-ha-panel`) with tap audio (`audio.pcm`), slot-local `data.fs` provisioning, RGB/HS color-wheel dimmer, and action triggers.
