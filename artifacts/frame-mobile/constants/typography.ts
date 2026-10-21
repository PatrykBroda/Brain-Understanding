import type { TextStyle } from "react-native";

/**
 * Shared text styles for FRAME mobile.
 *
 * Replaces the old grey "code" treatment (Space Mono, tiny, uppercase, wide
 * tracking, #444–#888). Everything is Outfit in sentence case with no extra
 * letter-spacing, near-white, matching the Home sentence "No readiness
 * check-in today…" (`DisclosureNotice` in components/TodayCards.tsx).
 * Hierarchy comes from size (11–16) and weight (400/500/600), not from caps.
 *
 * Font family names must match those registered in app/_layout.tsx useFonts.
 */
export const FONT = {
  regular: "Outfit",
  medium: "Outfit_500Medium",
  semibold: "Outfit_600SemiBold",
} as const;

/** Primary near-white text (the "No readiness check-in today…" colour). */
export const TEXT_PRIMARY = "#cfcfcf";
/** Supporting text: slightly dimmer, still clearly readable on #050505. */
export const TEXT_SECONDARY = "#a8a8a8";

/** Running text / explanations. */
export const body: TextStyle = {
  fontFamily: FONT.regular,
  fontSize: 14,
  lineHeight: 21,
  letterSpacing: 0,
  color: TEXT_PRIMARY,
};

/** Section headings and card kickers (was 9–10px gold/grey tracked caps). */
export const sectionTitle: TextStyle = {
  fontFamily: FONT.semibold,
  fontSize: 13,
  lineHeight: 18,
  letterSpacing: 0,
  color: TEXT_PRIMARY,
};

/** Small labels, field names, buttons, chips. */
export const label: TextStyle = {
  fontFamily: FONT.medium,
  fontSize: 12,
  lineHeight: 16,
  letterSpacing: 0,
  color: TEXT_PRIMARY,
};

/** Supporting sentences and short summaries under a heading. */
export const caption: TextStyle = {
  fontFamily: FONT.regular,
  fontSize: 12,
  lineHeight: 17,
  letterSpacing: 0,
  color: TEXT_SECONDARY,
};

/** Dates, counts, timestamps and other tiny metadata. */
export const meta: TextStyle = {
  fontFamily: FONT.regular,
  fontSize: 11,
  lineHeight: 15,
  letterSpacing: 0,
  color: TEXT_SECONDARY,
};

const typography = { FONT, TEXT_PRIMARY, TEXT_SECONDARY, body, sectionTitle, label, caption, meta };
export default typography;

/** Sentence-case a lower-case data label for display ("fight week" → "Fight week"). */
export function sentence(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
