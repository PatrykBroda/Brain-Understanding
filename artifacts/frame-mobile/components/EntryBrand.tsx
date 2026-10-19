import React from "react";
import { View } from "react-native";

import { FrameLogo } from "@/components/FrameLogo";

/** FRAME wordmark at the top of entry screens (sign-in, sign-up, onboarding). */
export function EntryBrand({ compact = false }: { compact?: boolean }) {
  return (
    <View accessibilityRole="header" accessibilityLabel="Frame">
      <FrameLogo height={compact ? 14 : 16} />
    </View>
  );
}
