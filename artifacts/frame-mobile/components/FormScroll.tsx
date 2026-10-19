import React from "react";
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

/**
 * The scroll container for every screen with text inputs (onboarding, sign-up, Camp
 * forms). With the keyboard open:
 *  - the focused field is scrolled into view and the content can still be scrolled to
 *    its end (react-native-keyboard-controller adds the keyboard's height as space),
 *  - dragging the list dismisses the keyboard (interactive on iOS),
 *  - tapping anywhere that is not a control dismisses it (taps on buttons, chips and
 *    inputs still work: keyboardShouldPersistTaps="handled"),
 *  - nothing typed is lost: dismissing a keyboard only blurs, it never clears.
 */
export function FormScroll({
  children,
  contentContainerStyle,
  bottomOffset = 48,
  ...props
}: ScrollViewProps & { bottomOffset?: number; contentContainerStyle?: StyleProp<ViewStyle> }) {
  return (
    <KeyboardAwareScrollViewCompat
      bottomOffset={bottomOffset}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
      {...props}
    >
      <TapOutside>{children}</TapOutside>
    </KeyboardAwareScrollViewCompat>
  );
}

/** A full-size, non-accessible tap target behind the content: tap on empty space hides the keyboard. */
export function TapOutside({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessible={false} onPress={() => Keyboard.dismiss()} style={[styles.fill, style]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({ fill: { flexGrow: 1 } });

// Re-exported so a screen that already owns a ScrollView can adopt just the dismiss props.
export const dismissProps = {
  keyboardShouldPersistTaps: "handled" as const,
  keyboardDismissMode: (Platform.OS === "ios" ? "interactive" : "on-drag") as "interactive" | "on-drag",
};

export { ScrollView };
