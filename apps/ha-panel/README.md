# D1001 Home Assistant panel

A density-2 dashboard with 400x640 portrait and genuinely rearranged 640x400 landscape layouts. Both orientations provide home, lights, read-only sensors and settings; landscape uses left navigation and a horizontal dimmer control area. Weather appears only when a live HA weather entity is available. The app has no IMU card, tilt readout, chip-temperature card, or demonstration weather.

## Run and test

From the repository root:

```sh
bun test apps/ha-panel tools/screen-state.test.ts tools/partitions.test.ts
bun run fonts --check
bun run pocket check --manifest apps/ha-panel/pocket.app.json \
  --host-config programs/reterminal-d1001/pocket.host.config.ts
bun run app:push apps/ha-panel --wifi <device-ip>
```

`model.ts` owns immutable entity and connection state. `navigation.ts`, `dimmer.ts`, `scenes.ts`, `input.ts`, and `settings.ts` contain pure navigation, input, scene, and settings transitions. `devices.ts` is the virtual/onboard/HA adapter boundary, `native.ts` validates host data, `worker.ts` serializes HA network I/O, and `ui/` contains the screens and controls.

## Showroom configuration and front-end seams

`showroom.ts` contains the versioned example configuration. Stable display keys separate UI references from HA entity IDs; virtual, onboard and HA lights share `LightState`. Home sections are limited to four lights, two sensors and three scenes, while full light/sensor lists use fixed-size pages. Configuration validation rejects duplicate keys and dangling references. Labels are local display text, not HA `friendly_name`, so their CJK glyphs enter the existing font subset.

The two virtual lamps and onboard RGB retain local behavior. The legacy HA lamp still requires `lightEntityId` from Kconfig and a live connection; `worker.ts` and `WorkerCommand` remain single-light. Additional HA lights start as `待接入`. A keyed `entity-light` event supplies their snapshots but marks them read-only until a keyed command adapter exists. Sensors start with no value and `待接入`; keyed `sensor` events carry value, freshness status and RTC update time. Live readings become `过期` after `staleAfterSeconds`; a disconnect retains the last value with `离线`. Unknown display keys are ignored.

`scenes.ts` distinguishes local presets from HA scene effects. Local scenes report unavailable members or adapter failure instead of always reporting completion. There is no HA scene command adapter yet, so HA scene activation returns `待接入` without reusing the light command.

`input.ts` defines the logical keyboard/button `InputSource` seam and shared focus intents. A source is optional; settings shows `待接入` when none is installed. Physical keyboard events are not currently supplied by the D1001 host. GPIO3/CIRCLE remains owned by native rotation, screen and restart arbitration and is deliberately not mapped to panel activation.

## Host preview

The preview compiles the real app, boots it in the PocketJS WASM core, replays touch and logical keyboard/button input, and writes 800x1280 portrait PNGs or 1280x800 landscape PNGs. Compilation rejects packages larger than the 7 MiB `apps` partition. The preview uses fixed native fixtures and does not access a device, serial port, or network. Keyed sensor events are explicitly marked `mock` and rendered as `示例`; they are not production readings.

```sh
bun run preview --smoke                       # home screen, portrait and landscape
bun run preview --only=lights,offline-home    # named shots, portrait
bun run preview --only=dimmer --landscape     # named shots, landscape
bun run preview                               # every portrait shot
bun run preview --all                         # every shot in both orientations
```

The WASM core comes from `--wasm=<path>` or `POCKETJS_WASM`; `bun third_party/pocketjs/tools/wasm.ts` builds it. Each run compiles the app once (about 13 s). `--no-build` reuses the package in `.pocket-build/preview/ha-panel` and renders in under a second for a smoke run. `--out=<dir>` chooses the screenshot directory; the default is a new ignored directory under `.pocket-build/validation/dashboard/`. Runs that cover both orientations write `portrait/` and `landscape/` subdirectories. Shot names are the PNG names in `tools/ha-panel-preview-shots.ts`; offline and no-weather variants carry the `offline-` and `no-weather-` prefixes. The shot set covers home, sensors, focus, offline, navigation, scenes, dimmer and settings interactions.

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

`fonts.json` declares the Simplified Chinese fallback glyphs. `theme.ts` owns the design's dark palette and radii. Run `bun run fonts` after editing panel text; it updates `fonts/characters.txt` and rebuilds the subset when the character set changes. Large clock and dimmer numerals are generated SVG outlines, so those sizes do not add full CJK font atlases.

## Mock HA

Run the mock on a host reachable from the device:

```sh
MOCK_HA_TOKEN="replace-with-a-test-token" bun tools/mock-ha.ts
```

It listens on `0.0.0.0:18123`, requires Bearer authentication, and handles the mock light state and turn-on/turn-off services. Logs contain request paths and whitelisted body fields, never the Authorization header or token. Its legacy sensor-post endpoints are not used by this dashboard. The mock does not render the weather-discovery template, so the panel hides weather against this mock.

For an isolated mock run, set `D1001_HA_BASE_URL` to that host and port, use the same test token in `D1001_HA_TOKEN`, set `D1001_HA_LIGHT_ENTITY="light.mock_lamp"`, and enable `D1001_HA_SELFTEST=y`. The self-test is off by default; it exercises onboard RGB once and sends one mock light command after the initial state read.
