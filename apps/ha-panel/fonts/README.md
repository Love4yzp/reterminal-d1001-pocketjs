# D1001 panel font

`D1001SansSC-Regular.otf` is a subset of the Simplified Chinese face (collection index 2) in Noto Sans CJK Regular. It supplies CJK and full-width punctuation glyphs that the default Inter face does not contain; Latin text remains Inter.

Upstream: https://github.com/notofonts/noto-cjk

Local source: `/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc`. Copyright 2014–2021 Adobe (http://www.adobe.com/). Licensed under the SIL Open Font License 1.1; see `OFL.txt`. The subset retains the original name and license metadata.

From the repository root, update the source-derived character file with `bun tools/ha-panel-fonts.ts`. `bun tools/ha-panel-fonts.ts --check` and the font coverage tests detect missing characters. Rebuild the subset with fonttools through mise-managed uv, without global Python packages:

```sh
mise x uv -- uvx --from fonttools pyftsubset \
  /usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc \
  --font-number=2 \
  --text-file=apps/ha-panel/fonts/characters.txt \
  --output-file=apps/ha-panel/fonts/D1001SansSC-Regular.otf \
  --name-IDs='*' --name-legacy --name-languages='*' \
  --notdef-outline --recommended-glyphs
```

`fonts.json` follows `third_party/pocketjs/docs/DYNAMIC_TEXT.md`, section “Packaged fonts and GPU pages”. The compiler packs these glyphs into the app's baked atlases; the original font is not loaded on the device.

Every active font slot receives the declared character set, so keep Chinese labels in the shared 10px, 12px and 14px regular/bold styles. Large clock and weather digits use Inter only. Confirm the package fits the 7 MiB `apps` partition after adding a text style or changing characters.
