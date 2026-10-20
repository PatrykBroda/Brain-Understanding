import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import type { Fighter } from "@/context/FighterContext";
import { apiPatch } from "@/lib/api";
import { ageFromDateOfBirth, dateOfBirthFromParts, normaliseDateOfBirthPart, type DateOfBirthParts } from "@/lib/dateOfBirth";
import { commitFighterProfile } from "@/lib/fighterProfileCache";
import { levelLabelForSport, levelsForSport } from "@/lib/fighterOptions";
import { KEYBOARD_DONE_ID } from "@/components/KeyboardDoneBar";
import { SAVE_TIMEOUT_MS, describeSaveFailure, withTimeout } from "@/lib/onboarding";
import { sharedOnboardingTracker } from "@/lib/onboardingTracking";
import {
  REQUIRED_TOTAL,
  answeredCount,
  draftChanged,
  draftFromFighter,
  frequencyChoicesFor,
  newlyAnsweredSteps,
  questionsPatch,
  sportChoicesFor,
  type QuestionsDraft,
} from "@/lib/profileAnswers";
import { FREE_TEXT, RAW_TEXT } from "@/lib/textInputProps";

const ACCENT = "#8A6A2F";

// Unsaved edits survive leaving the tab / the screen unmounting (and the keyboard coming and going).
let unsaved: { userId: string; draft: QuestionsDraft } | null = null;

