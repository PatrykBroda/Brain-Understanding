import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";

import { fonts, palette } from "@/constants/theme";

/**
 * "TRAIN WITH FRAME®" lock-up, rebuilt as live vector + text from the client's reference
 * (a WhatsApp screenshot, so it is a design reference, not a production asset). Sharp at every
 * size. The five letters are drawn as strokes (the A is an open chevron, as in the artwork).
 * The client's original vector artwork should replace this when it arrives: see
 * TRAIN_WITH_FRAME_ARTWORK_SOURCE.
 */
export const TRAIN_WITH_FRAME_ARTWORK_SOURCE = "reconstructed from reference screenshot (client artwork still needed)";

const LETTERS = [
  "M12 94V6H78M12 48H66", // F
  "M132 94V6H182Q212 6 212 32Q212 58 182 58H132M178 58L214 94", // R
  "M242 94L282 6L322 94", // A (open chevron)
  "M372 94V6L412 60L452 6V94", // M
  "M552 6H502V94H552M502 50H544", // E
];

export const TAGLINE_CAPS = "Your corner team between training sessions";
export const SUBLINE = "AI coaching for fighters and athletes.";

export function TrainWithFrame({ width = 320, showTagline = true }: { width?: number; showTagline?: boolean }) {
  const h = (width * 118) / 600;
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Train with FRAME. ${TAGLINE_CAPS}.`}
      style={{ width }}
    >
      <Svg width={width} height={h} viewBox="0 0 600 118" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
        {LETTERS.map((d, i) => (
          <Path key={i} d={d} transform="translate(0 20)" stroke={palette.textHi} strokeWidth={11} strokeLinejoin="miter" strokeLinecap="butt" fill="none" />
        ))}
        <SvgText x={578} y={52} fill={palette.textHi} fontSize={18} fontFamily={fonts.medium} textAnchor="middle">
          ®
        </SvgText>
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
