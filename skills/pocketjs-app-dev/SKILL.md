---
name: pocketjs-app-dev
description: Fast edit-check-push loop for PocketJS apps under apps/ on the reTerminal D1001 — panel text and fonts, screen layout, smoke previews and Wi-Fi app push. Use when changing an app's UI, text, assets or app-level logic (for example apps/ha-panel). Don't use for firmware, board, host-config or partition changes; those follow the heavy gates in AGENTS.md.
---
# PocketJS app development

An app change should take minutes. Every daily check below finishes in seconds;
the slow steps (full screenshot set, firmware build, flashing) are heavy gates
and stay out of the loop.

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

| Changed | Command | Time |
|---|---|---|
| Any CJK text (ha-panel) | `bun run fonts` | <1 s, ~0.3 s when it rebuilds |
| Any app source | `bun run pocket check --manifest apps/<app>/pocket.app.json --host-config programs/reterminal-d1001/pocket.host.config.ts` | ~2 s |
| Pure logic in a `*.ts` with tests | `bun test apps/<app>` | <1 s |
| A screen (ha-panel) | `bun run preview --only=<shot>[,<shot>]` add `--landscape` for that orientation | ~13 s compile, <1 s with `--no-build` |
| Startup or home screen (ha-panel) | `bun run preview --smoke` | ~13 s, both orientations |
| Behaviour on hardware | `bun run app:push apps/<app> --wifi <device-ip>` | seconds, restarts only the runtime |

- `bun run fonts` collects the CJK characters in the app's string literals and
  JSX text, rewrites `fonts/characters.txt` and rebuilds
  `D1001SansSC-Regular.otf` when the set changed. The output is
  byte-deterministic, so an unchanged run leaves Git clean. Never run
  pyftsubset by hand or loop on `--check`.
- Shot names are the PNG names in `tools/ha-panel-preview-shots.ts`. Offline
  and no-weather variants carry `offline-` and `no-weather-` prefixes, for
  example `--only=offline-home`.
- `--no-build` reuses the last compiled package; drop it after a source edit.
- The preview needs a PocketJS WASM core: `--wasm=<path>`, `POCKETJS_WASM`, or
  the vendored `third_party/pocketjs/platforms/web/pocketjs.wasm`. Build one
  with `bun third_party/pocketjs/tools/wasm.ts`.
- Screenshots go to a new ignored directory under
  `.pocket-build/validation/`. Open each rendered image once and judge it; if
  it is wrong, edit and rerender that shot only.
- Watch the compile line: `.pocket N bytes, PKAP extent E/7340032, headroom H`.
  The limit is the whole `.pocket` bundle (pak plus JS) with a 64-byte header,
  rounded up to 64 KiB pages; the `.pak` size alone is not the limit. The
  preview and `app:push` fail when the extent exceeds the `apps` partition.
- Every text style (font size and weight) bakes a glyph atlas for every
  character in `characters.txt`. A new size, a new bold variant or a batch of
  new CJK characters can add hundreds of KiB. Reuse the shared 10/12/14 px
  styles; if headroom drops below one 64 KiB page, cut a style before adding
  more text.
- If a compile takes far longer than 15 s, look for a new large `<path>` SVG
  in the app art. The SVG baker supersamples paths; emit `<rect>` shapes for
  grid art such as QR codes.

## Before the commit

1. `bun test apps/<app> tools/partitions.test.ts`
2. `bun run fonts --check` (ha-panel)
3. `bun run preview` for each orientation you changed, without `--all` unless
   you changed both.
4. `git status --short`: stage source, art and the regenerated font subset.
   Leave `.pocket-build/` and screenshots out of Git.
5. One local Conventional Commit, for example `feat(ha-panel): …`. No push.

Report the app push and on-device behaviour as unverified if no device was
reachable.

## Heavy gates

Run these only for firmware, board, host-config, `partitions.csv` or preview
harness changes, for a release, or when the user asks:

- `bun run preview --all`: every shot in both orientations, about 4 s plus
  the compile.
- The ESP-IDF firmware build, serial flashing and the 30-second serial
  capture described in `AGENTS.md`.
