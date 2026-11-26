import { palette } from "@/constants/entryTheme";

/**
 * One tab bar look for the parent and coach layers. Labels are short, one line, and do not scale with the
 * system font size, so five tabs still fit on a 390 px wide phone without clipping.
 */
export const layerTabOptions = (bottomInset: number) => ({
  headerShown: false,
  tabBarActiveTintColor: palette.gold,
  tabBarInactiveTintColor: palette.textLow,
  tabBarStyle: { backgroundColor: "#0B0C0E", borderTopColor: "rgba(255,255,255,0.08)", height: 70 + bottomInset, paddingTop: 8, paddingBottom: Math.max(bottomInset, 12) },
  tabBarAllowFontScaling: false,
  tabBarLabelStyle: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0, marginBottom: 2, lineHeight: 14, height: 14, flexShrink: 0 },
  tabBarItemStyle: { paddingHorizontal: 0 },
});
