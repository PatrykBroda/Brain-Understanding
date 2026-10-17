import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BreathCard, type Breath } from "@/components/BreathCard";
import { BlockCard } from "@/components/BlockCard";
import { Button, haptic } from "@/components/ui";
import { fonts, palette } from "@/constants/theme";

type StateStep = { type: "state"; content: string };
type BreathStep = { type: "breath" } & Breath;
type GroundingStep = { type: "grounding"; title?: string; prompts: string[] };
type FocusStep = { type: "focus"; content: string };

export type RegulateStep = StateStep | BreathStep | GroundingStep | FocusStep;
export type RegulateSequenceData = { steps: RegulateStep[] };

const STEP_LABEL: Record<string, string> = {
  state: "Assess",
  breath: "Breathe",
  grounding: "Ground",
  focus: "Focus",
};

const DEFAULT_PROMPTS = [
  "Name 5 things you can see right now",
  "Feel 4 surfaces your body is touching",
  "Identify 3 sounds in the room",
  "Notice 2 smells around you",
  "Name 1 thing you can taste",
];

function ContinueBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button title={label} onPress={onPress} variant="secondary" style={s.continueBtn} />
  );
}

function StateCard({ step, onDone }: { step: StateStep; onDone: () => void }) {
  return (
    <View style={s.stepPad}>
      <Text style={s.bodyText}>{step.content}</Text>
      <ContinueBtn label="Continue" onPress={onDone} />
    </View>
  );
}

function FocusCard({ step, onDone }: { step: FocusStep; onDone: () => void }) {
  return (
    <View style={s.stepPad}>
      <View style={s.focusBar}>
        <Text style={s.bodyText}>{step.content}</Text>
      </View>
      <ContinueBtn label="Done" onPress={onDone} />
    </View>
  );
}

function BreathStepCard({ step, onDone }: { step: BreathStep; onDone: () => void }) {
  const [breathDone, setBreathDone] = useState(false);
  const { type: _t, ...breathProps } = step;
  return (
    <View>
      <BreathCard breath={breathProps as Breath} embedded onComplete={() => setBreathDone(true)} />
      {breathDone && (
        <View style={[s.stepPad, { paddingTop: 0 }]}>
          <ContinueBtn label="Continue" onPress={onDone} />
        </View>
      )}
    </View>
  );
}

function GroundingCard({ step, onDone }: { step: GroundingStep; onDone: () => void }) {
  const prompts = step.prompts?.length ? step.prompts : DEFAULT_PROMPTS;
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);

  function advance() {
    if (idx + 1 >= prompts.length) setDone(true);
    else setIdx((i) => i + 1);
  }

  const remaining = prompts.length - idx;

  return (
    <View style={s.groundWrap}>
      {step.title ? <Text style={s.groundTitle}>{step.title}</Text> : null}
      {done ? (
        <View style={s.groundDone}>
          <Text style={s.anchored}>Anchored</Text>
          <ContinueBtn label="Continue" onPress={onDone} />
        </View>
      ) : (
        <View style={s.groundActive}>
          <Text style={s.bigCount}>{remaining}</Text>
          <Text style={s.groundPrompt}>{prompts[idx]}</Text>
          <View style={s.dots}>
            {prompts.map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  i === idx ? s.dotActive : i < idx ? s.dotPast : s.dotFuture,
                ]}
              />
            ))}
          </View>
          <ContinueBtn label="Got it" onPress={advance} />
        </View>
      )}
    </View>
  );
}

export function RegulateSequence({ data }: { data: RegulateSequenceData }) {
  const steps = data.steps ?? [];
  const [stepIdx, setStepIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  if (steps.length === 0) return null;

  function advance() {
    if (stepIdx + 1 >= steps.length) {
      haptic.success();
      setFinished(true);
    }
    else setStepIdx((i) => i + 1);
  }

  const step = steps[Math.min(stepIdx, steps.length - 1)]!;
  const label = STEP_LABEL[step.type] ?? step.type;

  return (
    <BlockCard kind="Regulate" meta={finished ? undefined : `${label}, step ${stepIdx + 1} of ${steps.length}`}>
      {finished ? (
        <View style={s.finishedPad}>
          <Text style={s.finishedText}>Sequence complete</Text>
        </View>
      ) : (
        <View>
          {step.type === "state" && <StateCard step={step} onDone={advance} />}
          {step.type === "breath" && <BreathStepCard step={step} onDone={advance} />}
          {step.type === "grounding" && <GroundingCard step={step} onDone={advance} />}
          {step.type === "focus" && <FocusCard step={step} onDone={advance} />}
        </View>
      )}

      {!finished && steps.length > 1 && (
        <View style={s.seqDots}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[s.seqDot, i === stepIdx ? s.seqDotActive : i < stepIdx ? s.seqDotPast : s.seqDotFuture]}
            />
          ))}
        </View>
      )}
    </BlockCard>
  );
}

const s = StyleSheet.create({
  stepPad: { paddingHorizontal: 16, paddingVertical: 16, gap: 16 },
  bodyText: { fontFamily: fonts.regular, fontSize: 16, color: palette.textHi, lineHeight: 24 },
  focusBar: {
    borderLeftWidth: 2,
    borderLeftColor: palette.gold,
    paddingLeft: 14,
    paddingVertical: 2,
  },
  continueBtn: { alignSelf: "stretch", minHeight: 48 },
  groundWrap: { alignItems: "center", paddingHorizontal: 16, paddingVertical: 20 },
  groundTitle: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid, marginBottom: 16 },
  groundDone: { alignItems: "center", gap: 16, alignSelf: "stretch" },
  anchored: { fontFamily: fonts.semi, fontSize: 24, letterSpacing: -0.5, color: palette.textHi },
  groundActive: { alignItems: "center", gap: 12, width: "100%" },
  bigCount: {
    fontFamily: fonts.semi,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.6,
    color: palette.textHi,
    fontVariant: ["tabular-nums"],
  },
  groundPrompt: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: palette.textHi,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 280,
  },
  dots: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 4 },
  dot: { borderRadius: 4 },
  dotActive: { width: 18, height: 6, backgroundColor: palette.gold },
  dotPast: { width: 6, height: 6, backgroundColor: palette.goldHair },
  dotFuture: { width: 6, height: 6, backgroundColor: palette.borderStrong },
  finishedPad: { paddingHorizontal: 16, paddingVertical: 28, alignItems: "center" },
  finishedText: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi },
  seqDots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingBottom: 14, paddingTop: 4 },
  seqDot: { borderRadius: 2 },
  seqDotActive: { width: 22, height: 4, backgroundColor: palette.gold },
  seqDotPast: { width: 8, height: 4, backgroundColor: palette.goldHair },
  seqDotFuture: { width: 8, height: 4, backgroundColor: palette.borderStrong },
});
