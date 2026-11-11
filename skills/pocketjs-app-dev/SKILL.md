---
name: pocketjs-app-dev
description: Edit-check-push loop for PocketJS apps under apps/ on the reTerminal D1001 — panel text and fonts, screen layout, smoke previews and Wi-Fi app push. Use when changing an app's UI, text, assets or app-level logic (for example apps/ha-panel). Don't use for firmware, board, host-config or partition changes; those follow the heavy gates in AGENTS.md.
---
# PocketJS app development

Work in a loop of edit, check the affected part, push. The full screenshot set,
firmware build and flashing are heavy gates and stay out of the loop.

Run every command from the repository root. Bun comes from mise: prefix with
`/usr/bin/mise x --` if `bun` is not on `PATH`.

## Scope before code

1. List what the change must do on the device today. A feature qualifies only
   when the firmware registers its capability in `pocket.host.json`, a live
   backend serves it, or the user asked for a fixture.
2. Write everything else as a one-line follow-up in your final report. Do not
   add enum states such as `待接入` or `过期`, adapter interfaces, runtime
   schema validators or focus state machines for it.
3. Pick one orientation to change first. If a size appears in both layouts, put
   it in one shared constant before you tune it.

Do not write a review of your own plan and then rework it. Decide, implement,
check.

## Loop

After each edit, run only the checks that apply:

| Changed | Command |
|---|---|
| Any CJK text | `bun run fonts` for `ha-panel`; `bun run showroom:fonts` for `showroom-ha-panel` |
| Any app source | `bun run pocket check --manifest apps/<app>/pocket.app.json --host-config programs/reterminal-d1001/pocket.host.config.ts` |
| Pure logic in a `*.ts` with tests | `bun test apps/<app>` |
| A screen | `bun run preview --only=<shot>[,<shot>]` for `ha-panel`; replace `preview` with `showroom:preview` for `showroom-ha-panel`; add `--landscape` for that orientation |
| Startup or home screen | Use the app's preview command with `--smoke` |
| Behaviour on hardware | `bun run app:push apps/<app> --wifi <device-ip>` |

- Use the app-specific font command. It collects CJK characters from that
  app, rewrites its `fonts/characters.txt` and rebuilds
  `D1001SansSC-Regular.otf` when the set changed. The output is
  byte-deterministic, so an unchanged run leaves Git clean. Never run
  pyftsubset by hand or loop on `--check`.
- Shot names are the PNG names in the matching `tools/*-preview-shots.ts`.
  Offline and no-weather variants carry `offline-` and `no-weather-`
  prefixes, for example `--only=offline-home`.
- `--no-build` reuses the last compiled package; drop it after a source edit.
- The preview needs a PocketJS WASM core: `--wasm=<path>`, `POCKETJS_WASM`, or
  the vendored `third_party/pocketjs/platforms/web/pocketjs.wasm`. Build one
  with `bun third_party/pocketjs/tools/wasm.ts`.
- Screenshots go to a new ignored directory under
  `.pocket-build/validation/`. Open each rendered image once and judge it; if
  it is wrong, edit and rerender that shot only.
- `bun run preview` and `app:push` fail if the package no longer fits the
  `apps` partition. Each extra font size or weight bakes all CJK characters
  again, so reuse the existing text styles.
- If a compile takes far longer than 15 s, look for a new large `<path>` SVG
  in the app art. The SVG baker supersamples paths; emit `<rect>` shapes for
  grid art such as QR codes.

## Before the commit

1. `bun test apps/<app> tools/partitions.test.ts`
2. Run the affected app's font command with `--check`.
3. Run the affected app's preview command for each orientation you changed,
   without `--all` unless you changed both.
4. `git status --short`: stage source, art and the regenerated font subset.
   Leave `.pocket-build/` and screenshots out of Git.
5. One Conventional Commit, for example `feat(ha-panel): …`.

Report the app push and on-device behaviour as unverified if no device was
reachable.

## Heavy gates

Run these only for firmware, board, host-config, `partitions.csv` or preview
harness changes, for a release, or when the user asks:

- Run the affected app's preview command with `--all`: every shot in both
  orientations.
- The ESP-IDF firmware build, serial flashing and the 30-second serial
  capture described in `AGENTS.md`.
