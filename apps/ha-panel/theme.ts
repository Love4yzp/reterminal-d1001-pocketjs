// Home Assistant frontend: resources/theme/color/{core,color}.globals.ts and
// resources/theme/core.globals.ts. Primary is HA's light-blue color.
// https://github.com/home-assistant/frontend/tree/dev/src/resources/theme
// PocketJS uses 0xAABBGGRR for numeric colors.
export const theme = {
  primary: 0xfff4a903,
  brand: 0xfff2bc18,
  page: 0xff111111,
  card: 0xff1c1c1c,
  secondaryBackground: 0xff282828,
  text: 0xffe1e1e1,
  secondaryText: 0xff9b9b9b,
  disabledText: 0xff6f6f6f,
  divider: 0x1fe1e1e1,
  lightActive: 0xff07c1ff,
  cardRadius: 12,
  tileRadius: 10,
} as const;
