import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BreathCard, type Breath } from "@/components/BreathCard";
import { fonts, palette, radius } from "@/constants/theme";

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
    <Pressable style={s.continueBtn} onPress={onPress}>
      <Text style={s.continueText}>{label}</Text>
    </Pressable>
  );
}

function StateCard({ step, onDone }: { step: StateStep; onDone: () => void }) {
  return (
    <View style={s.stepPad}>
      <Text style={s.bodyText}>{step.content}</Text>
      <ContinueBtn label="Continue →" onPress={onDone} />
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
          <ContinueBtn label="Continue →" onPress={onDone} />
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
          <ContinueBtn label="Continue →" onPress={onDone} />
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
          <ContinueBtn label="Got it →" onPress={advance} />
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
    if (stepIdx + 1 >= steps.length) setFinished(true);
    else setStepIdx((i) => i + 1);
  }

  const step = steps[Math.min(stepIdx, steps.length - 1)]!;
  const label = STEP_LABEL[step.type] ?? step.type;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.headLabel}>REGULATE</Text>
        {!finished && (
          <Text style={s.headKind}>
            {label} · {stepIdx + 1}/{steps.length}
          </Text>
        )}
      </View>

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
              style={[
                s.seqDot,
                i === stepIdx ? s.seqDotActive : i < stepIdx ? s.seqDotPast : s.seqDotFuture,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginVertical: 10,
    borderWidth: 1,
    borderColor: palette.goldHair,
    borderRadius: radius.md,
    backgroundColor: "rgba(138,106,47,0.10)",
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    backgroundColor: palette.goldWash,
  },
  headLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.8,
    color: palette.goldLight,
  },
  headKind: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: palette.textMid,
    textTransform: "uppercase",
  },
  stepPad: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 16,
  },
  bodyText: {
    fontFamily: fonts.text,
    fontSize: 14.5,
    color: palette.text,
    lineHeight: 22,
  },
  focusBar: {
    borderLeftWidth: 2,
    borderLeftColor: palette.goldHair,
    paddingLeft: 14,
    paddingVertical: 2,
  },
  continueBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
  },
  continueText: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    color: palette.goldPale,
    textTransform: "uppercase",
  },
  groundWrap: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  groundTitle: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    color: palette.textMid,
    marginBottom: 18,
    textTransform: "uppercase",
  },
  groundDone: {
    alignItems: "center",
    gap: 16,
  },
  anchored: {
    fontFamily: fonts.displayItalic,
    fontSize: 34,
    color: palette.goldPale,
  },
  groundActive: {
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  bigCount: {
    fontFamily: fonts.numeralXL,
    fontSize: 96,
    lineHeight: 100,
    letterSpacing: -3,
    color: palette.goldLight,
    opacity: 0.55,
  },
  groundPrompt: {
    fontFamily: fonts.text,
    fontSize: 15,
    color: palette.text,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: { width: 18, height: 6, backgroundColor: palette.goldLight },
  dotPast: { width: 6, height: 6, backgroundColor: palette.goldHair },
  dotFuture: { width: 6, height: 6, backgroundColor: "rgba(255,244,224,0.18)" },
  finishedPad: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: "center",
  },
  finishedText: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    color: palette.goldLight,
    textTransform: "uppercase",
  },
  seqDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 14,
    paddingTop: 4,
  },
  seqDot: {
    borderRadius: 2,
  },
  seqDotActive: { width: 22, height: 4, backgroundColor: palette.goldLight },
  seqDotPast: { width: 8, height: 4, backgroundColor: palette.goldHair },
  seqDotFuture: { width: 8, height: 4, backgroundColor: "rgba(255,244,224,0.18)" },
});
