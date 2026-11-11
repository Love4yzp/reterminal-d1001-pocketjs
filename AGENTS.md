# Project instructions

## Boundaries

- `third_party/pocketjs` is a read-only pinned submodule.
- Seeed's reTerminal-D1001 repository is a hardware reference only; this firmware stays independent of its BSP, components and LVGL.
- Toolchains: Bun via `/usr/bin/mise`, the existing `rustup`, ESP-IDF under `~/esp`. System packages and power policy are out of scope.

## Classify the task first

Every task is firmware, app or device data. A task needing both firmware and app is split into two commits, firmware first.

| Area | Paths | Owns | Deploy |
|---|---|---|---|
| Firmware | `platforms/esp-idf/*` (board in `d1001_board`, Wi-Fi in `pocket_wifi_esp`), `programs/reterminal-d1001`, `pocket.host.json`, `partitions.csv` | drivers, input arbitration, storage, Wi-Fi presets and rotation (join failure, instability, weak RSSI), reconnect backoff, native capabilities | build and flash |
| App | `apps/<app>/`, its fonts, mocks and preview tools | screens, layout, gestures, HA entity mapping and commands, HA reconnect timing, text | `app:push` (writes only `apps`) |
| Device data | `storage`/`data.fs`, ignored `sdkconfig.local` | HA URL, token and entity map (`tools/showroom-ha-panel-provision.ts`); Wi-Fi SSIDs and passwords (Kconfig) | never committed |

- Policy that must keep working while the guest is stopped or hung is firmware.
- Apps read status and call registered capabilities only; they never hold Wi-Fi credentials or decide network rotation.
- If an app feature needs an unregistered capability, add it as a firmware milestone first, or record a follow-up when firmware is out of scope.

## Firmware invariants

- Board initialization returns handles and owns no tasks.
- Display: portrait 400x640 logical/800x1280, landscape 640x400 logical/1280x800, RGB565, density 2, DPI scale 1. Rotation rebuilds the runtime with a real layout and synchronized touch mapping; landscape settings provide a portrait return. The two DPI staging buffers total at most 128 KiB, each in internal DMA RAM.
- Touch: GSL3670 with 180° mirroring and orientation-aware logical mapping. GPIO3 (active high) is CIRCLE; the native screen task owns timeout/wake-swallow, 600 ms short press, 350 ms double click, 1 s feedback and 3 s restart arbitration independently of the guest.
- Rendering: two PPA lanes; the display-vtable move counter drives the automatic `input-test` list, whose full-width content keeps retained moves on GDMA.
- Packages: load the first PKAP v1 extent in `apps`; invalid or empty slots fall back to the embedded app. Map partitions on the internal `app_main` stack, not the PSRAM guest task.
- Flash layout: `factory` 5 MiB, `apps` 7 MiB at 0x510000, `storage` at 0xc10000 size 0x3f0000. Host tools parse the CSV; firmware uses the runtime partition descriptor. Migrating an older device means flashing its partition table and factory image. Never erase or overwrite `storage`.
- Storage: FAT without automatic formatting, `data.fs` bound per slot; LEDs are `led-r/led-g/led-b` switches.
- Wi-Fi: Hosted host 3.0.10 with the existing 2.3.2 C6 (2.4 GHz only); log its version, never invoke Hosted OTA. Credentials come from ignored Kconfig values and RAM storage. Log SSID/IP/RSSI and reasons only, never passwords.
- Wi-Fi push is dev-only, token-protected and compiled out by default: buffer and validate the whole image before any flash write, skip unchanged 4 KiB sectors, close unauthorized sessions.
- Runtime restart is task-synchronised and never calls `esp_restart`.
- `pocket.host.json` declares only capabilities the firmware registers.
- C compiles with `-Wall -Wextra -Werror`; every component declares the `esp32p4` target.

## Apps

- `apps/showroom-ha-panel`: showroom console. `apps/ha-panel`: generic dashboard. They keep independent app ids, tests, fonts, mocks and previews; showroom behavior must not leak into `apps/ha-panel`.
- `apps/worker-http` (worker GET, embedded default), `apps/system-test` (persistence/device/Wi-Fi), `apps/input-test` (input/scroll), `apps/hello-d1001` (minimal push check).
- Load `skills/pocketjs-app-dev/SKILL.md` for commands.
- Build the smallest vertical slice that works on the device, using only registered capabilities, a live backend or a requested fixture. No placeholder states, adapter seams, runtime schema validators, focus/state machines or tests for unwired features; record those as one-line follow-ups.
- Test only pure logic you changed, in the matching `*.test.ts`. Decide, implement, check; do not review your own plan and redo it.
- Change one orientation at a time; shared measurements live in one constant.
- If a package exceeds the `apps` partition (checked by preview and `app:push`), remove a text style or unused art rather than editing the tools.

## Checks

| Change | Required |
|---|---|
| App | fonts when text changed (`bun run fonts` / `bun run showroom:fonts`), `bun run pocket check`, `bun test apps/<app> tools/partitions.test.ts`, preview `--smoke` or `--only=<shot>` for touched screens and the full preview of the changed orientation before its commit (`bun run preview` / `bun run showroom:preview`); view each rendered screenshot once |
| Shared panel or flash layout | `bun test apps/ha-panel apps/showroom-ha-panel tools/partitions.test.ts` |
| Firmware, board, host config, `partitions.csv`, preview harness, release | host export, ESP-IDF build, preview `--all`, flash, 30 s serial capture |

- A successful build is not device validation.
- Before flashing, identify the chip. Capture at least 30 s of serial output including internal DMA heap and runner statistics.
- A device in field use is flashed or pushed only when the user asks.
- Validation logs go under ignored `.pocket-build/validation/<task>/<run>/`; report unrun checks as unverified.

## Deploy and commits

- App: `bun run app:push <app-dir>` over serial, or `--wifi <ip>` via the authenticated endpoint (restarts only the runtime). Set `D1001_PYTHON` to the ESP-IDF Python if system Python lacks esptool.
- Firmware: build with `SDKCONFIG_DEFAULTS="…/sdkconfig.defaults;…/sdkconfig.local"`; move an existing `programs/reterminal-d1001/sdkconfig` aside after changing local values.
- Keep generated files, build trees, `sdkconfig`, `sdkconfig.local` and validation logs out of Git.
- One Conventional Commit per milestone after its checks pass.
