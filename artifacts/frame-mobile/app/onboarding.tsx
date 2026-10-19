import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { QUESTIONS, type Answers } from "@workspace/onboarding";
import { useAuth } from "@/context/AuthContext";
import { useFighter, type Fighter } from "@/context/FighterContext";
import { apiGet, apiPost } from "@/lib/api";
import { TapOutside, dismissProps } from "@/components/FormScroll";
import {
  ageFromDateOfBirth,
  dateOfBirthFromParts,
  normaliseDateOfBirthPart,
  type DateOfBirthParts,
} from "@/lib/dateOfBirth";
import { commitFighterProfile } from "@/lib/fighterProfileCache";
import { shouldLeaveOnboarding } from "@/lib/onboardingRoute";
import { NAME_MAX } from "@/lib/fighterName";
import {
  ADVANCE_DELAY_MS,
  FIRST_QUESTION_STEP,
  SAVE_TIMEOUT_MS,
  STEP_KEYS,
  TOTAL_STEPS,
  buildFighterPayload,
  choiceStepError,
  describeSaveFailure,
  dobStepError,
  draftHasProgress,
  draftKeyFor,
  isDoubleTap,
  nameStepError,
  parseDraft,
  questionForStep,
  sentenceCaseLabel,
  stepAfter,
  withTimeout,
} from "@/lib/onboarding";
import { createOnboardingTracker } from "@/lib/onboardingTracking";
import {
  FREQUENCY_OPTIONS,
  SPORTS,
  levelLabelForSport,
  levelsForSport,
} from "@/lib/fighterOptions";
import { EntryBrand } from "@/components/EntryBrand";
import { SUBLINE, TrainWithFrame } from "@/components/TrainWithFrame";
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

// Headings for the plain steps; the four question steps use the question text itself.
const STEP_HEADINGS: Record<string, string> = {
  name: "What do they call you?",
  dob: "When were you born?",
  sport: "What do you train?",
  frequency: "How often do you train?",
  goals: "What are you here to build?",
};

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
  segOn: { backgroundColor: palette.textHi },
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
            {on ? <Feather name="check" size={14} color={palette.bg} /> : null}
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
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
    paddingHorizontal: 18,
  },
  pressed: { backgroundColor: palette.raised },
  // Selected: white fill, black text (no gold).
  selected: { borderColor: palette.textHi, backgroundColor: palette.textHi },
  text: { fontFamily: fonts.medium, fontSize: 15, color: palette.textMid },
  selectedText: { color: palette.bg },
});

/** One full-width answer for a behavioural question. Tap = answer (the screen auto-advances). */
function AnswerOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [ans.item, selected && ans.selected, pressed && !selected && ans.pressed]}
      onPress={() => {
        haptic.select();
        onPress();
      }}
    >
      <Text style={[ans.text, selected && ans.selectedText]}>{label}</Text>
      {selected ? <Feather name="check" size={18} color={palette.bg} /> : null}
    </Pressable>
  );
}

