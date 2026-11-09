# D1001 Home Assistant panel

A density-2 dashboard with a 400x640 portrait layout and a genuinely rearranged 640x400 landscape layout. Landscape uses left navigation, four-column home tiles, two-column lights and settings, and a horizontal dimmer control area; its settings page includes 返回竖屏. Weather appears only when a live HA weather entity is available. The app has no IMU card, tilt readout, chip-temperature card, or demonstration weather.

## Run and test

From the repository root:

```sh
bun test apps/ha-panel tools/screen-state.test.ts tools/partitions.test.ts
bun tools/ha-panel-fonts.ts --check
bun run pocket check --manifest apps/ha-panel/pocket.app.json \
  --host-config programs/reterminal-d1001/pocket.host.config.ts
bun run app:push apps/ha-panel --wifi <device-ip>
```

`model.ts` owns immutable light and connection state. `navigation.ts`, `dimmer.ts`, `scenes.ts`, and `settings.ts` contain the pure navigation, gesture-mapping, batch-scene, and settings transitions. `devices.ts` is the virtual/onboard/HA adapter boundary, `native.ts` validates host data, `worker.ts` serializes HA network I/O, and `ui/` contains the screens and controls.

The two virtual lamps and the onboard RGB lamp share `LightState`. The HA lamp requires a configured entity and a live connection. The onboard color API accepts normalized 8-bit channels and scales them to the existing white-balanced LEDC maxima R/G/B=20/8/50; the older boolean board API remains compatible.

## Host preview

The preview compiles the real app, boots it in the PocketJS WASM core, replays touch gestures, and writes 800x1280 portrait PNGs or 1280x800 landscape PNGs. It uses fixed native fixtures and does not access a device, serial port, or network.

```sh
bun tools/ha-panel-preview.ts --wasm=/path/to/pocketjs.wasm
bun tools/ha-panel-preview.ts --landscape --wasm=/path/to/pocketjs.wasm
```

Use `--no-build` to reuse the package in `.pocket-build/preview/ha-panel`, and `--out=<dir>` to choose the screenshot directory. The default is a new ignored directory under `.pocket-build/validation/dashboard/`. `tools/ha-panel-preview-shots.ts` defines portrait and landscape connected, offline, no-weather, navigation, scene, dimmer, and settings interactions.

`tools/ha-panel-assets.py` generates the icons, display numerals, QR placeholder, and dimmer corner mask. Regenerate them through mise-managed uv:

```sh
mise x uv -- uv run --no-project --with fonttools --with svgelements \
  python tools/ha-panel-assets.py --font /path/to/InterDisplay-Bold.ttf
```

## Local configuration

Put panel settings in ignored `programs/reterminal-d1001/sdkconfig.local`:

```ini
CONFIG_D1001_TIMEZONE="CST-8"
CONFIG_D1001_HA_BASE_URL="http://host:8123"
CONFIG_D1001_HA_TOKEN="replace-with-a-local-long-lived-token"
CONFIG_D1001_HA_LIGHT_ENTITY="light.example"
```

Empty base URL/token disables HA HTTP activity. The remote lamp then displays `未连接 HA`; local lamps, the RTC, and settings continue to work. The token exists only in generated configuration and in-memory worker messages. Do not log it or commit generated sdkconfig files. Existing `sdkconfig` takes precedence over defaults; see the root README before rebuilding after a local configuration change.

The worker reads the configured HA light and uses the HA template API to discover the first `weather.*` entity. A missing entity, malformed response, or failed weather request hides the weather block without changing the HA light connection. Template API access depends on the token's HA permissions.

`D1001_SNTP_SERVER` defaults to `pool.ntp.org`. The PCF8563 stores UTC. When the station is online, the panel starts SNTP and writes a successful synchronization back to the RTC. `D1001_TIMEZONE` accepts a POSIX TZ value and defaults to `CST-8`; the clock and settings display the resulting UTC offset without altering the stored RTC epoch.

The backlight slider calls the existing framework device binding. Auto screen-off choices pass through `ScreenOffControl` to `d1001.setScreenOffSeconds(seconds)`; 30/60/300-second choices and `0` (never) run in the native input task. Touch/button activity resets the timer, waking restores the previous nonzero brightness, and a wake contact is swallowed until release. A GPIO3 short press (after the 350 ms double-click window) and the portrait settings `横屏` button, or the landscape `返回竖屏` button, call `d1001.setLandscape()`; the runtime restarts with synchronized display/touch orientation and `d1001.landscape()` selects the rearranged UI at boot. Before the restart the app writes its lights, current route and screen timeout with `d1001.savePanelState()`; the new realm consumes that snapshot with `d1001.takePanelState()`, so the same tab, dimmer light and local state return. Landscape admission copies the installed package to PSRAM and rewrites the plan viewport to 640x400; the flash copy is untouched, and the embedded portrait fallback is kept if no external package is installed. Native Wi-Fi/HA configuration is read again by the worker. The manifest requires `input.buttons` so the GPIO3/CIRCLE stream is admitted. The about row calls `d1001.firmwareVersion()`, which returns `esp_app_get_description()->version` from the running image, and displays `未知` if the value is unavailable. Wi-Fi and HA provisioning currently open a placeholder only; softAP, a real QR payload, and the configuration web page are not implemented.

## Fonts

`fonts.json` declares the Simplified Chinese fallback glyphs. `theme.ts` owns the design's dark palette and radii. Run `bun tools/ha-panel-fonts.ts` after editing panel text and regenerate the subset according to `fonts/README.md`. Large clock and dimmer numerals are generated SVG outlines, so those sizes do not add full CJK font atlases.

## Mock HA

Run the mock on a host reachable from the device:

```sh
MOCK_HA_TOKEN="replace-with-a-test-token" bun tools/mock-ha.ts
```

It listens on `0.0.0.0:18123`, requires Bearer authentication, and handles the mock light state and turn-on/turn-off services. Logs contain request paths and whitelisted body fields, never the Authorization header or token. Its legacy sensor-post endpoints are not used by this dashboard. The mock does not render the weather-discovery template, so the panel hides weather against this mock.

For an isolated mock run, set `D1001_HA_BASE_URL` to that host and port, use the same test token in `D1001_HA_TOKEN`, set `D1001_HA_LIGHT_ENTITY="light.mock_lamp"`, and enable `D1001_HA_SELFTEST=y`. The self-test is off by default; it exercises onboard RGB once and sends one mock light command after the initial state read.
