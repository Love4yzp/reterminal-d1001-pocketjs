# Project instructions

## Boundaries

- Keep the repository local: use local commits without adding a remote or pushing.
- Treat `third_party/pocketjs` as a read-only pinned submodule. Put board changes under `platforms/esp-idf/d1001_board` and firmware composition under `programs/reterminal-d1001`.
- Use Seeed's reTerminal-D1001 repository only as a hardware reference. Keep this firmware independent of its BSP, components and LVGL.
- Use `/usr/bin/mise` for Bun, the existing `rustup` for Rust and the ESP-IDF checkout under `~/esp`; system package installation and power-policy changes are out of scope.

## Implementation

- Board initialization returns handles and owns no tasks. M1 covers the panel and backlight; GSL3670 touch belongs to M3.
- Keep the primary picture at 400x640 RGB565 and present it at 2x on the 800x1280 panel. Keep the two DPI staging buffers within 128 KiB total, each in internal DMA RAM.
- Declare only capabilities registered by the firmware in `pocket.host.json`.
- Compile C with `-Wall -Wextra -Werror`, declare the `esp32p4` target for each component, and keep generated files, build trees and validation logs out of Git.

## Verification and commits

- Run the relevant host export and firmware build after changes. A successful build is not device validation.
- For device changes, identify the attached chip before flashing and capture at least 30 seconds of serial output, including internal DMA heap and runner statistics.
- Store validation logs under ignored `.pocket-build/validation/<task>/<run>/`; report unrun checks as unverified.
- Use one local Conventional Commit per milestone after its checks pass.
