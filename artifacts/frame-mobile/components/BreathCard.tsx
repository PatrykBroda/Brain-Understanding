import React, { useEffect, useMemo, useReducer, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import {
  type Breath,
  type Phase,
  buildPhases,
  clampSec,
  makeBreathReducer,
} from "@/lib/breathReducer";
import { BlockCard } from "@/components/BlockCard";
import { Button, haptic, useReducedMotion } from "@/components/ui";
import { fonts, palette, radius } from "@/constants/theme";

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

  const reduceMotion = useReducedMotion();
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
    if (running) haptic.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIdx, round]);

  useEffect(() => {
    if (done) {
      haptic.success();
      onComplete?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const current = phases[Math.min(phaseIdx, Math.max(0, phases.length - 1))];
  const targetScale = running || done ? current?.scale ?? 0.62 : 0.62;
  const transitionMs = running && current ? current.seconds * 1000 : 400;

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: targetScale,
      duration: reduceMotion ? 0 : transitionMs,
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
                fill="rgba(255,255,255,0.04)"
                stroke={palette.gold}
                strokeWidth={1}
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
            <Button title="Begin" onPress={() => dispatch({ type: "BEGIN" })} style={s.btn} />
          )}
          {running && <Button title="Pause" variant="secondary" onPress={() => dispatch({ type: "PAUSE" })} style={s.btn} />}
          {!running && (phaseIdx > 0 || round > 1 || done) && (
            <Button title="Reset" variant="secondary" onPress={reset} style={s.btn} />
          )}
          {!running && phaseIdx > 0 && !done && (
            <Button title="Resume" onPress={() => dispatch({ type: "BEGIN" })} style={s.btn} />
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

  return <BlockCard kind="Breathing">{inner}</BlockCard>;
}

const s = StyleSheet.create({
  title: {
    paddingHorizontal: 16,
    paddingTop: 8,
    fontFamily: fonts.semi,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.3,
    color: palette.textHi,
  },
  purpose: {
    paddingHorizontal: 16,
    paddingTop: 4,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: palette.textMid,
    lineHeight: 20,
  },
  stage: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  octWrap: { width: 176, height: 176, alignItems: "center", justifyContent: "center" },
  octFill: { position: "absolute", width: 160, height: 160 },
  octCenter: { alignItems: "center" },
  phaseLabel: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  count: {
    fontFamily: fonts.semi,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.6,
    color: palette.textHi,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  roundLine: {
    marginTop: 16,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: palette.textMid,
    fontVariant: ["tabular-nums"],
  },
  controls: { marginTop: 16, flexDirection: "row", gap: 12, alignSelf: "stretch" },
  btn: { flex: 1, minHeight: 48 },
  phaseList: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  phaseChip: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: palette.textMid,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
    fontVariant: ["tabular-nums"],
  },
  phaseChipActive: {
    color: palette.textHi,
    backgroundColor: palette.raised,
    borderColor: palette.goldHair,
  },
  note: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderStrong,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: palette.textMid,
    lineHeight: 20,
  },
});
