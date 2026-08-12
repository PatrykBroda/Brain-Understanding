import React, { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Native re-creation of the web splash / entry interstitial (see coach
 * src/pages/splash.tsx + components/entry-sequence.tsx). Brutalist documentary
 * look: pure black, overhead spotlight, heavy edge vignette, a stacked
 * uppercase aphorism that rises line-by-line, FRAME wordmark with a red
 * "MMA AI" tag, three bouncing loader dots, and a SKIP affordance. Auto-
 * dismisses after `minMs`, then fades out before calling onDismiss.
 *
 * Film grain from the web (SVG turbulence) has no native equivalent and is
 * intentionally omitted; everything else ports directly.
 */

const APHORISMS: ReadonlyArray<readonly string[]> = [
  ["MOST MISTAKES", "ARE NERVOUS SYSTEM", "MISTAKES"],
  ["PRESSURE IS NOT", "THE PROBLEM.", "FRAGMENTATION IS."],
  ["THE SYSTEM YOU BUILD", "IS THE SYSTEM", "THAT TESTS YOU."],
  ["COHERENCE", "BEATS", "INTENSITY."],
  ["POSITION BEFORE SUBMISSION.", "REGULATION", "BEFORE POSITION."],
  ["THE ROLL REVEALS", "WHAT THE DRILL", "HIDES."],
  ["TILT", "IS", "DATA."],
  ["ANCHOR", "BEFORE", "YOU ACT."],
  ["NARROW", "THE DECISION", "TREE."],
  ["THE FRAME IS BUILT", "ONE REP", "AT A TIME."],
];

const FADE_OUT_MS = 420;

function pickRotated(seed: number): readonly string[] {
  // Simple rotation away from the last shown index, persisted by the caller
  // through the module-level ref below (kept in-memory for the session).
  let idx = Math.floor(Math.random() * APHORISMS.length);
  if (idx === seed) idx = (idx + 1) % APHORISMS.length;
  lastIdxRef.current = idx;
  return APHORISMS[idx]!;
}
const lastIdxRef = { current: -1 };

function Line({ text, index }: { text: string; index: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      50 + index * 120,
      withTiming(1, { duration: 800, easing: Easing.bezier(0.2, 0.6, 0.2, 1) }),
    );
  }, [index, p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 8 }],
  }));
  return (
    <Animated.Text style={[s.heroLine, style]}>{text}</Animated.Text>
  );
}

function LoaderDot({ delay }: { delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 480, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 720, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(y);
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + (Math.abs(y.value) / 5) * 0.6,
    transform: [{ translateY: y.value }],
  }));
  return <Animated.View style={[s.dot, style]} />;
}

export function EntrySequence({
  onDismiss,
  hero,
  callsign,
  minMs = 2500,
}: {
  onDismiss: () => void;
  hero?: readonly string[];
  callsign?: string | null;
  minMs?: number;
}) {
  const insets = useSafeAreaInsets();
  const lines = useMemo(
    () => hero ?? pickRotated(lastIdxRef.current),
    [hero],
  );
  const fade = useSharedValue(1);
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
    const t = setTimeout(() => close(false), minMs);
    return () => clearTimeout(t);
  }, [close, minMs]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const sign = callsign?.split(" ")[0]?.toUpperCase() ?? "ATHLETE";

  return (
    <Animated.View style={[s.root, fadeStyle]}>
      {/* spotlight + vignette via SVG radial gradients (RN has no CSS radial) */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="spot" cx="50%" cy="8%" rx="80%" ry="45%">
            <Stop offset="0%" stopColor="#FFFAF0" stopOpacity={0.05} />
            <Stop offset="60%" stopColor="#FFFAF0" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="vig" cx="50%" cy="50%" rx="110%" ry="80%">
            <Stop offset="35%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="90%" stopColor="#000000" stopOpacity={0.7} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={1} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#spot)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#vig)" />
      </Svg>

      {/* TUNING FRAME · CALLSIGN */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerLeft}>
          <View style={s.headerDot} />
          <Text style={s.headerText}>TUNING FRAME</Text>
        </View>
        <Text style={s.callsign}>{sign}</Text>
      </View>

      {/* hero */}
      <View style={s.hero}>
        <View style={s.heroInner}>
          {lines.map((line, i) => (
            <Line key={`${line}-${i}`} text={line} index={i} />
          ))}
          <View style={s.loaderRow}>
            <LoaderDot delay={0} />
            <LoaderDot delay={180} />
            <LoaderDot delay={360} />
          </View>
        </View>
      </View>

      {/* wordmark + skip */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 24 }]}>
        <View style={s.wordmarkBlock}>
          <Text style={s.wordmark}>FRAME</Text>
          <Text style={s.mmaTag}>MMA AI</Text>
        </View>
        <Pressable onPress={() => close(true)} hitSlop={12}>
          <Text style={s.skip}>SKIP</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 50,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(216,156,79,0.85)",
  },
  headerText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3.2,
    color: "rgba(224,224,224,0.55)",
  },
  callsign: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3.2,
    color: "rgba(201,136,58,0.85)",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  heroInner: {
    alignItems: "center",
  },
  heroLine: {
    fontFamily: "SpaceMono",
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: 2,
    textAlign: "center",
    color: "rgba(224,224,224,0.95)",
  },
  loaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 40,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(224,224,224,0.4)",
  },
  footer: {
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 24,
  },
  wordmarkBlock: {
    alignItems: "center",
  },
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 26,
    letterSpacing: 12,
    paddingLeft: 12,
    color: "rgba(224,224,224,0.95)",
  },
  mmaTag: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 6,
    paddingLeft: 6,
    marginTop: 8,
    color: "rgba(217,58,58,0.78)",
  },
  skip: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 5.5,
    color: "rgba(224,224,224,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
