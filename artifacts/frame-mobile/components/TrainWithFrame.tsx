import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { G, Text as SvgText } from "react-native-svg";

import { fonts, palette } from "@/constants/entryTheme";
import { FRAME_LOGO_BOX, FrameLogoGlyphs } from "@/components/FrameLogo";

/**
 * "TRAIN WITH FRAME®" lock-up, rebuilt as live vector + text from the client's reference
 * (a WhatsApp screenshot, so it is a design reference, not a production asset). Sharp at every
 * size. The wordmark is the shared FrameLogo glyph set (open-chevron A, ® mark).
 * The client's original vector artwork should replace this when it arrives: see
 * TRAIN_WITH_FRAME_ARTWORK_SOURCE.
 */
export const TRAIN_WITH_FRAME_ARTWORK_SOURCE = "reconstructed from reference screenshot (client artwork still needed)";

export const TAGLINE_CAPS = "Your corner team between training sessions";
export const SUBLINE = "AI coaching for fighters and athletes.";

export function TrainWithFrame({ width = 320, showTagline = true }: { width?: number; showTagline?: boolean }) {
  const h = (width * 102) / 600;
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Train with FRAME. ${TAGLINE_CAPS}.`}
      style={{ width }}
    >
      <Svg width={width} height={h} viewBox="0 0 600 102" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SvgText
          x={300}
          y={21}
          fill={palette.textHi}
          fontSize={22}
          fontFamily={fonts.medium}
          textAnchor="middle"
          letterSpacing={11}
        >
          TRAIN WITH
        </SvgText>
        <G transform={`translate(22 34) scale(0.36) translate(${-FRAME_LOGO_BOX.x} ${-FRAME_LOGO_BOX.y})`}>
          <FrameLogoGlyphs color={palette.textHi} />
        </G>
      </Svg>
      {showTagline ? (
        <Text style={s.tagline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
          {TAGLINE_CAPS}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  tagline: {
    marginTop: 10,
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 0.4,
    color: palette.gold,
    textAlign: "center",
  },
});
