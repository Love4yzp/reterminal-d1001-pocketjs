# D1001 Home Assistant panel

App id: `dev.pocket-nexus.d1001.showroom-ha-panel`.

The density-2 app provides a 400x640 portrait console and a genuinely rearranged 640x400 landscape console. Home shows temperature/humidity above the main HA light, weather and six Reachy actions. Both orientations place the two arm actions directly on home; there is no arm detail route. The `灯光` tab opens the main light's dimmer directly; read-only environment pages and settings remain available. There are no scene cards, local scene presets, IMU cards or invented weather readings.

Every screen renders Simplified Chinese or English. A compact language pill sits beside the portrait clock and in the status line or settings row in landscape; the settings page carries the same control. `session.ts` persists the language with lights, route and screen timeout, so a portrait/landscape restart keeps the choice.

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

`model.ts` owns immutable entity, pending, error and connection state. `showroom.ts` validates stable display keys and the public example map. `action-controller.ts` owns action run ids, the 90-frame accepted/failed window, the 15-second pending safety timeout and disconnect invalidation; `action-button-state.ts` maps those statuses to visual-only button colors. `console.ts` shares command coalescing and dimmer behavior. `ha-request.ts` builds requests, `ha-engine.ts` routes them, and `worker.ts` owns network I/O. `native.ts` reads the existing local/native configuration. `ui/` contains both orientations.

## Console behavior

Tapping the main light card switches power; long-pressing it opens a Home Assistant more-info style dimmer. The header carries back, the light name and the live state. The center is one large rounded-pill vertical brightness slider whose fill takes the light's current color while it is on and whose percentage sits above it. A row of round mode buttons toggles power and switches the slider area to a circular hue/saturation wheel: touch angle selects hue (0° at the top, clockwise) and radius selects saturation. In color mode that button becomes `亮度`, and back returns to the slider before leaving the page. There is no color-temperature control: the showroom entity uses RGB/HS plus brightness, and the snapshot carries no `supported_color_modes`, so the UI does not invent a schema or expose Kelvin.

`light.turn_off` sends only `entity_id`. Explicit `light.turn_on` commands use `brightness_pct`, `rgb_color` or `color_temp_kelvin`; RGB and Kelvin are mutually exclusive. The dimmer sends brightness percentage and RGB values; the Kelvin payload remains in the command contract but is never produced by this UI. Rapid changes coalesce per light without mixing color modes. A keyed HA light is writable only after a valid live snapshot. `unavailable`, request failure and pending state stay per entity and do not disconnect other lights or sensors.

The six Reachy slots are:

- `reachy-intro-retail`: 零售讲解
- `reachy-intro-space`: 空间讲解
- `reachy-intro-emergency`: 救灾讲解
- `reachy-wake`: 唤醒
- `reachy-lang-toggle`: 中英切换
- `reachy-stop`: 停止 / STOP

Each maps to a local `input_button` and calls `/api/services/input_button/press`. HTTP success means Home Assistant took the request; it does not mean Reachy finished speaking or moving. The panel does not show Reachy Mini agent/result state; the other KeyMesh commands already drive its automatic motion.

Both home layouts directly show the two tap buttons, `arm-gravity` (机械臂可拖拽 / Drag Arm) and `arm-playback` (机械臂跳舞 / Arm Dance), with transient visual feedback and no MQTT state display. Animated dots replace the buttons until their mappings and the HA connection are ready; no `未配置` label appears in the arm area. Landscape stacks playback above gravity; portrait places gravity beside playback. Both local action keys map to the shared `script.keymesh_dispatch` and call `/api/services/script/turn_on` with `host: hall-win-3bbkv8f` and `confirm: true`. Gravity uses `task: arm-gravity-start`; playback uses `task: arm-play` and `action: act_db914a65db` (机械臂跳舞2). Legacy arm `input_button` mappings still parse, but the worker rejects them instead of sending an unsafe command. No KeyMesh/MQTT writer exists in this app.

