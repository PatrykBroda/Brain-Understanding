import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useReducer, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import {
  type Breath,
  type Phase,
  buildPhases,
  clampSec,
  makeBreathReducer,
} from "@/lib/breathReducer";

export type { Breath };

const OCTAGON = "30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30";

export function BreathCard({
  breath,
  embedded,
  onComplete,
}: {
  breath: Breath;
  embedded?: boolean;
  onComplete?: () => void;
}) {
  const phases = useMemo(
    () => buildPhases(breath),
    [breath.inhale, breath.holdIn, breath.exhale, breath.holdOut],
  );
  const totalRounds = Math.max(1, Math.min(20, clampSec(breath.rounds, 5) || 5));

  const reducer = useMemo(() => makeBreathReducer(phases, totalRounds), [phases, totalRounds]);
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    running: false,
    phaseIdx: 0,
    remaining: phases[0]?.seconds ?? 0,
    round: 1,
    done: false,
  }));
  const { running, phaseIdx, remaining, round, done } = state;

  const scaleAnim = useRef(new Animated.Value(0.62)).current;
  const hapticReady = useRef(false);

  const reset = () => dispatch({ type: "RESET" });

  // Re-arm the engine if the breath spec changes.
  useEffect(() => {
    dispatch({ type: "RESET" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducer]);

  // One tick per second while running; the reducer owns all transitions.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Light haptic on each phase boundary (skip the first mount).
  useEffect(() => {
    if (!hapticReady.current) {
      hapticReady.current = true;
      return;
    }
    if (running) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIdx, round]);

  useEffect(() => {
    if (done) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const current = phases[Math.min(phaseIdx, Math.max(0, phases.length - 1))];
  const targetScale = running || done ? current?.scale ?? 0.62 : 0.62;
  const transitionMs = running && current ? current.seconds * 1000 : 400;

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: targetScale,
      duration: transitionMs,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: Platform.OS !== "web",
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIdx, running, done]);

  if (phases.length === 0 || !current) return null;

  const inner = (
    <>
      {breath.title ? <Text style={s.title}>{breath.title}</Text> : null}
      {breath.purpose ? <Text style={s.purpose}>{breath.purpose}</Text> : null}

      <View style={s.stage}>
        <View style={s.octWrap}>
          <Animated.View style={[s.octFill, { transform: [{ scale: scaleAnim }] }]}>
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              <Polygon
                points={OCTAGON}
                fill="rgba(138,106,47,0.10)"
                stroke="rgba(138,106,47,0.70)"
                strokeWidth={2}
              />
            </Svg>
          </Animated.View>
          <View style={s.octCenter}>
            <Text style={s.phaseLabel}>
              {done ? "Done" : running ? current.label : "Ready"}
            </Text>
            {!done && (
              <Text style={s.count}>{running ? remaining : current.seconds}</Text>
            )}
          </View>
        </View>

        <Text style={s.roundLine}>
          {done ? `${totalRounds} rounds complete` : `Round ${round} / ${totalRounds}`}
        </Text>

        <View style={s.controls}>
          {!running && !done && (
            <Pressable style={s.btnPrimary} onPress={() => dispatch({ type: "BEGIN" })}>
              <Text style={s.btnPrimaryText}>Begin</Text>
            </Pressable>
          )}
          {running && (
            <Pressable style={s.btnGhost} onPress={() => dispatch({ type: "PAUSE" })}>
              <Text style={s.btnGhostText}>Pause</Text>
            </Pressable>
          )}
          {!running && (phaseIdx > 0 || round > 1 || done) && (
            <Pressable style={s.btnGhost} onPress={reset}>
              <Text style={s.btnGhostText}>Reset</Text>
            </Pressable>
          )}
          {!running && phaseIdx > 0 && !done && (
            <Pressable style={s.btnPrimary} onPress={() => dispatch({ type: "BEGIN" })}>
              <Text style={s.btnPrimaryText}>Resume</Text>
            </Pressable>
          )}
        </View>

        <View style={s.phaseList}>
          {phases.map((p, i) => (
            <Text
              key={p.key + i}
              style={[s.phaseChip, running && i === phaseIdx && s.phaseChipActive]}
            >
              {p.label} {p.seconds}s
            </Text>
          ))}
        </View>
      </View>

      {breath.note ? <Text style={s.note}>{breath.note}</Text> : null}
    </>
  );

  if (embedded) return <View>{inner}</View>;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.headLabel}>REGULATE</Text>
        <Text style={s.headKind}>BREATH</Text>
      </View>
      {inner}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.30)",
    backgroundColor: "rgba(138,106,47,0.05)",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(138,106,47,0.20)",
    backgroundColor: "rgba(138,106,47,0.10)",
  },
  headLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "rgba(138,106,47,0.85)",
  },
  headKind: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "rgba(138,106,47,0.6)",
  },
  title: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 2,
    fontFamily: "SpaceMono",
    fontSize: 13,
    letterSpacing: 1,
    color: "#e0e0e0",
  },
  purpose: {
    paddingHorizontal: 14,
    paddingBottom: 2,
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#888",
    lineHeight: 19,
  },
  stage: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 22,
  },
  octWrap: {
    width: 176,
    height: 176,
    alignItems: "center",
    justifyContent: "center",
  },
  octFill: {
    position: "absolute",
    width: 160,
    height: 160,
  },
  octCenter: {
    alignItems: "center",
  },
  phaseLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "rgba(138,106,47,0.85)",
    textTransform: "uppercase",
  },
  count: {
    fontFamily: "SpaceMono",
    fontSize: 30,
    color: "#e0e0e0",
    marginTop: 4,
  },
  roundLine: {
    marginTop: 16,
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#666",
  },
  controls: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
  },
  btnPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.5)",
  },
  btnPrimaryText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#8A6A2F",
    textTransform: "uppercase",
  },
  btnGhost: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  btnGhostText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#999",
    textTransform: "uppercase",
  },
  phaseList: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  phaseChip: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1.5,
    color: "rgba(150,150,150,0.7)",
    textTransform: "uppercase",
  },
  phaseChipActive: {
    color: "#8A6A2F",
  },
  note: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(138,106,47,0.15)",
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#888",
    lineHeight: 19,
  },
});
