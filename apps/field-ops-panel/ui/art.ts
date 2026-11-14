export const NUMERALS = {
  56: {
    height: 45,
    glyphs: {
      "0": { src: "art/num56-0.svg", width: 36 },
      "1": { src: "art/num56-1.svg", width: 36 },
      "2": { src: "art/num56-2.svg", width: 36 },
      "3": { src: "art/num56-3.svg", width: 36 },
      "4": { src: "art/num56-4.svg", width: 36 },
      "5": { src: "art/num56-5.svg", width: 36 },
      "6": { src: "art/num56-6.svg", width: 36 },
      "7": { src: "art/num56-7.svg", width: 36 },
      "8": { src: "art/num56-8.svg", width: 36 },
      "9": { src: "art/num56-9.svg", width: 36 },
      ":": { src: "art/num56-colon.svg", width: 15 },
      "%": { src: "art/num56-percent.svg", width: 52 },
    },
  },
  44: {
    height: 37,
    glyphs: {
      "0": { src: "art/num44-0.svg", width: 28 },
      "1": { src: "art/num44-1.svg", width: 28 },
      "2": { src: "art/num44-2.svg", width: 28 },
      "3": { src: "art/num44-3.svg", width: 28 },
      "4": { src: "art/num44-4.svg", width: 28 },
      "5": { src: "art/num44-5.svg", width: 28 },
      "6": { src: "art/num44-6.svg", width: 28 },
      "7": { src: "art/num44-7.svg", width: 28 },
      "8": { src: "art/num44-8.svg", width: 28 },
      "9": { src: "art/num44-9.svg", width: 28 },
      ":": { src: "art/num44-colon.svg", width: 12 },
      "%": { src: "art/num44-percent.svg", width: 41 },
    },
  },
} as const;

export const ICONS = {
  "alarm-alert": "art/alarm-alert.svg",
  "alarm-secondary": "art/alarm-secondary.svg",
  "alarm-text": "art/alarm-text.svg",
  "back-text": "art/back-text.svg",
  "chevron-secondary": "art/chevron-secondary.svg",
  "cog-secondary": "art/cog-secondary.svg",
  "cog-text": "art/cog-text.svg",
  "control-secondary": "art/control-secondary.svg",
  "control-text": "art/control-text.svg",
  "home-secondary": "art/home-secondary.svg",
  "home-text": "art/home-text.svg",
  "power-text": "art/power-text.svg",
  "wifi-secondary": "art/wifi-secondary.svg",
  "wifi-text": "art/wifi-text.svg",
} as const;

export type IconName = keyof typeof ICONS;