Quick and arm buttons show only their name. A pending request tints the button; accepted or failed requests keep a background and text highlight for 90 UI frames (3 s at `tickHz: 30`) and then return to `idle`. `机械臂可拖拽`, `机械臂跳舞` and every Reachy action use the same window; `STOP` has distinct blue pending, solid red accepted and grey failed states before returning to its dark-red idle state. No acceptance or send status word is drawn on any button. A disconnect resets every active run to `idle`, advances its run id and discards late results after reconnection. A pending request whose result never arrives is abandoned after 450 frames (15 s, longer than the worker's 10 s HTTP timeout).

Live rollout follow-up: the current hall `script.keymesh_dispatch` template only forwards `text` and `start`; it must also accept and forward `action` and `confirm` before these arm requests can execute. No live HA configuration was changed.

The virtual desk/shelf lamps and onboard RGB remain in the model for the mock and self-test paths, but this console exposes only the showroom main light's dimmer. They are not local scenes and do not appear as fake HA actions on home.

## Power telemetry

`native.ts` reads the firmware `d1001.readPower()` binding every 150 UI frames (5 s at 30 Hz). Home shows battery percentage, the battery glyph fill, USB 5V presence and the charging, idle, battery-only or inconsistent state. Settings adds the measured battery and USB voltages (`3.96V`) for hardware calibration. When the firmware returns `available: false`, the badge and settings row remain visible with `--%`, `Unavailable` and `Firmware exposes no battery data` instead of disappearing. The app logs `[showroom] power: ...` on the first read and whenever the percentage, USB presence or charge state changes, so a serial capture can compare the JS reading with the firmware `Power ...` line.

## Slot-local configuration

The committed package contains no HA URL, token or local entity bindings. At startup it reads `ha-panel.json` only from this app slot's `data.fs`, which is backed by the D1001 internal `storage` partition. It does not fall back to firmware Kconfig credentials or a build-time source override. A missing or invalid file disables HA without exposing its contents.

`seed.example.json` documents the versioned file format. The map contains `lights`, `sensors`, `actions` and optional `weather`; unknown display keys, credentials inside the map and wrong entity domains are rejected. `light.*` and the showroom's `edidt.*` light-compatible entity are accepted. Reachy actions accept `input_button.*`; arm actions use `script.keymesh_dispatch`, with legacy `input_button.*` accepted only to fail closed at execution. Arm mappings remain optional device data. Legacy Reachy/arm telemetry sensor keys are accepted and discarded without polling.

Production provisioning uses `tools/showroom-ha-panel-provision.ts` in two phases. The private seed and all generated seed artifacts must be mode-600 files inside a mode-700 child directory of `/dev/shm`. The seed app writes and reads back the slot-local file. The finish phase requires that exact readback marker, compiles the normal tokenless package before erasing, erases only the complete `apps@0x510000+0x700000` region, installs the normal package, reads back all 7 MiB and rejects raw or UTF-16 token bytes. `storage@0xc10000` is preserved. The tool refuses `/dev/shm` itself, non-tmpfs staging, public secret files, an incompatible esptool Python environment, incomplete readback and unowned cleanup directories. Set `D1001_PYTHON` when the compatible esptool module is not provided by `python` on `PATH`.

The Wi-Fi/HA pages are read-only status views. They show the current SSID, IPv4 address, RSSI and HA connection state. When the firmware binds `wifi.nextPreset()`, the page offers `切换网络`; otherwise it states that technicians preset the network on the device. Neither page saves credentials: the HA address and token come from the slot-local `ha-panel.json`.

## Queueing and freshness

The UI sends basic configuration and the entity map through separate 1024-byte `ha-config` and `ha-entity-map` snapshots. Commands use a capacity-8, 1024-byte `ha-commands` ring; events use a capacity-8, 512-byte `ha-events` ring. Light changes debounce for six UI frames per entity, keeping the latest state and compatible request fields.

The engine has independent poll and command lanes. Each lane is serial: a blocked poll does not block a command, while commands execute in queue order. Poll snapshots from an older light revision are discarded. A per-light count suppresses replacement polls until all queued writes for that light finish; the last write triggers an immediate fresh poll. Light/sensor polls are scheduled every 3000 worker ticks, errors retry after 300 ticks, and weather polls every 6000 ticks; the worker tick is 100 ms.

Live environment sensors expire after their configured `staleAfterSeconds`, using RTC time stamped on arrival. A disconnect retains the last value as `离线` and disables writes. Reconnection marks readings pending until fresh data arrives. Light snapshots have equivalent stale handling. Mock readings remain marked `示例` and do not expire. Weather is shown only from a live HA weather entity. Without `entityMap.weather`, the legacy template API discovers the first `weather.*` entity; template access depends on token permissions.

## Touch and native behavior

The app responds only to touch gestures: taps activate actions, long-press opens the main-light dimmer, and paging uses the on-screen touch controls. Arm buttons ignore further gestures while a request is pending; accepted and failed results clear after three seconds, and a lost pending result is abandoned after 15 seconds. GPIO3/CIRCLE remains entirely native-owned for rotation, screen timeout/wake-swallow and restart arbitration; the app does not map it to panel activation.

The portrait settings `横屏` and landscape `返回竖屏` controls use the existing runtime restart and synchronized touch mapping. Session state preserves lights, the current route, language and screen timeout. Backlight, auto screen-off, RTC/SNTP, timezone and firmware-version behavior are unchanged. The Wi-Fi/HA pages are status-only and do not write credentials.

## Host preview and package checks

The preview compiles the real app, boots it in the PocketJS WASM core, replays touch input, verifies emitted worker commands and native preset requests, and writes 800x1280 portrait or 1280x800 landscape PNGs. It uses fixed native fixtures, including a slot-local `ha-panel.json` read through `data.fs`, and does not access a device, serial port or network.

```sh
bun run showroom:preview --smoke                       # home screen, portrait and landscape
bun run showroom:preview --only=lights,offline-home    # named shots, portrait
bun run showroom:preview --only=dimmer --landscape     # named shots, landscape
bun run showroom:preview                               # every portrait shot
bun run showroom:preview --all                         # every shot in both orientations
```

The WASM core comes from `--wasm=<path>` or `POCKETJS_WASM`; `bun third_party/pocketjs/tools/wasm.ts` builds it. Each run compiles the app once (about 13 s). `--no-build` reuses the package in `.pocket-build/preview/showroom-ha-panel` and renders in under a second for a smoke run. `--out=<dir>` chooses the screenshot directory; the default is a new ignored directory under `.pocket-build/validation/showroom-dashboard/`. Runs that cover both orientations write `portrait/` and `landscape/` subdirectories. The shot tape covers home, the direct dimmer, sensors, continuous dimming, light swiping, Reachy actions, disabled unconfigured arm buttons and transient arm feedback, offline state, settings and the connection-status page with its preset switch. English variants (`home-en`, `settings-en`, `sensors-en`, `sensor-detail-en`, `dimmer-en`, `provision-en`) exercise the language pill in both orientations. `dimmer-drag` drags the brightness pill, and `dimmer-color` drags the hue/saturation wheel in each orientation and checks that the last light command turns the light on with the RGB under the finger. Paging and per-entity `unavailable` have unit tests but no preview shot. Offline, no-weather and protected-arm variants carry filename prefixes.

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

It listens on `0.0.0.0:18123`, requires Bearer authentication and makes no outbound HA, KeyMesh or MQTT calls. It serves the public example lights, environment and weather, and accepts light commands and the six button presses. Logs contain paths and whitelisted body fields, never Authorization headers or tokens. Its legacy sensor-post endpoints remain independent of this dashboard.
