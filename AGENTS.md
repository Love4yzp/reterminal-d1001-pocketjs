# Project instructions

## Boundaries

- Treat `third_party/pocketjs` as a read-only pinned submodule. Put board changes under `platforms/esp-idf/d1001_board` and firmware composition under `programs/reterminal-d1001`.
- Use Seeed's reTerminal-D1001 repository only as a hardware reference. Keep this firmware independent of its BSP, components and LVGL.
- Use `/usr/bin/mise` for Bun, the existing `rustup` for Rust and the ESP-IDF checkout under `~/esp`; system package installation and power-policy changes are out of scope.

## Implementation

- Board initialization returns handles and owns no tasks. M1 covers the panel and backlight; M2 adds PKAP packages; GSL3670 touch belongs to M3.
- Keep portrait at 400x640 logical/800x1280 RGB565 and landscape at 640x400 logical/1280x800 RGB565, density 2 with DPI scale 1. Rotation rebuilds the runtime with a real layout and synchronized touch mapping; landscape settings provide a portrait return. Keep the two DPI staging buffers within 128 KiB total, each in internal DMA RAM.
- M2 loads the first PKAP v1 extent in `apps`; invalid or empty slots must fall back to the embedded app. Perform partition mapping on the internal `app_main` stack, not the PSRAM guest task. `partitions.csv` assigns 5 MiB to `factory` and 7 MiB to `apps` at 0x510000; `storage` stays at 0xc10000 with size 0x3f0000. Host tools parse the CSV and firmware uses the runtime partition descriptor. Migrating an older device requires flashing its partition table and factory image; never erase `storage`.
- M3 registers GSL3670 touch with 180° mirroring and orientation-aware logical mapping, plus active-high GPIO3 as CIRCLE. The native screen task owns timeout/wake-swallow, 600 ms short-press, 350 ms double-click, 1 second feedback and 3 second restart arbitration independently of the guest. Use two PPA lanes and the display-vtable move counter for the automatic `input-test` list. Its scrolling content is full-width so retained moves use GDMA instead of the slower partial-width PPA band path.
- M4 mounts FAT without automatic formatting, binds `data.fs` per slot and uses standard `led-r/led-g/led-b` switches. Hosted host 3.0.10 is back-compatible with the existing 2.3.2 C6; log its version and never invoke Hosted OTA. Station credentials come from ignored local Kconfig values and RAM storage; log SSID/IP/RSSI only, never the password. Wi-Fi push is dev-only, token-protected and compiled out by default; buffer and validate the complete image before any flash write, skip unchanged 4 KiB sectors, and close unauthorized sessions. Runtime restart is task-synchronised and never calls `esp_restart`.
- Use `bun run app:push <app-dir>` for the development loop. Serial writes only `apps`; `--wifi <ip>` uses the authenticated HTTP endpoint and restarts only the runtime. Use `apps/worker-http` for worker GET, `apps/ha-panel` for the dashboard and mock-HA checks, `apps/system-test` for persistence/device/Wi-Fi, `apps/input-test` for input/scroll and `apps/hello-d1001` for the minimal push check.
- Declare only capabilities registered by the firmware in `pocket.host.json`.
- Compile C with `-Wall -Wextra -Werror`, declare the `esp32p4` target for each component, and keep generated files, build trees and validation logs out of Git.

## App development

Changes confined to `apps/<app>/` and its asset tools follow these rules; load `skills/pocketjs-app-dev/SKILL.md` for the commands.

- Build the smallest vertical slice that works on the device. Implement only features with a registered native capability, a live backend or a requested fixture. Do not add placeholder enum states, adapter seams, runtime schema validators, focus or state machines, or tests for features that are not wired; record them as a one-line follow-up instead.
- Add tests only for pure logic you changed, and keep them in the matching `*.test.ts`. Do not write a review of your own plan and then redo the work; decide, implement, check.
- Change one orientation at a time. Put measurements both orientations share in one constant; finish and check portrait before landscape, or the reverse.
- Daily checks, run after each edit: `bun run fonts` when text changed, `bun run pocket check` for the app, `bun test apps/<app>`, `bun run preview --smoke` or `--only=<shot>` for the screens you touched, and `bun run app:push <app-dir> --wifi <ip>` when a device is reachable. View only the screenshots you rendered, once per change.
- Package size is checked automatically by `bun run preview` and `app:push`; if either reports that the package exceeds the `apps` partition, remove a text style or unused art rather than editing the tools.
- Heavy gates: `bun run preview --all`, the ESP-IDF firmware build, flashing and the 30-second serial capture. Run them for changes to firmware, board code, the host config, `partitions.csv` or the preview harness, for a release, or when the user asks. An app-only change skips them; its milestone commit needs the daily checks plus `bun run preview` for the orientation it changed.

## Verification and commits

- Run the relevant host export and firmware build after firmware, board or host-config changes. Run `bun test apps/ha-panel tools/partitions.test.ts` for panel logic and flash-layout checks. A successful build is not device validation.
- For device changes, identify the attached chip before flashing and capture at least 30 seconds of serial output, including internal DMA heap and runner statistics.
- Store validation logs under ignored `.pocket-build/validation/<task>/<run>/`; report unrun checks as unverified.
- Use one Conventional Commit per milestone after its checks pass.
