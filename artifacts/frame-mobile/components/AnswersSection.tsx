import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { QUESTIONS, normaliseFrequency, sportLabelFor } from "@workspace/onboarding";

import { Button, Display, Field, GlassCard, Label, haptic } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import type { Fighter } from "@/context/FighterContext";
import { apiPatch } from "@/lib/api";
import { normaliseDateOfBirthPart, type DateOfBirthParts } from "@/lib/dateOfBirth";
import { FREQUENCY_OPTIONS, SPORTS, LEGACY_SPORTS, levelLabelForSport, levelsForSport } from "@/lib/fighterOptions";
import { sentenceCaseLabel } from "@/lib/onboarding";
import {
  answeredCount,
  answersOf,
  chosenLabel,
  dobParts,
  dobPatch,
  frequencyPatch,
  questionPatch,
  sportPatch,
  textPatch,
  type PatchResult,
} from "@/lib/profileAnswers";

type Open = "dob" | "sport" | "frequency" | "goals" | "weaknesses" | `q:${string}` | null;

function Chips({
  options,
  value,
  onSelect,
}: {
  options: { key: string; label: string }[];
  value: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={st.chips}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              haptic.select();
              onSelect(o.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [st.chip, on && st.chipOn, pressed && !on && { backgroundColor: palette.raised }]}
          >
            <Text style={[st.chipText, on && st.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({
  label,
  value,
  open,
  onPress,
  saved,
  first,
  children,
}: {
  label: string;
  value: string | null;
  open: boolean;
  onPress: () => void;
  saved?: boolean;
  first?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={[!first && st.rule]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${value ?? "not answered"}. ${open ? "Close" : "Change"}`}
        style={({ pressed }) => [st.row, pressed && { backgroundColor: palette.raised }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.rowLabel}>{label}</Text>
          <Text style={[st.rowValue, !value && { color: palette.textLow }]} numberOfLines={open ? undefined : 2}>
            {value ?? "Not answered yet"}
          </Text>
        </View>
        {saved ? <Text style={st.saved}>Saved</Text> : null}
        <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={palette.textLow} />
      </Pressable>
      {open ? <View style={st.editor}>{children}</View> : null}
    </View>
  );
}

/**
 * The onboarding questionnaire, editable any time. Every change saves at once through the
 * same PATCH /fighter onboarding uses, so the coach, State and Today's Focus pick it up and
 * it is still there after closing and reopening the app.
 */
export function AnswersSection({ fighter }: { fighter: Fighter }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Open>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Drafts that are only saved on an explicit action.
  const [sport, setSport] = useState(fighter.primarySport ?? "");
  const [level, setLevel] = useState(fighter.level ?? "");
  const [dob, setDob] = useState<DateOfBirthParts>(dobParts(fighter.dateOfBirth));
  const [goals, setGoals] = useState(fighter.goals ?? "");
  const [weaknesses, setWeaknesses] = useState(fighter.weaknesses ?? "");

  // Keep drafts in step with what is saved (a save elsewhere, or a refetch).
  useEffect(() => {
    setSport(fighter.primarySport ?? "");
    setLevel(fighter.level ?? "");
    setDob(dobParts(fighter.dateOfBirth));
    setGoals(fighter.goals ?? "");
    setWeaknesses(fighter.weaknesses ?? "");
  }, [fighter.updatedAt]);

  useEffect(() => {
    if (!savedKey) return;
    const t = setTimeout(() => setSavedKey(null), 2200);
    return () => clearTimeout(t);
  }, [savedKey]);

  async function save(key: string, result: PatchResult, close = true) {
    if (!result.ok) {
      setError(result.error);
      haptic.error();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPatch("/fighter", result.body);
      await qc.invalidateQueries({ queryKey: ["fighter"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
      haptic.success();
      setSavedKey(key);
      if (close) setOpen(null);
    } catch (e) {
      haptic.error();
      setError(e instanceof Error && e.message ? e.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const toggle = (k: Open) => {
    setError(null);
    setOpen((o) => (o === k ? null : k));
  };

  const sportOptions = [...SPORTS, ...LEGACY_SPORTS.filter((s) => s.key === fighter.primarySport)];
  const levelOptions = levelsForSport(sport);
  const levelLabel = sentenceCaseLabel(levelLabelForSport(sport));
  const answers = answersOf(fighter);
  const sportText = fighter.primarySport
    ? `${sportLabelFor(fighter.primarySport) ?? fighter.primarySport}${fighter.level ? ` · ${fighter.level}` : ""}`
    : null;
  const dobText = fighter.dateOfBirth
    ? new Date(`${fighter.dateOfBirth}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  const freqText = fighter.trainingFrequency ? normaliseFrequency(fighter.trainingFrequency) : null;

  return (
    <View style={st.section}>
      <View style={st.head}>
        <Display size="heading">Your answers</Display>
        {saving ? <ActivityIndicator size="small" color={palette.textMid} /> : null}
      </View>
      <Text style={st.intro}>
        What you told FRAME when you joined. Change any of it, any time: your coach, State and Today&apos;s Focus use the latest. {answeredCount(fighter)} of {QUESTIONS.length} questions answered.
      </Text>
      <GlassCard padding={0}>
        <Row first label="Date of birth" value={dobText} open={open === "dob"} onPress={() => toggle("dob")} saved={savedKey === "dob"}>
          <View style={st.dobRow}>
            {(["day", "month", "year"] as const).map((part) => (
              <View key={part} style={{ flex: part === "year" ? 1.5 : 1 }}>
                <Field
                  label={part === "day" ? "Day" : part === "month" ? "Month" : "Year"}
                  value={dob[part]}
                  onChangeText={(v) => setDob((d) => ({ ...d, [part]: normaliseDateOfBirthPart(v, part) }))}
                  keyboardType="number-pad"
                  maxLength={part === "year" ? 4 : 2}
                  placeholder={part === "day" ? "DD" : part === "month" ? "MM" : "YYYY"}
                  style={st.dobInput}
                />
              </View>
            ))}
          </View>
          <Button title="Save date of birth" onPress={() => void save("dob", dobPatch(dob))} loading={saving} style={st.saveBtn} />
        </Row>

        <Row label="What you train" value={sportText} open={open === "sport"} onPress={() => toggle("sport")} saved={savedKey === "sport"}>
          <Label style={st.edLabel}>Primary sport</Label>
          <Chips
            options={sportOptions}
            value={sport}
            onSelect={(k) => {
              // Levels differ per sport: the old one is cleared and the new one must be chosen.
              if (k !== sport) setLevel("");
              setSport(k);
            }}
          />
          {sport ? (
            <>
              <Label style={[st.edLabel, { marginTop: 16 }]}>{levelLabel}</Label>
              <Chips
                options={levelOptions}
                value={level}
                onSelect={(k) => {
                  setLevel(k);
                  void save("sport", sportPatch(sport, k));
                }}
              />
            </>
          ) : null}
        </Row>

        <Row label="How often you train" value={freqText} open={open === "frequency"} onPress={() => toggle("frequency")} saved={savedKey === "frequency"}>
          <Chips
            options={FREQUENCY_OPTIONS}
            value={freqText ?? ""}
            onSelect={(k) => void save("frequency", frequencyPatch(k))}
          />
        </Row>

        <Row label="Goals" value={fighter.goals?.trim() ? fighter.goals : null} open={open === "goals"} onPress={() => toggle("goals")} saved={savedKey === "goals"}>
          <Field value={goals} onChangeText={setGoals} placeholder="What are you here to build?" multiline style={st.textarea} maxLength={2000} />
          <Button title="Save goals" onPress={() => void save("goals", textPatch("goals", goals))} loading={saving} style={st.saveBtn} />
        </Row>

        <Row label="Known weaknesses" value={fighter.weaknesses?.trim() ? fighter.weaknesses : null} open={open === "weaknesses"} onPress={() => toggle("weaknesses")} saved={savedKey === "weaknesses"}>
          <Field value={weaknesses} onChangeText={setWeaknesses} placeholder="What breaks first when pressure spikes?" multiline style={st.textarea} maxLength={2000} />
          <Button title="Save weaknesses" onPress={() => void save("weaknesses", textPatch("weaknesses", weaknesses))} loading={saving} style={st.saveBtn} />
        </Row>

        {QUESTIONS.map((q) => (
          <Row
            key={q.id}
            label={q.prompt}
            value={chosenLabel(fighter, q.id)}
            open={open === `q:${q.id}`}
            onPress={() => toggle(`q:${q.id}`)}
            saved={savedKey === `q:${q.id}`}
          >
            <View style={{ gap: 10 }}>
              {q.choices.map((c, idx) => {
                const on = answers[q.id] === idx;
                return (
                  <Pressable
                    key={c.label}
                    onPress={() => {
                      haptic.select();
                      void save(`q:${q.id}`, questionPatch(fighter, q.id, idx));
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [st.answer, on && st.answerOn, pressed && !on && { backgroundColor: palette.raised }]}
                  >
                    <Text style={[st.answerText, on && st.answerTextOn]}>{c.label}</Text>
                    {on ? <Feather name="check" size={18} color={palette.bg} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Row>
        ))}
      </GlassCard>
      {error ? (
        <Text style={st.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginBottom: 28 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, minHeight: 26 },
  intro: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, marginBottom: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, minHeight: MIN_TAP + 12 },
  rowLabel: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: palette.textMid },
  rowValue: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: palette.textHi },
  saved: { fontFamily: fonts.medium, fontSize: 12, color: palette.ok },
  editor: { paddingHorizontal: 20, paddingBottom: 18, gap: 12 },
  edLabel: { marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: MIN_TAP,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
  },
  chipOn: { backgroundColor: palette.textHi, borderColor: palette.textHi },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  chipTextOn: { color: palette.bg },
  dobRow: { flexDirection: "row", gap: 10 },
  dobInput: { textAlign: "center", paddingHorizontal: 8, fontVariant: ["tabular-nums"] },
  textarea: { minHeight: 96, textAlignVertical: "top", paddingTop: 14 },
  saveBtn: { alignSelf: "flex-start", minHeight: 48, paddingHorizontal: 22 },
  answer: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
  },
  answerOn: { backgroundColor: palette.textHi, borderColor: palette.textHi },
  answerText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: palette.textMid },
  answerTextOn: { color: palette.bg },
  error: { fontFamily: fonts.regular, fontSize: 14, color: palette.redText, marginTop: 10 },
});
