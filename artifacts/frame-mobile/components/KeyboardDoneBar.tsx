import React from "react";
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { FONT } from "@/constants/typography";


/** nativeID shared by every Field so iOS shows one "Done" bar above the keyboard. */
export const KEYBOARD_DONE_ID = "frame-keyboard-done";

/**
 * iOS number pads and multiline fields have no return key, so without this there is no
 * way to put the keyboard away except tapping outside. Render once near the app root.
 * Other platforms already have a hide-keyboard button (Android) or a return key (web).
 */
export function KeyboardDoneBar() {
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={styles.bar}>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Done, hide the keyboard"
          hitSlop={10}
          style={styles.btn}
        >
          <Text style={styles.text}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "#0a0a0a",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1a1a1a",
    paddingHorizontal: 12,
  },
  btn: { minHeight: 44, minWidth: 64, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  text: { fontFamily: FONT.medium, fontSize: 16, color: "#8A6A2F", letterSpacing: 0 },
});
