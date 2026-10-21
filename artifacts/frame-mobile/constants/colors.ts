const palette = {
  text: "#e0e0e0",
  tint: "#8A6A2F",
  // Brand gold: the one named token for gold buttons/actions. Exact approved hex
  // still awaiting Harry's confirmation (see docs/FRAME_update_plan_21_Oct.md §3).
  gold: "#8A6A2F",
  background: "#050505",
  foreground: "#e0e0e0",
  card: "#0a0a0a",
  cardForeground: "#e0e0e0",
  primary: "#8A6A2F",
  primaryForeground: "#050505",
  secondary: "#171717",
  secondaryForeground: "#adadad",
  muted: "#121212",
  mutedForeground: "#a8a8a8",
  accent: "#8A6A2F",
  accentForeground: "#050505",
  destructive: "#BF1D1D",
  destructiveForeground: "#ebebeb",
  border: "#1a1a1a",
  input: "#1c1c1c",
};

const colors = {
  light: palette,
  dark: palette,
  radius: 0,
};

/** Brand gold token (same value as `colors.light.gold`). */
export const GOLD = palette.gold;

export default colors;
