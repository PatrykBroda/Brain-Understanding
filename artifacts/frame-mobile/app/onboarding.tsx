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
import {
  Body,
  Button,
  Display,
  Eyebrow,
  FadeIn,
  Field,
  GlassCard,
  Numeral,
  Screen,
} from "@/components/ui";
import { fonts, MIN_TAP, palette, radius, space } from "@/constants/theme";

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
    >
      <View style={pb.numRow}>
        <Numeral size="m" style={{ color: palette.goldPale }}>
          {String(step + 1).padStart(2, "0")}
        </Numeral>
        <Text style={pb.of}>/ {String(TOTAL_STEPS).padStart(2, "0")}</Text>
      </View>
      <View style={pb.track}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={[pb.seg, i <= step && pb.segOn]} />
        ))}
      </View>
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: { width: "100%", marginBottom: space.xl, gap: 14 },
  numRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  of: { fontFamily: fonts.numeral, fontSize: 15, color: palette.textLow, letterSpacing: 1 },
  track: { flexDirection: "row", gap: 6 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: palette.glassStrong },
  segOn: { backgroundColor: palette.goldLight },
});

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
      {options.map((o) => (
        <Pressable
          key={o.key}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.key }}
          style={[chip.item, value === o.key && chip.selected]}
          onPress={() => onSelect(o.key)}
        >
          <Text style={[chip.text, value === o.key && chip.selectedText]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const chip = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  item: {
    minHeight: MIN_TAP,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.glass,
    paddingHorizontal: 20,
  },
  selected: { borderColor: palette.goldHair, backgroundColor: palette.goldWash },
  text: { fontFamily: fonts.textMedium, fontSize: 14, color: palette.textMid, letterSpacing: 0.3 },
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
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.inner,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FadeIn index={0} style={styles.top}>
            <Eyebrow style={{ color: palette.goldLight }}>FRAME</Eyebrow>
            <Body small style={{ color: palette.textLow, marginTop: 4 }}>
              LET'S SEE WHAT YOU BECOME UNDER PRESSURE
            </Body>
          </FadeIn>

          <FadeIn index={1} style={styles.cardWrap}>
            <ProgressBar step={step} />
            <GlassCard radius={32} padding={space.xl} blur>
              <Display size="heading" style={styles.heading}>
                {STEP_HEADINGS[step]}
              </Display>

              {step === 0 && (
                <View style={styles.section}>
                  <Field
                    label="YOUR NAME"
                    value={name}
                    onChangeText={setName}
                    placeholder="What do they call you?"
                    autoCapitalize="words"
                  />
                </View>
              )}

              {step === 1 && (
                <View style={styles.section}>
                  <Eyebrow style={styles.label}>DATE OF BIRTH</Eyebrow>
                  <Text style={styles.hint}>No hyphens needed</Text>
                  <View style={styles.dobRow}>
                    <View style={styles.dobField}>
                      <Field
                        label="DAY"
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
                        label="MONTH"
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
                        label="YEAR"
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
                  {age != null ? (
                    <Text style={styles.ageConfirmation}>{age} YEARS OLD</Text>
                  ) : null}
                  {dobError ? (
                    <Text style={styles.errorText} accessibilityRole="alert">
                      {dobError}
                    </Text>
                  ) : null}
                </View>
              )}

              {step === 2 && (
                <View style={styles.section}>
                  <Eyebrow style={styles.label}>PRIMARY SPORT</Eyebrow>
                  <ChipSelector
                    options={SPORTS}
                    value={sport}
                    onSelect={(nextSport) => {
                      setSport(nextSport);
                      setLevel(defaultLevelForSport(nextSport));
                    }}
                  />

                  <Eyebrow style={[styles.label, { marginTop: 28 }]}>
                    {levelLabelForSport(sport)}
                  </Eyebrow>
                  <ChipSelector
                    options={levelsForSport(sport)}
                    value={level}
                    onSelect={setLevel}
                  />
                </View>
              )}

              {step === 3 && (
                <View style={styles.section}>
                  <Eyebrow style={styles.label}>TRAINING FREQUENCY</Eyebrow>
                  <ChipSelector options={FREQS} value={freq} onSelect={setFreq} />
                </View>
              )}

              {step === 4 && (
                <View style={[styles.section, { gap: 20 }]}>
                  <Field
                    label="PRIMARY GOALS"
                    style={styles.textarea}
                    value={goals}
                    onChangeText={setGoals}
                    placeholder="What are you here to build?"
                    multiline
                    numberOfLines={3}
                  />
                  <Field
                    label="KNOWN WEAKNESSES"
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
            </GlassCard>

            <View style={styles.nav}>
              {step > 0 ? (
                <Pressable
                  onPress={back}
                  style={styles.backBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                >
                  <Text style={styles.backText}>BACK</Text>
                </Pressable>
              ) : (
                <View />
              )}

              {step < TOTAL_STEPS - 1 ? (
                <Button
                  title="NEXT"
                  onPress={next}
                  disabled={nextDisabled}
                  style={styles.nextBtn}
                />
              ) : (
                <Button
                  title="READING YOU..."
                  onPress={handleSubmit}
                  loading={loading}
                  style={styles.nextBtn}
                />
              )}
            </View>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { alignItems: "center", paddingHorizontal: 24 },
  top: { width: "100%", maxWidth: 440, marginBottom: space.xl },
  cardWrap: { width: "100%", maxWidth: 440 },
  heading: { marginBottom: space.xl },
  section: { width: "100%" },
  label: { color: palette.goldLight, marginBottom: 12 },
  hint: { fontFamily: fonts.text, fontSize: 12.5, color: palette.textLow, marginBottom: 12 },
  dobRow: { flexDirection: "row", gap: 10 },
  dobField: { flex: 1 },
  yearField: { flex: 1.45 },
  dobInput: { textAlign: "center", paddingHorizontal: 8, fontSize: 18 },
  inputError: { borderColor: "rgba(224,86,78,0.55)" },
  ageConfirmation: {
    marginTop: 14,
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.goldLight,
  },
  textarea: { minHeight: 96, textAlignVertical: "top", paddingTop: 16 },
  errorText: {
    color: palette.redLight,
    fontFamily: fonts.text,
    fontSize: 13,
    marginTop: 8,
  },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginTop: space.xl,
  },
  backBtn: { minHeight: MIN_TAP, minWidth: MIN_TAP, justifyContent: "center", paddingHorizontal: 8 },
  backText: { fontFamily: fonts.textMedium, fontSize: 12, letterSpacing: 1.6, color: palette.textMid },
  nextBtn: { minWidth: 160 },
});
