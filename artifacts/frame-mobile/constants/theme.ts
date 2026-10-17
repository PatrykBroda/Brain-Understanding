/**
 * FRAME design system — "Smoked Bronze".
 *
 * Dark only. Every colour is a tint/shade of the existing brand palette in
 * constants/colors.ts (near-black #050505, bronze #8A6A2F, crimson #BF1D1D,
 * light grey text). Depth comes from layered graphite surfaces, frosted-glass
 * cards with a 1px light edge, low-opacity bronze glow fields and oversized
 * thin numerals — never from flat #000 and never from new hues.
 *
 * The coach web app mirrors these values in artifacts/coach/src/index.css.
 */
import colors from "@/constants/colors";

export const brand = {
  bg: colors.dark.background, // #050505
  gold: colors.dark.primary, // #8A6A2F
  red: colors.dark.destructive, // #BF1D1D
  text: colors.dark.foreground, // #e0e0e0
} as const;

export const palette = {
  // layered graphite — each step is a warm-neutral lift of the brand black
  ink: "#050505",
  graphite0: "#0a0908",
  graphite1: "#100e0c",
  graphite2: "#171411",
  graphite3: "#211d18",

  // text (all AA on ink / graphite0-2)
  textHi: "#f1ede6",
  text: "#e0e0e0",
  textMid: "#a8a49d",
  textLow: "#8f8b84", // 5.9:1 on ink — the quietest text allowed

  // bronze family: brand #8A6A2F plus lighter tints for text/highlights
  gold: "#8A6A2F",
  goldSoft: "#A98441",
  goldLight: "#C7A15A", // text-safe gold (8:1 on ink)
  goldPale: "#E6D2A3",
  goldGlow: "rgba(138,106,47,0.38)",
  goldWash: "rgba(138,106,47,0.14)",
  goldHair: "rgba(199,161,90,0.28)",

  red: "#BF1D1D",
  redLight: "#E0564E", // text-safe red on dark (5.2:1)
  redGlow: "rgba(191,29,29,0.30)",
  redWash: "rgba(191,29,29,0.12)",

  // glass
  glass: "rgba(255,246,232,0.045)",
  glassStrong: "rgba(255,246,232,0.075)",
  glassEdge: "rgba(255,244,224,0.10)",
  glassEdgeHi: "rgba(255,244,224,0.22)",
  hairline: "rgba(255,244,224,0.07)",
  scrim: "rgba(5,5,5,0.72)",
} as const;

/** Gradient stops (expo-linear-gradient `colors` arrays). */
export const gradients = {
  screen: ["#0d0b09", "#070605", "#050505"] as const,
  card: ["rgba(255,246,232,0.085)", "rgba(255,246,232,0.025)"] as const,
  cardGold: ["rgba(138,106,47,0.30)", "rgba(138,106,47,0.05)"] as const,
  cardRed: ["rgba(191,29,29,0.26)", "rgba(191,29,29,0.04)"] as const,
  goldButton: ["#B38F4B", "#8A6A2F"] as const,
  goldSheen: ["rgba(231,208,150,0.9)", "rgba(138,106,47,0)"] as const,
  tabBar: ["rgba(16,14,12,0.88)", "rgba(10,9,8,0.96)"] as const,
};

export const radius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 10,
  },
  glow: {
    shadowColor: "#8A6A2F",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 8,
  },
} as const;

/**
 * Type. Display = Unbounded ExtraLight/Light (wide, thin, hi-tech) for headings.
 * Punch = Barlow Condensed Bold Italic, caps, used sparingly for UFC/Nike
 * headlines. Text = Outfit. Numerals = Outfit Thin/ExtraLight at oversized sizes.
 * Font keys are the names registered with expo-font in app/_layout.tsx.
 */
export const fonts = {
  display: "UnboundedLight",
  displayThin: "UnboundedExtraLight",
  punch: "BarlowCondensedBoldItalic",
  punchSemi: "BarlowCondensedSemiBoldItalic",
  numeralXL: "OutfitThin",
  numeral: "OutfitLight",
  text: "Outfit",
  textMedium: "OutfitMedium",
  textSemi: "OutfitSemiBold",
  /** legacy: kept only for places that still reference it */
  mono: "SpaceMono",
} as const;

export const type = {
  hero: { fontFamily: fonts.numeralXL, fontSize: 96, lineHeight: 100, letterSpacing: -4 },
  numeralL: { fontFamily: fonts.numeralXL, fontSize: 60, lineHeight: 64, letterSpacing: -2.5 },
  numeralM: { fontFamily: fonts.numeral, fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  numeralS: { fontFamily: fonts.numeral, fontSize: 22, lineHeight: 26, letterSpacing: -0.5 },
  title: { fontFamily: fonts.displayThin, fontSize: 28, lineHeight: 36, letterSpacing: -0.9 },
  heading: { fontFamily: fonts.displayThin, fontSize: 21, lineHeight: 28, letterSpacing: -0.6 },
  subheading: { fontFamily: fonts.display, fontSize: 15, lineHeight: 21, letterSpacing: -0.3 },
  punch: { fontFamily: fonts.punch, fontSize: 52, lineHeight: 50, letterSpacing: 0.4, textTransform: "uppercase" },
  wordmark: { fontFamily: fonts.displayThin, fontSize: 18, lineHeight: 22, letterSpacing: 6, textTransform: "uppercase" },
  body: { fontFamily: fonts.text, fontSize: 15, lineHeight: 23 },
  bodySm: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: fonts.text, fontSize: 11, lineHeight: 14, letterSpacing: 2.4 },
  button: { fontFamily: fonts.textMedium, fontSize: 14, lineHeight: 18, letterSpacing: 1.2 },
} as const;

export const motion = {
  fast: 160,
  base: 280,
  slow: 520,
  /** one orchestrated page entrance — stagger between hero + cards */
  stagger: 70,
} as const;

export const MIN_TAP = 44;
