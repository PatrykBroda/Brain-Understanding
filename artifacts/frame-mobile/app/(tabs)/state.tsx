import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { OrbGL } from "@/components/OrbGL";
import { GOLD } from "@/constants/colors";
import { useToday } from "@/hooks/useToday";
import { stateHeadline } from "@/lib/today";

type OrbState =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

// One coaching cue per interpretive state. Deterministic — keyed to the same
// honestly-derived state as the orb label, never generated, never a metric.
const STATE_CUE: Record<OrbState, string> = {
  Dormant: "Step in. The frame reads what you feed it.",
  Stable: "Narrow the decision tree.",
  Loaded: "Trade speed for position.",
  Recovering: "Protect the rebuild.",
  Tight: "Commit earlier than comfort wants.",
  Volatile: "Anchor the breath before the exchange.",
  Composed: "Hold the standard. Add pressure, not pace.",
  Overextended: "Cut volume. Keep structure.",
};

// Short tips shown when the athlete taps the orb, one per tap, rotating.
// DRAFT COPY: needs Harry's sign-off before release (FRAME update 21 Oct, §5).
const STATE_TIPS: Record<OrbState, string[]> = {
  Dormant: [
    "Tell your coach how training went.",
    "Log a check-in. The read starts there.",
    "Name one thing you are working on.",
  ],
  Stable: [
    "Keep the plan simple. Execute it.",
    "One read, one answer. Don't hunt.",
    "Good day to sharpen one detail.",
  ],
  Loaded: [
    "Position first. Speed comes back.",
    "Shorter rounds, cleaner reps.",
    "Recover between efforts, not after.",
  ],
  Recovering: [
    "Quality over volume today.",
    "Move well before you move hard.",
    "Sleep is part of the session.",
  ],
  Tight: [
    "Exhale on the first move.",
    "Decide before the exchange starts.",
    "Loose shoulders, quick hands.",
  ],
  Volatile: [
    "Slow the breath. Then the feet.",
    "Reset your stance between exchanges.",
    "One clear intention per round.",
  ],
  Composed: [
    "Raise the pressure. Keep the shape.",
    "Test the standard against a harder look.",
    "Stay patient. Make them come to you.",
  ],
  Overextended: [
    "Fewer rounds. Same intent.",
    "Protect the structure. Drop the extras.",
    "Rest is part of the next session.",
  ],
};

/** "today's check-in (readiness 62/100)" → "today's check-in": no readiness wording on State. */
function stateWhy(source: string): string {
  const clean = source.replace(/\s*\([^)]*readiness[^)]*\)/gi, "").trim();
  if (!clean) return "";
  if (/^not enough/i.test(clean)) return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
  return `Read from ${clean}.`;
}

const TIP_MS = 3500;