const ans = StyleSheet.create({
  item: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: { backgroundColor: palette.raised },
  selected: { borderColor: palette.textHi, backgroundColor: palette.textHi },
  text: { flex: 1, fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: palette.textMid },
  selectedText: { color: palette.bg },
});

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const router = useRouter();
  const qc = useQueryClient();
  const { userId, signOut } = useAuth();
  const { fighter } = useFighter();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState<DateOfBirthParts>({
    day: "",
    month: "",
    year: "",
  });
  // Nothing is pre-selected: sport, level, frequency and the 4 answers start empty.
  const [sport, setSport] = useState("");
  const [level, setLevel] = useState("");
  const [freq, setFreq] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [choiceErr, setChoiceErr] = useState<string | null>(null);
  const [goals, setGoals] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const lastTapRef = useRef(0);
  const draftReadyRef = useRef(false);
  const profileSaveCompletedRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackerRef = useRef(createOnboardingTracker());
  const monthInputRef = useRef<TextInput>(null);
  const yearInputRef = useRef<TextInput>(null);

  // Resume where they left off: restore a saved draft once, then keep it in sync.
  // A new account starts from the name typed on the sign-up form, so name is never asked twice.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    Promise.all([
      AsyncStorage.getItem(draftKeyFor(userId)).catch(() => null),
      apiGet<{ name?: string }>("/auth/me").catch(() => null),
    ])
      .then(([raw, me]) => {
        if (!alive) return;
        const d = parseDraft(raw);
        if (d && draftHasProgress(d)) {
          setName(d.name);
          setDob(d.dob);
          setSport(d.sport);
          setLevel(d.level);
          setFreq(d.freq);
          setAnswers(d.answers);
          setGoals(d.goals);
          setWeaknesses(d.weaknesses);
          setStep(d.step);
        } else if (me?.name && me.name.trim()) {
          setName(me.name.trim());
          setStep(1); // go straight to date of birth
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) draftReadyRef.current = true;
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !draftReadyRef.current) return;
    AsyncStorage.setItem(
      draftKeyFor(userId),
      JSON.stringify({ step, name, dob, sport, level, freq, answers, goals, weaknesses }),
    ).catch(() => {});
  }, [userId, step, name, dob, sport, level, freq, answers, goals, weaknesses]);

  // Funnel: one 'view' per step the person lands on (fire-and-forget; see lib/onboardingTracking).
  useEffect(() => {
    if (!userId) return;
    trackerRef.current.track(STEP_KEYS[step], "view");
  }, [userId, step]);

  useEffect(
    () => () => {
      if (advanceTimerRef.current != null) clearTimeout(advanceTimerRef.current);
    },
    [],
  );

  // Android hardware back moves to the previous step instead of leaving onboarding.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step > 0) {
        clearAdvance();
        setStep(step - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

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

  /** Swallow a second tap that lands before the screen has changed (double-tap skipped a whole step). */
  function tapAllowed(): boolean {
    const now = Date.now();
    if (isDoubleTap(lastTapRef.current, now)) return false;
    lastTapRef.current = now;
    return true;
  }

  function clearAdvance() {
    if (advanceTimerRef.current != null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }

  const currentDraft = () => ({ step, name, dob, sport, level, freq, answers, goals, weaknesses });

  function pickSport(nextSport: string) {
    // Belts/levels differ per sport: clear the old pick, the new one must be chosen.
    if (nextSport !== sport) setLevel("");
    setSport(nextSport);
    setChoiceErr(null);
  }

  /** Tap on a behavioural answer: record it, then advance once after a beat (a second tap in that beat never queues a second advance). */
  function answerQuestion(questionId: string, index: number) {
    setAnswers((a) => ({ ...a, [questionId]: index }));
    setChoiceErr(null);
    if (advanceTimerRef.current != null) return;
    const answered = step;
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      trackerRef.current.track(STEP_KEYS[answered], "complete");
      setStep(stepAfter(answered));
    }, ADVANCE_DELAY_MS);
  }

  function next() {
    if (!tapAllowed()) return;
    clearAdvance();
    if (step === 0) {
      const problem = nameStepError(name);
      if (problem) {
        setNameErr(problem);
        return;
      }
      setNameErr(null);
    }
    if (step === 1) {
      const problem = dobStepError(dob);
      if (problem || !dobDate) {
        setDobError(problem ?? "Enter a valid date of birth.");
        return;
      }
      setDobError(null);
    }
    const choiceProblem = choiceStepError(currentDraft(), step);
    if (choiceProblem) {
      setChoiceErr(choiceProblem);
      trackerRef.current.track(STEP_KEYS[step], "error");
      return;
    }
    setChoiceErr(null);
    setError(null);
    trackerRef.current.track(STEP_KEYS[step], "complete");
    setStep(stepAfter(step));
  }

  function back() {
    if (!tapAllowed()) return;
    clearAdvance();
    setChoiceErr(null);
    setError(null);
    setStep(Math.max(step - 1, 0));
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    const abort = new AbortController();
    try {
      // Last step: completed by tapping Finish (the server records 'finish' once the profile is saved).
      trackerRef.current.track(STEP_KEYS[TOTAL_STEPS - 1], "complete");
      const nameProblem = nameStepError(name);
      if (nameProblem) {
        setNameErr(nameProblem);
        setStep(0);
        return;
      }
      if (!dobDate) {
        setDobError(dobStepError(dob) ?? "Enter a valid date of birth.");
        setStep(1);
        return;
      }

      const response = await withTimeout(
        apiPost<{ fighter: Fighter }>(
          "/fighter",
          buildFighterPayload(currentDraft(), dobDate),
          { signal: abort.signal },
        ),
        SAVE_TIMEOUT_MS,
      );

      if (!userId || !response.fighter) {
        throw new Error("Your fighter profile was saved, but could not be opened.");
      }

      profileSaveCompletedRef.current = true;
      if (userId) AsyncStorage.removeItem(draftKeyFor(userId)).catch(() => {});
      await commitFighterProfile(qc, userId, response.fighter);
      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      abort.abort();
      trackerRef.current.track("goals", "error");
      const failure = describeSaveFailure(e);
      if (failure.goToStep === 0) setNameErr(failure.message);
      else if (failure.goToStep === 1) setDobError(failure.message);
      else setError(failure.message);
      if (failure.goToStep != null) setStep(failure.goToStep);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <Screen light={null}>
      <VideoBackdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
          {...dismissProps}
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <TapOutside>
          {/* Brand + positioning line over the looping video (full-screen backdrop, dark scrim) */}
          <View style={[styles.band, step === 0 ? styles.bandTall : styles.bandShort, { paddingTop: insets.top + 16 }]}>
            <View style={styles.bandInner}>
              <EntryBrand compact />
              {step === 0 ? (
                <View style={{ marginTop: "auto" }}>
                  <TrainWithFrame width={Math.min(360, screenW - 2 * (SCREEN_PAD + 2))} />
                  <Body style={styles.sub}>{SUBLINE}</Body>
                </View>
              ) : null}
            </View>
          </View>

          <FadeIn index={0} key={step} style={styles.cardWrap}>
            <AuthPanel>
            <ProgressBar step={step} />
            <Display size="title" style={styles.heading}>
              {questionForStep(step)?.prompt ?? STEP_HEADINGS[STEP_KEYS[step]]}
            </Display>

            {step === 0 && (
              <View style={styles.section}>
                <Field
                  label="Your name"
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    setNameErr(null);
                  }}
                  placeholder="What do they call you?"
                  autoCapitalize="words"
                  maxLength={NAME_MAX}
                  returnKeyType="next"
                  onSubmitEditing={next}
                  error={nameErr}
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

            {STEP_KEYS[step] === "sport" && (
              <View style={styles.section}>
                <Label style={styles.label}>Primary sport</Label>
                <ChipSelector options={SPORTS} value={sport} onSelect={pickSport} />

                {sport ? (
                  <>
                    <Label style={[styles.label, { marginTop: space.xl }]}>{sentenceCaseLabel(levelLabelForSport(sport))}</Label>
                    <ChipSelector
                      options={levelsForSport(sport)}
                      value={level}
                      onSelect={(l) => {
                        setLevel(l);
                        setChoiceErr(null);
                      }}
                    />
                  </>
                ) : null}
                {choiceErr ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {choiceErr}
                  </Text>
                ) : null}
              </View>
            )}

            {STEP_KEYS[step] === "frequency" && (
              <View style={styles.section}>
                <Label style={styles.label}>Training frequency</Label>
                <ChipSelector
                  options={FREQUENCY_OPTIONS}
                  value={freq}
                  onSelect={(f) => {
                    setFreq(f);
                    setChoiceErr(null);
                  }}
                />
                {choiceErr ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {choiceErr}
                  </Text>
                ) : null}
              </View>
            )}

            {questionForStep(step) && (
              <View style={styles.section}>
                <Label style={styles.label}>
                  Question {step - FIRST_QUESTION_STEP + 1} of {QUESTIONS.length}
                </Label>
                <View style={styles.answers}>
                  {questionForStep(step)!.choices.map((c, idx) => (
                    <AnswerOption
                      key={c.label}
                      label={c.label}
                      selected={answers[questionForStep(step)!.id] === idx}
                      onPress={() => answerQuestion(questionForStep(step)!.id, idx)}
                    />
                  ))}
                </View>
                {choiceErr ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {choiceErr}
                  </Text>
                ) : null}
              </View>
            )}

            {STEP_KEYS[step] === "goals" && (
              <View style={[styles.section, { gap: 20 }]}>
                <Label style={styles.optionalNote}>Both answers are optional. Skip either one and add it later.</Label>
                <Field
                  label="Primary goals (optional)"
                  style={styles.textarea}
                  value={goals}
                  onChangeText={setGoals}
                  placeholder="What are you here to build?"
                  multiline
                  numberOfLines={3}
                />
                <Field
                  label="Known weaknesses (optional)"
                  style={styles.textarea}
                  value={weaknesses}
                  onChangeText={setWeaknesses}
                  placeholder="What breaks first when pressure spikes?"
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}

            </AuthPanel>
          </FadeIn>
          </TapOutside>
        </ScrollView>
        {/* Pinned under the card: Back/Next/Finish and any save error stay on screen with the keyboard open or the card scrolled. */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <View style={styles.footerInner}>
            {error ? (
              <Text style={[styles.errorText, styles.navError]} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <View style={styles.nav}>
              {step > 0 ? (
                <Button title="Back" variant="ghost" onPress={back} style={styles.backBtn} />
              ) : (
                // Step 1 has no Back: offer a way out for someone who signed up with the wrong email.
                <Button
                  title="Sign out"
                  variant="ghost"
                  onPress={() => {
                    void signOut().then(() => router.replace("/sign-in"));
                  }}
                  style={styles.backBtn}
                />
              )}

              {step < TOTAL_STEPS - 1 ? (
                <Button title="Next" onPress={next} style={styles.nextBtn} />
              ) : (
                <Button title="Finish setup" onPress={handleSubmit} loading={loading} style={styles.nextBtn} />
              )}
            </View>
          </View>
        </View>
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
  sub: { marginTop: space.sm, fontSize: 16, lineHeight: 22, color: palette.textHi },
  cardWrap: { width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: SCREEN_PAD + 2, paddingTop: space.md },
  heading: { marginTop: space.lg, marginBottom: space.xl },
  section: { width: "100%" },
  answers: { gap: 10 },
  label: { marginBottom: 12 },
  dobRow: { flexDirection: "row", gap: 10 },
  dobField: { flex: 1 },
  yearField: { flex: 1.45 },
  dobInput: { textAlign: "center", paddingHorizontal: 8, fontSize: 18, fontVariant: ["tabular-nums"] },
  inputError: { borderColor: palette.redHair },
  ageConfirmation: { marginTop: 14, fontFamily: fonts.medium, fontSize: 14, color: palette.textMid, fontVariant: ["tabular-nums"] },
  textarea: { minHeight: 96, textAlignVertical: "top", paddingTop: 16 },
  optionalNote: { marginBottom: space.md },
  navError: { marginBottom: space.sm },
  footer: {
    paddingHorizontal: SCREEN_PAD + 2,
    paddingTop: space.md,
    backgroundColor: "rgba(8,9,11,0.94)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderStrong,
  },
  footerInner: { width: "100%", maxWidth: 480, alignSelf: "center" },
  errorText: { color: palette.redText, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 8 },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  backBtn: { minWidth: 88 },
  nextBtn: { minWidth: 160 },
});
