import { Atmosphere, Body, Button, Label, VideoBackdrop } from "@/components/entry";
import { FrameLogo } from "@/components/FrameLogo";
import { palette, SCREEN_PAD, space } from "@/constants/entryTheme";
import React, { useEffect, useRef } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { SUBLINE, TrainWithFrame } from "@/components/TrainWithFrame";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion as useReanimatedReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * First-launch entry sequence: monochrome loop, wordmark, the positioning line
 * and sub-line rising once, a thin progress line, and a Skip. Auto-dismisses
 * after `minMs`, then fades out (opacity only) before calling onDismiss.
 * Opacity + transform only; reduced motion = no rise, no progress sweep.
 */

const FADE_OUT_MS = 320;

function Rise({ index, children }: { index: number; children: React.ReactNode }) {
  const reduced = useReanimatedReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(120 + index * 140, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [index, p, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 8 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function EntrySequence({
  onDismiss,
  callsign,
  minMs = 2500,
}: {
  onDismiss: () => void;
  /** @deprecated v3: the sequence now carries the fixed positioning line */
  hero?: readonly string[];
  callsign?: string | null;
  minMs?: number;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const reduced = useReanimatedReducedMotion();
  const fade = useSharedValue(1);
  const progress = useSharedValue(0);
  const closingRef = useRef(false);
  const mountedAt = useRef(Date.now());

  const close = React.useCallback(
    (userInitiated: boolean) => {
      if (closingRef.current) return;
      closingRef.current = true;
      const elapsed = Date.now() - mountedAt.current;
      const dwell = userInitiated ? 0 : Math.max(0, minMs - elapsed);
      fade.value = withDelay(
        dwell,
        withTiming(0, { duration: FADE_OUT_MS, easing: Easing.out(Easing.ease) }, (done) => {
          if (done) runOnJS(onDismiss)();
        }),
      );
    },
    [fade, minMs, onDismiss],
  );

  useEffect(() => {
    progress.value = reduced ? 1 : withTiming(1, { duration: minMs, easing: Easing.linear });
    const t = setTimeout(() => close(false), minMs);
    return () => clearTimeout(t);
  }, [close, minMs, progress, reduced]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const trackW = useSharedValue(0);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.value - 1) * trackW.value }] }));

  const first = callsign?.trim().split(" ")[0] ?? null;

  return (
    <Animated.View style={[s.root, fadeStyle]}>
      <VideoBackdrop />
      <Atmosphere focus="topLeft" tone="silver" intensity={0.8} />

      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <FrameLogo height={16} />
        {first ? <Label>Welcome, {first}</Label> : null}
      </View>

      <View style={s.spacer} />

      <View style={[s.band, { paddingBottom: insets.bottom + 20 }]}>
        <Rise index={0}>
          <TrainWithFrame width={Math.min(400, screenW - 2 * (SCREEN_PAD + 4))} />
        </Rise>
        <Rise index={1}>
          <Body style={s.sub}>{SUBLINE}</Body>
        </Rise>
        <View
          style={s.track}
          onLayout={(e) => {
            trackW.value = e.nativeEvent.layout.width;
          }}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Animated.View style={[s.bar, barStyle]} />
        </View>
        <View style={s.skipRow}>
          <Button title="Skip" variant="ghost" onPress={() => close(true)} style={s.skip} quiet />
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.bg, zIndex: 50 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_PAD + 4,
  },
  logo: { width: 40, height: 40 },
  spacer: { flex: 1 },
  band: { paddingHorizontal: SCREEN_PAD + 4 },
  headline: { fontSize: 36, lineHeight: 40, letterSpacing: -1.2 },
  sub: { marginTop: space.lg, fontSize: 17, lineHeight: 24, color: palette.textHi, textAlign: "center" },
  track: {
    height: 2,
    marginTop: space.xl,
    borderRadius: 1,
    backgroundColor: palette.border,
    overflow: "hidden",
  },
  bar: { height: 2, width: "100%", backgroundColor: palette.gold },
  skipRow: { alignItems: "flex-start", marginTop: space.sm },
  skip: { paddingHorizontal: 0, minHeight: 44, minWidth: 64, alignItems: "flex-start" },
});
