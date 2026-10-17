import { Redirect, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useFighter, type Fighter } from "@/context/FighterContext";
import { apiPost } from "@/lib/api";
import {
  ageFromDateOfBirth,
  dateOfBirthFromParts,
  normaliseDateOfBirthPart,
  type DateOfBirthParts,
} from "@/lib/dateOfBirth";
import { commitFighterProfile } from "@/lib/fighterProfileCache";
import { shouldLeaveOnboarding } from "@/lib/onboardingRoute";
import {
  SPORTS,
  defaultLevelForSport,
  levelLabelForSport,
  levelsForSport,
} from "@/lib/fighterOptions";
import { EntryBrand } from "@/components/EntryBrand";
import {
  Body,
  Button,
  Display,
  FadeIn,
  Field,
  Label,
  AuthPanel,
  Punch,
  Screen,
  VideoBackdrop,
  haptic,
} from "@/components/ui";
import { fonts, MIN_TAP, palette, radius, SCREEN_PAD, space } from "@/constants/theme";

const FREQS = [
  { key: "1-2", label: "1-2x / week" },
  { key: "3-4", label: "3-4x / week" },
  { key: "5+", label: "5+ / week" },
];

const TOTAL_STEPS = 5;

const STEP_HEADINGS = [
  "What do they call you?",
  "When were you born?",
  "Where do you compete?",
  "How often do you train?",
  "What are you here to build?",
];

