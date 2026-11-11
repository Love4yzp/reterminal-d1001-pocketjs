# D1001 Home Assistant panel

App id: `dev.pocket-nexus.d1001.showroom-ha-panel`.

The density-2 app provides a 400x640 portrait console and a genuinely rearranged 640x400 landscape console. Home contains the main HA light, temperature/humidity/weather, six Reachy actions and live telemetry. The light list, read-only environment pages, dimmer and settings remain available. There are no scene cards, local scene presets, IMU cards or invented weather readings.

## Run and test

From the repository root:

```sh
bun test apps/showroom-ha-panel tools/screen-state.test.ts tools/partitions.test.ts
bun run showroom:fonts --check
bun run pocket check --manifest apps/showroom-ha-panel/pocket.app.json \
  --host-config programs/reterminal-d1001/pocket.host.config.ts
bun run pocket host export --config programs/reterminal-d1001/pocket.host.config.ts \
  --out .pocket-build/host-export/reterminal-d1001
```

`model.ts` owns immutable entity, pending, error and connection state. `showroom.ts` validates stable display keys and the public example map. `console.ts` shares command coalescing and dimmer behavior. `ha-request.ts` builds requests, `ha-engine.ts` routes them, and `worker.ts` owns network I/O. `native.ts` reads the existing local/native configuration. `ui/` contains both orientations.

## Console behavior

Tapping the main light card switches power; long-pressing it opens the existing dimmer with a continuous brightness slider and continuous hue and saturation tracks; it has no fixed color swatches. The app UI is touch-only in both orientations. There is no home brightness, RGB or color-temperature preset grid. `light.turn_off` sends only `entity_id`. Explicit `light.turn_on` commands use `brightness_pct`, `rgb_color` or `color_temp_kelvin`; RGB and Kelvin are mutually exclusive. The current dimmer sends brightness percentage and RGB values, while the Kelvin payload remains available without adding an artificial preset entry. Rapid changes coalesce per light without mixing color modes. A keyed HA light is writable only after a valid live snapshot. `unavailable`, request failure and pending state stay per entity and do not disconnect other lights or sensors.

The six Reachy slots are:

- `reachy-intro-retail`: 零售讲解
- `reachy-intro-space`: 空间讲解
- `reachy-intro-emergency`: 救灾讲解
- `reachy-wake`: 唤醒
- `reachy-lang-toggle`: 中英切换
- `reachy-stop`: 停止 / STOP

Each maps to a local `input_button` and calls `/api/services/input_button/press`. HTTP success means **已受理**, not that Reachy finished speaking or moving. The separate `reachy-result` sensor supplies the latest execution result. `reachy-agent` supplies online state and `arm-mode` supplies `idle`, `playback` or `gravity`. Dynamic result text is reduced to known labels or bounded ASCII so it cannot bypass the baked font coverage.

The arm page exposes telemetry by default. `arm-gravity` and `arm-playback` have no public entity mapping and their buttons are hidden until local configuration supplies protected `input_button` entities. Configured actions require a touch long-press; the worker rejects a missing mapping or missing confirmation again. No KeyMesh/MQTT writer exists in this app. The always-visible STOP calls only the existing Reachy stop button; it does not claim to stop or home the arm.

Virtual lamps and onboard RGB remain on the full light list. They are not local scenes and do not appear as fake HA actions on home.

## Local configuration

The committed app is unconfigured. Use the existing ignored `programs/reterminal-d1001/sdkconfig.local` for a basic local deployment:

```ini
CONFIG_D1001_TIMEZONE="CST-8"
CONFIG_D1001_HA_BASE_URL="http://host:8123"
CONFIG_D1001_HA_TOKEN="replace-with-a-local-long-lived-token"
CONFIG_D1001_HA_LIGHT_ENTITY="edidt.replace_with_local_main_light"
```

`LOCAL_HA_CONFIG` in `local-config.ts` remains the build-time override seam for private deployment tooling; the committed value is `undefined`. Empty base URL/token disables HA HTTP activity. Tokens exist only in generated configuration and in-memory worker messages. Do not log them or commit generated sdkconfig files. Existing `sdkconfig` takes precedence over defaults; see the root README before rebuilding after a local configuration change.

`CONFIG_D1001_HA_LIGHT_ENTITY` is the legacy single-light path. The six actions and telemetry require a keyed `entityMap`. `entity-map.example.json` documents the public map structure: its `example_*` IDs are placeholders, while the `edidt.*` main-light value is non-sensitive structural data. Replace every placeholder with local HA entity IDs.

The map contains `version`, `lights`, `sensors`, `actions` and optional `weather`. Legacy `scenes`, credentials in the map, unknown display keys and wrong domains are rejected. `light.*` and the showroom's `edidt.*` light-compatible entity are accepted; actions accept only `input_button.*`. Arm mappings are optional and empty in the public example.

Current provisioning is limited to ignored local Kconfig values or the private build-time override; the in-app Wi-Fi/HA provisioning pages are placeholders and do not save credentials. Secure provisioning, data.fs migration, partition erasure and readback/token scanning are not implemented by this app.

## Queueing and freshness

