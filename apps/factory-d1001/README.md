# D1001 factory demo

A self-contained factory-floor demo for the reTerminal D1001. It has no
network, worker, filesystem or device dependency: everything is drawn by the
PocketJS UI runtime.

## Screens

- **Portrait** (400x640 logical): title, device card, four specification
  cards, a system status row and the green rotate button.
- **Landscape** (640x400 composition): a full-width factory panel with the
  same specifications and a baked green rotate button.

The portrait screen is native PocketJS UI. The landscape screen is a 640x400
canvas turned by 90 degrees inside the 400x640 raster, so the typography
turns with the canvas instead of staying upright. PocketJS keeps glyph cells
upright under a parent rotation, so the landscape text is baked into a
512x512 power-of-two texture, pre-distorted to the 640x400 aspect. The
rotate button stays a live hit target over that image.

## Direction switching

The green button enters the next direction:

1. portrait
2. landscape clockwise (rotate the device counter-clockwise)
3. landscape counter-clockwise (rotate the device clockwise)
4. back to portrait

Both controls work:

- the on-screen green `旋转屏幕 ROTATE` button;
- the D1001 side button on GPIO3, mapped to `BTN.CIRCLE`.

The app logs each change as
`[factory-d1001] orientation=<mode> landscape=<bool>`.

## Build and test

```sh
bun test apps/factory-d1001/orientation.test.ts
bun run app:push apps/factory-d1001
```

The app declares only `input.touch`, `input.buttons` and
`text.glyphs.baked`, all of which the D1001 host profile registers. The
firmware embeds it as the factory fallback; another package can still be
pushed over it with `bun run app:push`.
