export type Rgb = readonly [number, number, number];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function hsvToRgb(hue: number, saturation = 1, value = 1): Rgb {
  const wrappedHue = ((hue % 360) + 360) % 360;
  const s = clamp01(saturation);
  const v = clamp01(value);
  const chroma = v * s;
  const sectorPosition = wrappedHue / 60;
  const x = chroma * (1 - Math.abs((sectorPosition % 2) - 1));
  let channels: Rgb;
  switch (Math.floor(sectorPosition)) {
    case 0:
      channels = [chroma, x, 0];
      break;
    case 1:
      channels = [x, chroma, 0];
      break;
    case 2:
      channels = [0, chroma, x];
      break;
    case 3:
      channels = [0, x, chroma];
      break;
    case 4:
      channels = [x, 0, chroma];
      break;
    default:
      channels = [chroma, 0, x];
  }
  const match = v - chroma;
  return [
    Math.round((channels[0] + match) * 255),
    Math.round((channels[1] + match) * 255),
    Math.round((channels[2] + match) * 255),
  ];
}

export function rgbToHsv(color: Rgb): readonly [number, number] {
  const [red, green, blue] = color.map(channel => clamp01(channel / 255));
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return [0, 0];
  const sector = maximum === red
    ? ((green - blue) / delta) % 6
    : maximum === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return [Math.round(((sector * 60) % 360 + 360) % 360), Math.round(delta / maximum * 100)];
}

export function applyBrightness(color: Rgb, brightness: number): Rgb {
  const scale = Math.min(255, Math.max(0, brightness)) / 255;
  return [
    Math.round(color[0] * scale),
    Math.round(color[1] * scale),
    Math.round(color[2] * scale),
  ];
}

export function abgr(color: Rgb): number {
  return (0xff000000 | (color[2] << 16) | (color[1] << 8) | color[0]) >>> 0;
}
