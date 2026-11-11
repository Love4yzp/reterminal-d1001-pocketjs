// Home Assistant dark palette from .pocket-build/design/dashboard/screens.html.
// PocketJS colors are 0xAABBGGRR, so the CSS hex reads byte-reversed.
export const theme = {
  primary: 0xfff4a903, // #03a9f4
  brand: 0xfff2bc18, // #18bcf2
  page: 0xff111111,
  card: 0xff1c1c1c,
  secondaryBackground: 0xff282828, // --card2
  text: 0xffe1e1e1,
  secondaryText: 0xff9b9b9b, // --sub
  disabledText: 0xff6f6f6f, // --dim
  divider: 0x1fe1e1e1,
  lightActive: 0xff07c1ff, // #ffc107
  /** Lit-light amber (--on) and the bottom of the dimmer gradient (#ff9a00). */
  on: 0xff07c1ff,
  onDeep: 0xff009aff,
  /** Bulb chip behind a lit warm light: --on at 20%. */
  onChip: 0x3307c1ff,
  /** Bulb chip behind a lit cool light: --primary at 22%. */
  primaryChip: 0x38f4a903,
  /** Tile background while its light is on (#262116). */
  tileOn: 0xff162126,
  /** HA connected dot (#4caf50). */
  green: 0xff50af4c,
  danger: 0xff6c6cf0,
  dangerChip: 0xff2c2c46,
  white: 0xffffffff,
  /** Grip line on the dimmer slider: white at 75%. */
  sliderMark: 0xbfffffff,
  cardRadius: 12,
  tileRadius: 10,
} as const;
