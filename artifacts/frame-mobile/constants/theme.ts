/**
 * FRAME design system v3 — "Dark Chrome" (client written direction).
 *
 * Neutral black canvas, charcoal surfaces, crisp off-white text, and ONE muted
 * champagne gold used sparingly (primary action, selected state, key details).
 * Depth = surface brightness steps + fine white borders + a faint top-edge
 * highlight. Atmospheric light lives in a separate decorative layer
 * (components/ui/Atmosphere) — never on cards. Blur/translucency only for the
 * tab bar and overlays. One sans family (Inter Tight, 400/500/600).
 *
 * The coach web app mirrors these values in artifacts/coach/src/index.css.
 * Canonical names are at the top of each group; the "legacy" aliases keep older
 * screens compiling and resolve to the same neutral values — prefer canonical.
 */
import colors from "@/constants/colors";

export const brand = {
  bg: colors.dark.background,
  gold: colors.dark.primary,
  red: colors.dark.destructive,
  text: colors.dark.foreground,
} as const;

export const palette = {
  // ---- canvas + surfaces (brightness steps, no hue) ----
  bg: "#08090B",
  surface: "#111316",
  raised: "#191C20",
  overlay: "#1F2328", // menus, sheets, popovers

  // ---- text ----
  textHi: "#F4F4F1", // primary
  text: "#F4F4F1",
  textMid: "#A4A8AE", // secondary
  textLow: "#8A8F96", // quietest allowed: 5.5:1 on surface

  // ---- borders (white at 6–12%) ----
  hairline: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.12)",
  highlight: "rgba(255,255,255,0.07)", // faint top-edge highlight on cards

  // ---- the one accent: muted champagne gold ----
  gold: "#B9A477",
  goldPressed: "#A8946A",
  goldPale: "#D4C7A3", // hover / emphasis text on dark
  goldWash: "rgba(185,164,119,0.10)",
  goldHair: "rgba(185,164,119,0.28)",
  onGold: "#0B0C0E", // foreground on gold fills: 8.9:1

  // ---- status (always paired with a label) ----
  red: "#C0392F",
  redText: "#E5645A", // 5.6:1 on surface
  redWash: "rgba(229,100,90,0.07)",
  redHair: "rgba(229,100,90,0.30)",
  ok: "#8FB89A",
  silver: "#C9CDD2",

  // ---- scrims ----
  scrim: "rgba(8,9,11,0.72)",

  // ---- legacy aliases (same neutral values) ----
  ink: "#08090B",
  graphite0: "#08090B",
  graphite1: "#111316",
  graphite2: "#191C20",
  graphite3: "#1F2328",
  goldSoft: "#A8946A",
  goldLight: "#B9A477",
  goldGlow: "rgba(185,164,119,0.30)",
  redLight: "#E5645A",
  redGlow: "rgba(229,100,90,0.24)",
  glass: "rgba(255,255,255,0.04)",
  glassStrong: "rgba(255,255,255,0.07)",
  glassEdge: "rgba(255,255,255,0.08)",
  glassEdgeHi: "rgba(255,255,255,0.14)",
} as const;

/** Gradient stops (expo-linear-gradient `colors` arrays). */
export const gradients = {
  screen: ["#08090B", "#08090B"] as const,
  /** very slight tonal gradient on solid card surfaces (top lighter) */
  card: ["#15181B", "#111316"] as const,
  cardRaised: ["#1E2226", "#191C20"] as const,
  cardGold: ["rgba(185,164,119,0.10)", "rgba(185,164,119,0.02)"] as const,
  cardRed: ["rgba(229,100,90,0.05)", "rgba(229,100,90,0.01)"] as const,
  goldButton: ["#BDA87B", "#B9A477"] as const,
  goldSheen: ["rgba(212,199,163,0.5)", "rgba(185,164,119,0)"] as const,
  tabBar: ["rgba(17,19,22,0.88)", "rgba(8,9,11,0.96)"] as const,
  /** scrim over imagery: reserves a stable dark band for text */
  imageScrim: ["rgba(8,9,11,0.55)", "rgba(8,9,11,0.10)", "rgba(8,9,11,0.55)", "rgba(8,9,11,0.96)"] as const,
};

/** Cards 16–20, controls 12–14. Pills ONLY for chips / filters / compact status. */
export const radius = {
  xs: 8,
  sm: 12, // controls
  md: 14, // controls (large) — buttons, inputs
  lg: 18, // cards
  xl: 20, // large cards / sheets
  pill: 999, // chips, filters, status only
} as const;

/** 4px grid. Screen padding 20–24. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;
export const SCREEN_PAD = 20;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 3,
  },
  overlay: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.55,
    shadowRadius: 36,
    elevation: 12,
  },
  /** legacy: the gold glow is gone — resolves to the plain card shadow */
  glow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 3,
  },
} as const;

/**
 * One family: Inter Tight, weights 400 / 500 / 600 only.
 * Keys are the names registered with expo-font in app/_layout.tsx.
 * Legacy keys (display, punch, numeral*, mono…) all resolve into this family.
 */
export const fonts = {
  regular: "InterTight",
  medium: "InterTightMedium",
  semi: "InterTightSemiBold",
  // legacy
  text: "InterTight",
  textMedium: "InterTightMedium",
  textSemi: "InterTightSemiBold",
  display: "InterTightSemiBold",
  displayThin: "InterTightMedium",
  punch: "InterTightSemiBold",
  punchSemi: "InterTightSemiBold",
  numeralXL: "InterTightSemiBold",
  numeral: "InterTightMedium",
  mono: "InterTight",
} as const;

const tnum = { fontVariant: ["tabular-nums"] as "tabular-nums"[] };

/**
 * Hierarchy (spec): hero 32–40 · screen title 26–30 · section 18–20 ·
 * body/chat 16–17 · labels 12–14. Tight tracking on big sizes. Numerals tabular.
 */
export const type = {
  hero: { fontFamily: fonts.semi, fontSize: 40, lineHeight: 44, letterSpacing: -1.4 },
  title: { fontFamily: fonts.semi, fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  heading: { fontFamily: fonts.semi, fontSize: 19, lineHeight: 26, letterSpacing: -0.3 },
  subheading: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  chat: { fontFamily: fonts.regular, fontSize: 16.5, lineHeight: 26 },
  bodySm: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  /** short sentence-case category label — use sparingly (<= 2 words) */
  eyebrow: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  button: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 20, letterSpacing: -0.1 },
  wordmark: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 20, letterSpacing: 4 },
  // metrics / timers / countdowns — tabular numerals
  numeralHero: { fontFamily: fonts.semi, fontSize: 56, lineHeight: 60, letterSpacing: -2, ...tnum },
  numeralL: { fontFamily: fonts.semi, fontSize: 40, lineHeight: 44, letterSpacing: -1.4, ...tnum },
  numeralM: { fontFamily: fonts.semi, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, ...tnum },
  numeralS: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 24, letterSpacing: -0.4, ...tnum },
  // legacy: "punch" headline is now just the hero headline (no caps, no italic)
  punch: { fontFamily: fonts.semi, fontSize: 40, lineHeight: 44, letterSpacing: -1.4 },
} as const;

/** Control feedback 150–220ms · panels / screens 250–350ms. Opacity + transform only. */
export const motion = {
  fast: 180,
  base: 220,
  slow: 320,
  stagger: 40,
} as const;

export const MIN_TAP = 44;
