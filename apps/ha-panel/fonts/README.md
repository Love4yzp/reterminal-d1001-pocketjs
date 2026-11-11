# D1001 panel font

`D1001SansSC-Regular.otf` is a subset of the Simplified Chinese face (collection index 2) in Noto Sans CJK Regular. It supplies CJK and full-width punctuation glyphs that the default Inter face does not contain; Latin text remains Inter.

Upstream: https://github.com/notofonts/noto-cjk

Local source: `/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc`. Copyright 2014–2021 Adobe (http://www.adobe.com/). Licensed under the SIL Open Font License 1.1; see `OFL.txt`. The subset retains the original name and license metadata.

From the repository root, run `bun run fonts`. It collects CJK characters from string literals, templates and JSX, writes `characters.txt`, and rebuilds the subset when the set changes. The rebuild runs fonttools through mise-managed uv and produces byte-identical output for the same character set. `bun run fonts --force` rebuilds without a character change; `bun run fonts --check` and `font-coverage.test.ts` reject a stale character list or missing outlines in any active density-2 size/weight slot. The underlying command is:

```sh
mise x uv -- uvx --from fonttools pyftsubset \
  /usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc \
  --font-number=2 \
  --text-file=apps/ha-panel/fonts/characters.txt \
  --output-file=apps/ha-panel/fonts/D1001SansSC-Regular.otf \
  --name-IDs='*' --name-legacy --name-languages='*' \
  --notdef-outline --recommended-glyphs
```

`fonts.json` follows `third_party/pocketjs/docs/DYNAMIC_TEXT.md`, section “Packaged fonts and GPU pages”. The compiler packs these glyphs into the app's baked atlases; the original font is not loaded on the device. Declaring a scalar does not supply an outline missing from this OTF.

Every active font slot receives the declared character set, so keep Chinese labels in the shared 10px, 12px and 14px regular/bold styles. Large clock and weather digits use Inter only. HA `friendly_name` and arbitrary dynamic CJK are not baked; telemetry uses known local labels or bounded ASCII. `bun run preview` and `app:push` fail if a text or glyph change makes the package outgrow the `apps` partition.