function ProgressBar({ step }: { step: number }) {
  return (
    <View
      style={pb.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step + 1} of ${TOTAL_STEPS}`}
      accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step + 1 }}
    >
      <Label style={pb.count}>
        Step {step + 1} of {TOTAL_STEPS}
      </Label>
      <View style={pb.track}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={[pb.seg, i <= step && pb.segOn]} />
        ))}
      </View>
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: { width: "100%", gap: 10 },
  count: { fontVariant: ["tabular-nums"] },
  track: { flexDirection: "row", gap: 6 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: palette.borderStrong },
  segOn: { backgroundColor: palette.gold },
});

/** "BJJ BELT" -> "BJJ belt" (lib labels are shouty; screens use sentence case). */
function sentenceCase(s: string): string {
  const t = s.toLowerCase();
  return (t.charAt(0).toUpperCase() + t.slice(1)).replace(/bjj/i, "BJJ");
}

function ChipSelector({
  options,
  value,
  onSelect,
}: {
  options: { key: string; label: string }[];
  value: string;
  onSelect: (k: string) => void;
}) {
  return (
    <View style={chip.row}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [chip.item, on && chip.selected, pressed && !on && chip.pressed]}
            onPress={() => {
              haptic.select();
              onSelect(o.key);
            }}
          >
            {on ? <Feather name="check" size={14} color={palette.goldPale} /> : null}
            <Text style={[chip.text, on && chip.selectedText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chip = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  item: {
    minHeight: MIN_TAP,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 18,
  },
  pressed: { backgroundColor: palette.raised },
  selected: { borderColor: palette.goldHair, backgroundColor: palette.goldWash },
  text: { fontFamily: fonts.medium, fontSize: 15, color: palette.textMid },
  selectedText: { color: palette.goldPale },
});

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { fighter } = useFighter();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState<DateOfBirthParts>({
    day: "",
    month: "",
    year: "",
  });
  const [sport, setSport] = useState("bjj");
  const [level, setLevel] = useState(() => defaultLevelForSport("bjj"));
  const [freq, setFreq] = useState("3-4");
  const [goals, setGoals] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const profileSaveCompletedRef = useRef(false);
  const monthInputRef = useRef<TextInput>(null);
  const yearInputRef = useRef<TextInput>(null);

  const dobDate = dateOfBirthFromParts(dob);
  const age = dobDate ? ageFromDateOfBirth(dobDate) : null;
  const leaveOnboarding = shouldLeaveOnboarding(
    !!fighter,
    profileSaveCompletedRef.current,
  );

  if (fighter) {
    profileSaveCompletedRef.current = true;
  }

  if (leaveOnboarding) {
    return <Redirect href="/(tabs)/home" />;
  }

  function updateDobPart(part: keyof DateOfBirthParts, raw: string) {
    const value = normaliseDateOfBirthPart(raw, part);
    setDob((current) => ({ ...current, [part]: value }));
    setDobError(null);

    if (part === "day" && value.length === 2) {
      monthInputRef.current?.focus();
    } else if (part === "month" && value.length === 2) {
      yearInputRef.current?.focus();
    }
  }

  function next() {
    if (step === 1) {
      if (!dobDate) {
        setDobError("Enter a valid date of birth.");
        return;
      }
      setDobError(null);
    }
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!dobDate) {
        setError("Date of birth is missing or invalid. Go back and choose a valid date.");
        return;
      }

      const response = await apiPost<{ fighter: Fighter }>("/fighter", {
          name: name.trim(),
          dateOfBirth: dobDate,
          art: sport,
          primarySport: sport,
          level,
          trainingFrequency: freq,
          goals: goals.trim() || null,
          weaknesses: weaknesses.trim() || null,
          personality: `Training ${freq} per week. Sport: ${sport}. ${levelLabelForSport(sport)}: ${level}.`,
        });

      if (!userId || !response.fighter) {
        throw new Error("Your fighter profile was saved, but could not be opened.");
      }

      profileSaveCompletedRef.current = true;
      await commitFighterProfile(qc, userId, response.fighter);
      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      setError((e as Error).message ?? "Setup failed. Try again.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const nextDisabled = step === 0 && !name.trim();

  return (
    <Screen light={null}>
      <VideoBackdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand + positioning line over the looping video (full-screen backdrop, dark scrim) */}
          <View style={[styles.band, step === 0 ? styles.bandTall : styles.bandShort, { paddingTop: insets.top + 16 }]}>
            <View style={styles.bandInner}>
              <EntryBrand compact />
              {step === 0 ? (
                <View style={{ marginTop: "auto" }}>
                  <Punch style={styles.headline}>Your corner team between training sessions.</Punch>
                  <Body style={styles.sub}>AI coaching for fighters and athletes.</Body>
                </View>
              ) : null}
            </View>
          </View>

          <FadeIn index={0} key={step} style={styles.cardWrap}>
            <AuthPanel>
            <ProgressBar step={step} />
            <Display size="title" style={styles.heading}>
              {STEP_HEADINGS[step]}
            </Display>

            {step === 0 && (
              <View style={styles.section}>
                <Field
                  label="Your name"
                  value={name}
                  onChangeText={setName}
                  placeholder="What do they call you?"
                  autoCapitalize="words"
                />
              </View>
            )}

            {step === 1 && (
              <View style={styles.section}>
                <Label style={styles.label}>Date of birth</Label>
                <View style={styles.dobRow}>
                  <View style={styles.dobField}>
                    <Field
                      label="Day"
                      style={[styles.dobInput, dobError ? styles.inputError : null]}
                      value={dob.day}
                      onChangeText={(value) => updateDobPart("day", value)}
                      placeholder="DD"
                      keyboardType="number-pad"
                      maxLength={2}
                      textContentType="none"
                    />
                  </View>
                  <View style={styles.dobField}>
                    <Field
                      label="Month"
                      inputRef={monthInputRef}
                      style={[styles.dobInput, dobError ? styles.inputError : null]}
                      value={dob.month}
                      onChangeText={(value) => updateDobPart("month", value)}
                      placeholder="MM"
                      keyboardType="number-pad"
                      maxLength={2}
                      textContentType="none"
                    />
                  </View>
                  <View style={[styles.dobField, styles.yearField]}>
                    <Field
                      label="Year"
                      inputRef={yearInputRef}
                      style={[styles.dobInput, dobError ? styles.inputError : null]}
                      value={dob.year}
                      onChangeText={(value) => updateDobPart("year", value)}
                      placeholder="YYYY"
                      keyboardType="number-pad"
                      maxLength={4}
                      textContentType="none"
                    />
                  </View>
                </View>
                {age != null ? <Text style={styles.ageConfirmation}>{age} years old</Text> : null}
                {dobError ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {dobError}
                  </Text>
                ) : null}
              </View>
            )}

            {step === 2 && (
              <View style={styles.section}>
                <Label style={styles.label}>Primary sport</Label>
                <ChipSelector
                  options={SPORTS}
                  value={sport}
                  onSelect={(nextSport) => {
                    setSport(nextSport);
                    setLevel(defaultLevelForSport(nextSport));
                  }}
                />

                <Label style={[styles.label, { marginTop: space.xl }]}>{sentenceCase(levelLabelForSport(sport))}</Label>
                <ChipSelector options={levelsForSport(sport)} value={level} onSelect={setLevel} />
              </View>
            )}

            {step === 3 && (
              <View style={styles.section}>
                <Label style={styles.label}>Training frequency</Label>
                <ChipSelector options={FREQS} value={freq} onSelect={setFreq} />
              </View>
            )}

            {step === 4 && (
              <View style={[styles.section, { gap: 20 }]}>
                <Field
                  label="Primary goals"
                  style={styles.textarea}
                  value={goals}
                  onChangeText={setGoals}
                  placeholder="What are you here to build?"
                  multiline
                  numberOfLines={3}
                />
                <Field
                  label="Known weaknesses"
                  style={styles.textarea}
                  value={weaknesses}
                  onChangeText={setWeaknesses}
                  placeholder="What breaks first when pressure spikes?"
                  multiline
                  numberOfLines={3}
                />

                {error ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.nav}>
              {step > 0 ? (
                <Button title="Back" variant="ghost" onPress={back} style={styles.backBtn} />
              ) : (
                <View />
              )}

              {step < TOTAL_STEPS - 1 ? (
                <Button title="Next" onPress={next} disabled={nextDisabled} style={styles.nextBtn} />
              ) : (
                <Button title="Finish setup" onPress={handleSubmit} loading={loading} style={styles.nextBtn} />
              )}
            </View>
            </AuthPanel>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  band: { overflow: "hidden", paddingHorizontal: SCREEN_PAD + 2 },
  bandTall: { minHeight: 240 },
  bandShort: { minHeight: 120 },
  bandInner: { flex: 1, paddingBottom: space.lg },
  headline: { fontSize: 32, lineHeight: 36, letterSpacing: -1 },
  sub: { marginTop: space.sm, fontSize: 16, lineHeight: 22 },
  cardWrap: { width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: SCREEN_PAD + 2, paddingTop: space.md },
  heading: { marginTop: space.lg, marginBottom: space.xl },
  section: { width: "100%" },
  label: { marginBottom: 12 },
  dobRow: { flexDirection: "row", gap: 10 },
  dobField: { flex: 1 },
  yearField: { flex: 1.45 },
  dobInput: { textAlign: "center", paddingHorizontal: 8, fontSize: 18, fontVariant: ["tabular-nums"] },
  inputError: { borderColor: palette.redHair },
  ageConfirmation: { marginTop: 14, fontFamily: fonts.medium, fontSize: 14, color: palette.goldPale, fontVariant: ["tabular-nums"] },
  textarea: { minHeight: 96, textAlignVertical: "top", paddingTop: 16 },
  errorText: { color: palette.redText, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 8 },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginTop: space.xxl,
  },
  backBtn: { minWidth: 88 },
  nextBtn: { minWidth: 160 },
});
