import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { fonts, palette, radius } from "@/constants/theme";

/** Glass text field with a small uppercase label; edge turns bronze on focus. */
export function Field({
  label,
  error,
  style,
  onFocus,
  onBlur,
  inputRef,
  ...p
}: TextInputProps & {
  label?: string;
  error?: string | null;
  inputRef?: React.Ref<TextInput>;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={inputRef}
        accessibilityLabel={p.accessibilityLabel ?? label}
        placeholderTextColor={palette.textLow}
        selectionColor={palette.goldLight}
        {...p}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focus && { borderColor: "rgba(199,161,90,0.7)", backgroundColor: palette.glassStrong },
          error ? { borderColor: "rgba(224,86,78,0.55)" } : null,
          style,
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.goldLight,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 54,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    color: palette.textHi,
    fontFamily: fonts.text,
    fontSize: 16,
    // web: the bronze focus edge replaces the browser's default white ring
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  error: { fontFamily: fonts.text, fontSize: 12.5, color: palette.redLight },
});
