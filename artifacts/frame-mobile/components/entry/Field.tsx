import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { fonts, palette, radius } from "@/constants/entryTheme";
import { KEYBOARD_DONE_ID } from "@/components/KeyboardDoneBar";

/** Text field: surface fill, 1px border, radius 14. Sentence-case label above; border brightens (gold hairline) on focus. */
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
        selectionColor={palette.gold}
        // Every field gets the iOS "Done" bar (number pads and multiline have no return key).
        inputAccessoryViewID={p.inputAccessoryViewID ?? KEYBOARD_DONE_ID}
        returnKeyType={p.returnKeyType ?? (p.multiline ? undefined : "done")}
        blurOnSubmit={p.blurOnSubmit ?? !p.multiline}
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
          focus && { borderColor: palette.goldHair, backgroundColor: palette.raised },
          error ? { borderColor: palette.redHair } : null,
          p.editable === false ? { opacity: 0.5 } : null,
          style,
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid },
  input: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    color: palette.textHi,
    fontFamily: fonts.regular,
    fontSize: 16,
    // web: the border change replaces the browser's default ring
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  error: { fontFamily: fonts.regular, fontSize: 13, color: palette.redText },
});