export default function StateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // The server is the one authority on the athlete's State for their local day. An older
  // read is never presented as today's.
  const todayQuery = useToday();
  const today = todayQuery.data ?? null;
  const stateInfo = today?.state ?? null;
  const current = !!stateInfo?.current && !!stateInfo.name;
  // The orb only takes a state when it is today's read; otherwise it rests at Dormant.
  const state: OrbState = current && stateInfo?.name ? stateInfo.name : "Dormant";
  const loading = todayQuery.isLoading;
  const failed = todayQuery.isError && !todayQuery.data;


  // Why this state is showing, then what to do next.
  const why = loading
    ? ""
    : current && stateInfo
      ? stateWhy(stateInfo.source)
      : "FRAME holds no read for today, so the orb is resting.";
  const next = loading
    ? ""
    : current
      ? STATE_CUE[state]
      : "Check in or tell your coach how training went.";

  // Size the orb to the space it has: the centre area minus the caption, name and the two
  // explanation lines under it. It fills the width on most phones.
  const { width } = useWindowDimensions();
  const [centerHeight, setCenterHeight] = useState(0);
  const TEXT_AND_GAPS = 170 + (failed ? 50 : 0);
  const orbSize =
    centerHeight > 0
      ? Math.round(Math.max(120, Math.min(width, centerHeight - TEXT_AND_GAPS, 520)))
      : Math.round(Math.min(width * 0.85, 360)); // safe fallback before first layout

  // ── Orb interaction: drag (springs home) and tap (a short tip) ─────────────
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const maxX = width / 2;
  const maxY = Math.max(0, centerHeight / 2);
  const pan = Gesture.Pan()
    .onChange((e) => {
      tx.value = Math.max(-maxX, Math.min(maxX, tx.value + e.changeX));
      ty.value = Math.max(-maxY, Math.min(maxY, ty.value + e.changeY));
    })
    .onFinalize(() => {
      tx.value = withSpring(0, { damping: 14, stiffness: 140 });
      ty.value = withSpring(0, { damping: 14, stiffness: 140 });
    });

  const [tip, setTip] = useState<string | null>(null);
  const tipIndex = useRef(0);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTip = () => {
    const tips = STATE_TIPS[state];
    setTip(tips[tipIndex.current % tips.length]);
    tipIndex.current += 1;
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), TIP_MS);
  };
  useEffect(() => {
    tipIndex.current = 0;
    setTip(null);
  }, [state]);
  useEffect(() => () => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
  }, []);
  const tap = Gesture.Tap().runOnJS(true).onEnd((_e, success) => {
    if (success) showTip();
  });
  const orbGesture = Gesture.Exclusive(pan, tap);
  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header: the octagon only */}
      <View style={styles.header}>
        <Image
          source={require("@/assets/images/frame-octagon.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="FRAME"
        />
      </View>

      <View style={styles.center} onLayout={(e) => setCenterHeight(e.nativeEvent.layout.height)}>
        <GestureDetector gesture={orbGesture}>
          <Animated.View
            style={[{ width: orbSize, height: orbSize, zIndex: 2 }, orbStyle]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Your state orb: ${state}. Tap for a tip.`}
            accessibilityHint="Drag to move it; it springs back."
            onAccessibilityTap={showTip}
          >
            <OrbGL state={state} size={orbSize} />
            {tip ? (
              <Animated.View
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(220)}
                style={styles.tipWrap}
                pointerEvents="none"
              >
                <View style={styles.tipBubble}>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>
        </GestureDetector>

        <Text style={styles.stateCaption}>State</Text>
        {failed ? (
          <>
            <Text style={[styles.stateLabel, { color: "#666" }]}>Unavailable</Text>
            <Text style={styles.stateBody}>Couldn't load your state. Check your connection.</Text>
            <Pressable onPress={() => void todayQuery.refetch()} hitSlop={8} accessibilityRole="button">
              <View style={styles.retryRow}>
                <Text style={styles.retryText}>Try again</Text>
                <Feather name="chevron-right" size={14} color={GOLD} />
              </View>
            </Pressable>
          </>
        ) : (
          <>
            <Text
              style={[styles.stateLabel, !current && { color: "#666" }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {loading || !stateInfo ? (loading ? "Reading…" : "No read yet") : stateHeadline(stateInfo)}
            </Text>
            {why || next ? (
              <Text style={styles.stateBody}>{[why, next].filter(Boolean).join(" ")}</Text>
            ) : null}
          </>
        )}
      </View>

      {/* Continue into chat */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }]}>
        <Pressable
          style={({ pressed }) => [styles.enterBtn, pressed && styles.enterPressed]}
          onPress={() => router.push("/(tabs)/chat")}
          accessibilityRole="button"
        >
          <Text style={styles.enterText}>Continue</Text>
          <Feather name="chevron-right" size={16} color="#cfcfcf" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  logo: {
    width: 34,
    height: 34,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  tipWrap: {
    position: "absolute",
    top: "12%",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  tipBubble: {
    maxWidth: 280,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(5,5,5,0.82)",
  },
  tipText: {
    fontFamily: "Outfit",
    fontSize: 14,
    lineHeight: 20,
    color: "#cfcfcf",
    textAlign: "center",
  },
  stateCaption: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#999",
    marginTop: 8,
  },
  stateLabel: {
    fontFamily: "Outfit",
    fontSize: 28,
    color: GOLD,
    paddingHorizontal: 32,
  },
  stateBody: {
    fontFamily: "Outfit",
    fontSize: 15,
    lineHeight: 22,
    color: "#cfcfcf",
    textAlign: "center",
    paddingHorizontal: 32,
    maxWidth: 420,
  },
  retryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  retryText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: GOLD,
  },
  footer: {
    alignItems: "center",
    paddingTop: 16,
  },
  enterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  enterPressed: {
    opacity: 0.6,
  },
  enterText: {
    fontFamily: "Outfit",
    fontSize: 17,
    color: "#cfcfcf",
  },
});
