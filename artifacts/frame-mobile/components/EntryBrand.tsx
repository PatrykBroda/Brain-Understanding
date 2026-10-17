import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { Wordmark } from "@/components/ui";

/** Logo + FRAME wordmark, used at the top of entry screens (sign-in, sign-up). */
export function EntryBrand({ compact = false }: { compact?: boolean }) {
  const size = compact ? 40 : 48;
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Frame">
      <Image
        source={require("../assets/images/frame-logo.png")}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityElementsHidden
      />
      <Wordmark>Frame</Wordmark>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