The UI sends basic configuration and the entity map through separate 1024-byte `ha-config` and `ha-entity-map` snapshots. Commands use a capacity-8, 1024-byte `ha-commands` ring; events use a capacity-8, 512-byte `ha-events` ring. Light changes debounce for six UI frames per entity, keeping the latest state and compatible request fields.

The engine has independent poll and command lanes. Each lane is serial: a blocked poll does not block a command, while commands execute in queue order. Poll snapshots from an older light revision are discarded. A per-light count suppresses replacement polls until all queued writes for that light finish; the last write triggers an immediate fresh poll. Light/sensor polls are scheduled every 3000 worker ticks, errors retry after 300 ticks, and weather polls every 6000 ticks; the worker tick is 100 ms.

Live sensors and telemetry expire after their configured `staleAfterSeconds`, using RTC time stamped on arrival. A disconnect retains the last value as `离线` and disables writes. Reconnection marks readings pending until fresh data arrives. Light snapshots have equivalent stale handling. Mock readings remain marked `示例` and do not expire. Weather is shown only from a live HA weather entity. Without `entityMap.weather`, the legacy template API discovers the first `weather.*` entity; template access depends on token permissions.

## Touch and native behavior

The app responds only to touch gestures: taps activate ordinary actions, long-press opens the main-light dimmer or confirms protected arm actions, and paging uses the on-screen touch controls. GPIO3/CIRCLE remains entirely native-owned for rotation, screen timeout/wake-swallow and restart arbitration; the app does not map it to panel activation.

The portrait settings `横屏` and landscape `返回竖屏` controls use the existing runtime restart and synchronized touch mapping. Session state preserves lights, the current route and screen timeout. Backlight, auto screen-off, RTC/SNTP, timezone and firmware-version behavior are unchanged. In-app Wi-Fi/HA provisioning pages remain placeholders.

## Host preview and package checks

The preview compiles the real app, boots it in the PocketJS WASM core, replays touch input, verifies emitted worker commands, and writes 800x1280 portrait or 1280x800 landscape PNGs. It uses fixed native fixtures and does not access a device, serial port or network.

```sh
bun run showroom:preview --smoke                       # home screen, portrait and landscape
bun run showroom:preview --only=lights,offline-home    # named shots, portrait
bun run showroom:preview --only=dimmer --landscape     # named shots, landscape
bun run showroom:preview                               # every portrait shot
bun run showroom:preview --all                         # every shot in both orientations
```

The WASM core comes from `--wasm=<path>` or `POCKETJS_WASM`; `bun third_party/pocketjs/tools/wasm.ts` builds it. Each run compiles the app once (about 13 s). `--no-build` reuses the package in `.pocket-build/preview/showroom-ha-panel` and renders in under a second for a smoke run. `--out=<dir>` chooses the screenshot directory; the default is a new ignored directory under `.pocket-build/validation/showroom-dashboard/`. Runs that cover both orientations write `portrait/` and `landscape/` subdirectories. The shot tape covers home, the light list, sensors, continuous dimming, light swiping, Reachy actions, the hidden unconfigured arm actions and a confirmed protected arm action, offline state and settings. `dimmer-color` drags the hue and saturation tracks in each orientation and checks that the last light command turns the light on with the RGB under the finger. Paging and per-entity `unavailable` have unit tests but no preview shot. Offline, no-weather and protected-arm variants carry filename prefixes.

A direct compile and extent check uses:

```sh
bun run pocket compile --manifest apps/showroom-ha-panel/pocket.app.json \
  --host-config programs/reterminal-d1001/pocket.host.config.ts \
  --project-root apps/showroom-ha-panel \
  --outdir .pocket-build/export/showroom-ha-panel \
  --output .pocket-build/export/showroom-ha-panel.pocket
```

Acceptance is `ceil((64 + packageSize)/65536)*65536 <= 0x700000`. The board's two internal-DMA staging buffers remain within their 128 KiB total budget. Generated build trees, screenshots and validation logs stay out of Git.

## Fonts

`fonts.json` declares the Simplified Chinese fallback and `fonts/characters.txt` is generated from source strings, templates and JSX. Run `bun run showroom:fonts` after editing panel text; it updates the character file and deterministically rebuilds the subset when needed. `bun run showroom:fonts --check` and `font-coverage.test.ts` verify that the real font supplies every collected glyph in every active density-2 size/weight atlas. Use the shared 10/12/14 px regular/bold styles for Chinese labels; large clock and dimmer numerals are generated SVG outlines. See `fonts/README.md` for provenance and the underlying fonttools command.

## Mock HA

Run the isolated mock on a host reachable from the device:

```sh
MOCK_HA_TOKEN="replace-with-a-test-token" bun tools/mock-showroom-ha.ts
```

It listens on `0.0.0.0:18123`, requires Bearer authentication and makes no outbound HA, KeyMesh or MQTT calls. It serves the public example lights, environment, weather and telemetry, and accepts light commands and the six button presses. Logs contain paths and whitelisted body fields, never Authorization headers or tokens. Its legacy sensor-post endpoints remain independent of this dashboard.
