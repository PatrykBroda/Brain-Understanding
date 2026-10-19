import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";

import { palette, type as T } from "@/constants/theme";

/**
 * Short category label (<= 2 words), sentence case, e.g. "Today", "Recovery".
 * Use sparingly — for anything longer use <Label> (sentence case).
 */
export function Eyebrow({ style, ...p }: TextProps) {
  return (
    <Text
      {...p}
      style={[T.eyebrow as TextStyle, { color: palette.textMid }, style]}
    />
  );
}

/** Sentence-case supporting label (12–14px). */
export function Label({ style, ...p }: TextProps) {
  return <Text {...p} style={[T.label as TextStyle, { color: palette.textMid }, style]} />;
}

/** Headings. `size`: hero (40) · title (28) · heading/section (19) · sub (16). */
export function Display({
  size = "heading",
  style,
  ...p
}: TextProps & { size?: "hero" | "title" | "heading" | "sub" }) {
  const base = size === "hero" ? T.hero : size === "title" ? T.title : size === "sub" ? T.subheading : T.heading;
  return (
    <Text
      accessibilityRole="header"
      {...p}
      style={[base as TextStyle, { color: palette.textHi }, style]}
    />
  );
}

/** Hero headline (32–40, tight tracking). Alias of Display size="hero"; no caps, no italic. */
export function Punch({ style, ...p }: TextProps) {
  return (
    <Text
      accessibilityRole="header"
      {...p}
      style={[T.hero as TextStyle, { color: palette.textHi }, style]}
    />
  );
}

/** Wordmark text: FRAME. */
export function Wordmark({ style, ...p }: TextProps) {
  return <Text {...p} style={[T.wordmark as TextStyle, { color: palette.textHi, paddingLeft: 4 }, style]} />;
}

/** Tabular numeral for metrics / timers / countdowns. `size`: hero (56) · l (40) · m (28) · s (20). */
export function Numeral({
  size = "l",
  style,
  ...p
}: TextProps & { size?: "hero" | "l" | "m" | "s" }) {
  const base = size === "hero" ? T.numeralHero : size === "l" ? T.numeralL : size === "m" ? T.numeralM : T.numeralS;
  return <Text {...p} style={[base as TextStyle, { color: palette.textHi }, style]} />;
}

export function Body({ small, style, ...p }: TextProps & { small?: boolean }) {
  return (
    <Text
      {...p}
      style={[(small ? T.bodySm : T.body) as TextStyle, { color: palette.textMid }, style]}
    />
  );
}