function ChipSelector({
  options,
  value,
  onSelect,
}: {
  options: { key: string; label: string }[];
  value: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={st.chipRow}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Pressable
            key={o.key}
            style={[st.chip, on && st.chipOn]}
            onPress={() => onSelect(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[st.chipText, on && st.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * ONBOARDING QUESTIONS: the original onboarding questions, answered and edited here after sign-up.
 * Pre-filled when answered, blank when not, saved with one Save through PATCH /fighter so Home,
 * State, Today's Focus and the coach read the latest.
 */
export function AnswersSection({ fighter, highlighted = false }: { fighter: Fighter; highlighted?: boolean }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const [draft, setDraft] = useState<QuestionsDraft>(() =>
    unsaved && unsaved.userId === userId ? unsaved.draft : draftFromFighter(fighter),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dobError, setDobError] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savingRef = useRef(false);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const lastBase = useRef(draftFromFighter(fighter));

  // Keep unsaved edits across unmounts.
  useEffect(() => {
    if (userId) unsaved = draftChanged(draft, fighter) ? { userId, draft } : null;
  }, [draft, fighter, userId]);

  // A refetch or a save elsewhere updates the fighter: follow it, but never overwrite what is being typed.
  useEffect(() => {
    const next = draftFromFighter(fighter);
    setDraft((cur) => (JSON.stringify(cur) === JSON.stringify(lastBase.current) ? next : cur));
    lastBase.current = next;
  }, [fighter]);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const set = (patch: Partial<QuestionsDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSavedAt(null);
    setError(null);
  };

  function setDobPart(part: keyof DateOfBirthParts, raw: string) {
    const value = normaliseDateOfBirthPart(raw, part);
    setDraft((d) => ({ ...d, dob: { ...d.dob, [part]: value } }));
    setDobError(false);
    setSavedAt(null);
    setError(null);
    if (part === "day" && value.length === 2) monthRef.current?.focus();
    else if (part === "month" && value.length === 2) yearRef.current?.focus();
  }

  const changed = draftChanged(draft, fighter);
  const answered = answeredCount(fighter);
  const dobIso = dateOfBirthFromParts(draft.dob);
  const age = dobIso ? ageFromDateOfBirth(dobIso) : null;

  async function save() {
    if (savingRef.current) return;
    const result = questionsPatch(draft, fighter);
    if (!result.ok) {
      setError(result.error);
      setDobError(/date|day|month|year/i.test(result.error));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (Object.keys(result.body).length === 0) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setDobError(false);
    try {
      const resp = await withTimeout(apiPatch<{ fighter: Fighter }>("/fighter", result.body), SAVE_TIMEOUT_MS);
      const saved = resp?.fighter;
      if (saved && userId) await commitFighterProfile(qc, userId, saved);
      else await qc.invalidateQueries({ queryKey: ["fighter"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
      const tracker = sharedOnboardingTracker();
      for (const step of newlyAnsweredSteps(fighter, saved ?? { ...fighter, ...(result.body as Partial<Fighter>) })) {
        tracker.track(step, "complete");
      }
      const next = draftFromFighter(saved ?? { ...fighter, ...(result.body as Partial<Fighter>) });
      lastBase.current = next;
      setDraft(next);
      unsaved = null;
      setSavedAt(Date.now());
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      sharedOnboardingTracker().track("questions_view", "error");
      setError(describeSaveFailure(e));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const sportOptions = sportChoicesFor(fighter.primarySport);
  const levelOptions = levelsForSport(draft.sport);

  return (
    <View style={[st.section, highlighted && st.sectionHighlight]}>
      <View style={st.header}>
        <Text style={st.overline}>ONBOARDING</Text>
        <Text style={st.title}>ONBOARDING QUESTIONS</Text>
        <Text style={st.progress}>
          {answered} OF {REQUIRED_TOTAL} ANSWERED
        </Text>
      </View>

      <View style={st.panel}>
        <View style={st.field}>
          <Text style={st.label}>DATE OF BIRTH</Text>
          <Text style={st.hint}>No hyphens needed</Text>
          <View style={st.dobRow}>
            <View style={st.dobField}>
              <Text style={st.dobLabel}>DAY</Text>
              <TextInput
                {...RAW_TEXT}
                style={[st.input, st.dobInput, dobError && st.inputError]}
                value={draft.dob.day}
                onChangeText={(v) => setDobPart("day", v)}
                placeholder="DD"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={2}
                textContentType="none"
                inputAccessoryViewID={KEYBOARD_DONE_ID}
              />
            </View>
            <View style={st.dobField}>
              <Text style={st.dobLabel}>MONTH</Text>
              <TextInput
                {...RAW_TEXT}
                ref={monthRef}
                style={[st.input, st.dobInput, dobError && st.inputError]}
                value={draft.dob.month}
                onChangeText={(v) => setDobPart("month", v)}
                placeholder="MM"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={2}
                textContentType="none"
                inputAccessoryViewID={KEYBOARD_DONE_ID}
              />
            </View>
            <View style={[st.dobField, { flex: 1.45 }]}>
              <Text style={st.dobLabel}>YEAR</Text>
              <TextInput
                {...RAW_TEXT}
                ref={yearRef}
                style={[st.input, st.dobInput, dobError && st.inputError]}
                value={draft.dob.year}
                onChangeText={(v) => setDobPart("year", v)}
                placeholder="YYYY"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={4}
                textContentType="none"
                inputAccessoryViewID={KEYBOARD_DONE_ID}
              />
            </View>
          </View>
          {age != null ? <Text style={st.age}>{age} YEARS OLD</Text> : null}
        </View>

        <View style={st.field}>
          <Text style={st.label}>PRIMARY SPORT</Text>
          <ChipSelector
            options={sportOptions}
            value={draft.sport}
            onSelect={(k) => {
              void Haptics.selectionAsync();
              // Levels differ per sport: keep the level only when it exists for the new sport.
              const keep = levelsForSport(k).some((l) => l.key === draft.level);
              set({ sport: k, level: keep ? draft.level : "" });
            }}
          />
        </View>

        {draft.sport ? (
          <View style={st.field}>
            <Text style={st.label}>{levelLabelForSport(draft.sport).toUpperCase()}</Text>
            <ChipSelector
              options={levelOptions}
              value={draft.level}
              onSelect={(k) => {
                void Haptics.selectionAsync();
                set({ level: k });
              }}
            />
          </View>
        ) : null}

        <View style={st.field}>
          <Text style={st.label}>TRAINING FREQUENCY</Text>
          <ChipSelector
            options={frequencyChoicesFor(fighter.trainingFrequency)}
            value={draft.freq}
            onSelect={(k) => {
              void Haptics.selectionAsync();
              set({ freq: k });
            }}
          />
        </View>

        <View style={st.field}>
          <Text style={st.label}>PRIMARY GOALS</Text>
          <TextInput
            {...FREE_TEXT}
            style={[st.input, st.textarea]}
            value={draft.goals}
            onChangeText={(v) => set({ goals: v })}
            placeholder="What are you here to build?"
            placeholderTextColor="#444"
            multiline
            maxLength={2000}
            inputAccessoryViewID={KEYBOARD_DONE_ID}
          />
        </View>

        <View style={st.field}>
          <Text style={st.label}>KNOWN WEAKNESSES</Text>
          <TextInput
            {...FREE_TEXT}
            style={[st.input, st.textarea]}
            value={draft.weaknesses}
            onChangeText={(v) => set({ weaknesses: v })}
            placeholder="What breaks first when pressure spikes?"
            placeholderTextColor="#444"
            multiline
            maxLength={2000}
            inputAccessoryViewID={KEYBOARD_DONE_ID}
          />
        </View>

        {error ? (
          <Text style={st.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={st.saveRow}>
          <Pressable
            onPress={() => void save()}
            disabled={saving || (!changed && !error)}
            style={({ pressed }) => [st.saveBtn, (pressed || saving || (!changed && !error)) && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel={error ? "Try saving again" : "Save onboarding answers"}
          >
            {saving ? (
              <ActivityIndicator color="#050505" size="small" />
            ) : (
              <Text style={st.saveText}>{error ? "TRY AGAIN" : "SAVE"}</Text>
            )}
          </Pressable>
          {savedAt && !changed && !error ? <Text style={st.saved}>SAVED</Text> : null}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginBottom: 32 },
  sectionHighlight: { borderLeftWidth: 2, borderLeftColor: ACCENT, paddingLeft: 10, marginLeft: -12 },
  header: { marginBottom: 16 },
  overline: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 5, color: "rgba(255,255,255,0.45)", marginBottom: 6 },
  title: { fontFamily: "Outfit", fontSize: 18, letterSpacing: 3, color: "rgba(255,255,255,0.9)" },
  progress: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 3, color: ACCENT, marginTop: 8 },
  panel: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.018)",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 24,
  },
  field: { gap: 0 },
  label: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 3, color: ACCENT, marginBottom: 12 },
  hint: { fontFamily: "Outfit", fontSize: 12, color: "#444", marginBottom: 8, marginTop: -4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#1a1a1a", paddingHorizontal: 16, paddingVertical: 10 },
  chipOn: { borderColor: ACCENT, backgroundColor: "rgba(138,106,47,0.1)" },
  chipText: { fontFamily: "Outfit", fontSize: 14, color: "#666", letterSpacing: 0.5 },
  chipTextOn: { color: ACCENT },
  dobRow: { flexDirection: "row", gap: 10 },
  dobField: { flex: 1 },
  dobLabel: { fontFamily: "SpaceMono", fontSize: 8, letterSpacing: 1.5, color: "#666", marginBottom: 6 },
  dobInput: { textAlign: "center", paddingHorizontal: 8, fontSize: 18 },
  age: { marginTop: 12, fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 2, color: ACCENT },
  input: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputError: { borderColor: "#BF1D1D" },
  textarea: { height: 90, textAlignVertical: "top", paddingTop: 14 },
  error: { fontFamily: "Outfit", fontSize: 13, color: "#BF1D1D" },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  saveBtn: { backgroundColor: ACCENT, paddingHorizontal: 28, paddingVertical: 14, minWidth: 140, alignItems: "center" },
  saveText: { fontFamily: "SpaceMono", fontSize: 11, letterSpacing: 3, color: "#050505" },
  saved: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 3, color: ACCENT },
});
