# Project instructions

## Boundaries

- Keep the repository local: use local commits without adding a remote or pushing.
- Treat `third_party/pocketjs` as a read-only pinned submodule. Put board changes under `platforms/esp-idf/d1001_board` and firmware composition under `programs/reterminal-d1001`.
- Use Seeed's reTerminal-D1001 repository only as a hardware reference. Keep this firmware independent of its BSP, components and LVGL.
- Use `/usr/bin/mise` for Bun, the existing `rustup` for Rust and the ESP-IDF checkout under `~/esp`; system package installation and power-policy changes are out of scope.

## Implementation

- Board initialization returns handles and owns no tasks. M1 covers the panel and backlight; M2 adds PKAP packages; GSL3670 touch belongs to M3.
- Keep the logical viewport at 400x640 and render an 800x1280 RGB565 raster at density 2 with DPI scale 1. Keep the two DPI staging buffers within 128 KiB total, each in internal DMA RAM.
- M2 loads the first PKAP v1 extent in `apps`; invalid or empty slots must fall back to the embedded app. Perform partition mapping on the internal `app_main` stack, not the PSRAM guest task. `partitions.csv` assigns 5 MiB to `factory` and 7 MiB to `apps` at 0x510000; `storage` stays at 0xc10000 with size 0x3f0000. Host tools parse the CSV and firmware uses the runtime partition descriptor. Migrating an older device requires flashing its partition table and factory image; never erase `storage`.
- M3 registers GSL3670 touch with 180° mirroring and 0.5 logical scaling, plus active-high GPIO3 as CIRCLE. Use two PPA lanes and the display-vtable move counter for the automatic `input-test` list. Its scrolling content is full-width so retained moves use GDMA instead of the slower partial-width PPA band path.
- M4 mounts FAT without automatic formatting, binds `data.fs` per slot and uses standard `led-r/led-g/led-b` switches. Hosted host 3.0.10 is back-compatible with the existing 2.3.2 C6; log its version and never invoke Hosted OTA. Station credentials come from ignored local Kconfig values and RAM storage; log SSID/IP/RSSI only, never the password. Wi-Fi push is dev-only, token-protected and compiled out by default; buffer and validate the complete image before any flash write, skip unchanged 4 KiB sectors, and close unauthorized sessions. Runtime restart is task-synchronised and never calls `esp_restart`.
- Use `bun run app:push <app-dir>` for the development loop. Serial writes only `apps`; `--wifi <ip>` uses the authenticated HTTP endpoint and restarts only the runtime. Use `apps/worker-http` for worker GET, `apps/ha-panel` for the dashboard and mock-HA checks, `apps/system-test` for persistence/device/Wi-Fi, `apps/input-test` for input/scroll and `apps/hello-d1001` for the minimal push check.
- Declare only capabilities registered by the firmware in `pocket.host.json`.
- Compile C with `-Wall -Wextra -Werror`, declare the `esp32p4` target for each component, and keep generated files, build trees and validation logs out of Git.

## Verification and commits

- Run the relevant host export and firmware build after changes. Run `bun test apps/ha-panel tools/partitions.test.ts` for panel logic and flash-layout checks. A successful build is not device validation.
- For device changes, identify the attached chip before flashing and capture at least 30 seconds of serial output, including internal DMA heap and runner statistics.
- Store validation logs under ignored `.pocket-build/validation/<task>/<run>/`; report unrun checks as unverified.
- Use one local Conventional Commit per milestone after its checks pass.
