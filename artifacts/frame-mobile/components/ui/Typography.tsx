import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";

import { palette, type as T } from "@/constants/theme";

/** Small uppercase label that names what the content under it is. */
export function Eyebrow({ style, ...p }: TextProps) {
  return (
    <Text
      {...p}
      style={[T.label, { color: palette.textLow, textTransform: "uppercase" } as TextStyle, style]}
    />
  );
}

/** Thin wide display heading. `size`: title (28) · heading (21) · sub (15). */
export function Display({
  size = "heading",
  style,
  ...p
}: TextProps & { size?: "title" | "heading" | "sub" }) {
  const base = size === "title" ? T.title : size === "sub" ? T.subheading : T.heading;
  return (
    <Text
      accessibilityRole="header"
      {...p}
      style={[base as TextStyle, { color: palette.textHi }, style]}
    />
  );
}

/** Condensed bold italic caps (Nike / UFC headline). Use sparingly; pass fontSize in `style`. */
export function Punch({ style, ...p }: TextProps) {
  return (
    <Text
      accessibilityRole="header"
      {...p}
      style={[T.punch as TextStyle, { color: palette.textHi }, style]}
    />
  );
}

/** Wide thin wordmark text: FRAME. */
export function Wordmark({ style, ...p }: TextProps) {
  return <Text {...p} style={[T.wordmark as TextStyle, { color: palette.textHi, paddingLeft: 6 }, style]} />;
}

/** Oversized light-weight numeral. `size`: hero (88) · l (56) · m (34) · s (22). */
export function Numeral({
  size = "l",
  style,
  ...p
}: TextProps & { size?: "hero" | "l" | "m" | "s" }) {
  const base = size === "hero" ? T.hero : size === "l" ? T.numeralL : size === "m" ? T.numeralM : T.numeralS;
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
