import { Redirect, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
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

const FREQS = [
  { key: "1-2", label: "1-2x / week" },
  { key: "3-4", label: "3-4x / week" },
  { key: "5+", label: "5+ / week" },
];

const TOTAL_STEPS = 5;

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: {
    height: 2,
    backgroundColor: "#1a1a1a",
    width: "100%",
    marginBottom: 40,
  },
  fill: {
    height: 2,
    backgroundColor: "#8A6A2F",
  },
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
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  item: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  selected: {
    borderColor: "#8A6A2F",
    backgroundColor: "rgba(138,106,47,0.1)",
  },
  text: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#666",
    letterSpacing: 0.5,
  },
  selectedText: {
    color: "#8A6A2F",
  },
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

  return (
    <ScrollView
      style={[styles.root, { paddingTop: insets.top + 24 }]}
      contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.header}>FRAME</Text>
      <Text style={styles.sub}>LET'S SEE WHAT YOU BECOME UNDER PRESSURE</Text>

      <ProgressBar step={step} />

      {step === 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>YOUR NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="What do they call you?"
            placeholderTextColor="#444"
            autoCapitalize="words"
          />
        </View>
      )}

      {step === 1 && (
        <View style={styles.section}>
          <Text style={styles.label}>DATE OF BIRTH</Text>
          <Text style={styles.hint}>No hyphens needed</Text>
          <View style={styles.dobRow}>
            <View style={styles.dobField}>
              <Text style={styles.dobLabel}>DAY</Text>
              <TextInput
                style={[styles.input, styles.dobInput, dobError ? styles.inputError : null]}
                value={dob.day}
                onChangeText={(value) => updateDobPart("day", value)}
                placeholder="DD"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={2}
                textContentType="none"
              />
            </View>
            <View style={styles.dobField}>
              <Text style={styles.dobLabel}>MONTH</Text>
              <TextInput
                ref={monthInputRef}
                style={[styles.input, styles.dobInput, dobError ? styles.inputError : null]}
                value={dob.month}
                onChangeText={(value) => updateDobPart("month", value)}
                placeholder="MM"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={2}
                textContentType="none"
              />
            </View>
            <View style={[styles.dobField, styles.yearField]}>
              <Text style={styles.dobLabel}>YEAR</Text>
              <TextInput
                ref={yearInputRef}
                style={[styles.input, styles.dobInput, dobError ? styles.inputError : null]}
                value={dob.year}
                onChangeText={(value) => updateDobPart("year", value)}
                placeholder="YYYY"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={4}
                textContentType="none"
              />
            </View>
          </View>
          {age != null ? (
            <Text style={styles.ageConfirmation}>{age} YEARS OLD</Text>
          ) : null}
          {dobError ? <Text style={styles.errorText}>{dobError}</Text> : null}
        </View>
      )}

      {step === 2 && (
        <View style={styles.section}>
          <Text style={styles.label}>PRIMARY SPORT</Text>
          <ChipSelector
            options={SPORTS}
            value={sport}
            onSelect={(nextSport) => {
              setSport(nextSport);
              setLevel(defaultLevelForSport(nextSport));
            }}
          />

          <Text style={[styles.label, { marginTop: 28 }]}>
            {levelLabelForSport(sport)}
          </Text>
          <ChipSelector
            options={levelsForSport(sport)}
            value={level}
            onSelect={setLevel}
          />
        </View>
      )}

      {step === 3 && (
        <View style={styles.section}>
          <Text style={styles.label}>TRAINING FREQUENCY</Text>
          <ChipSelector options={FREQS} value={freq} onSelect={setFreq} />
        </View>
      )}

      {step === 4 && (
        <View style={styles.section}>
          <Text style={styles.label}>PRIMARY GOALS</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={goals}
            onChangeText={setGoals}
            placeholder="What are you here to build?"
            placeholderTextColor="#444"
            multiline
            numberOfLines={3}
          />

          <Text style={[styles.label, { marginTop: 20 }]}>KNOWN WEAKNESSES</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={weaknesses}
            onChangeText={setWeaknesses}
            placeholder="What breaks first when pressure spikes?"
            placeholderTextColor="#444"
            multiline
            numberOfLines={3}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      )}

      <View style={styles.nav}>
        {step > 0 ? (
          <Pressable onPress={back} style={styles.backBtn}>
            <Text style={styles.backText}>BACK</Text>
          </Pressable>
        ) : (
          <View />
        )}

        {step < TOTAL_STEPS - 1 ? (
          <Pressable
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.8 }]}
            onPress={next}
            disabled={
              step === 0 && !name.trim()
            }
          >
            <Text style={styles.nextText}>NEXT</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.8 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#050505" />
            ) : (
              <Text style={styles.nextText}>READING YOU...</Text>
            )}
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
    paddingHorizontal: 28,
  },
  inner: {
    alignItems: "flex-start",
  },
  header: {
    fontFamily: "SpaceMono",
    fontSize: 20,
    letterSpacing: 8,
    color: "#e0e0e0",
    marginBottom: 4,
  },
  sub: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#444",
    marginBottom: 32,
  },
  section: {
    width: "100%",
    marginBottom: 16,
  },
  label: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#8A6A2F",
    marginBottom: 12,
  },
  hint: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#444",
    marginBottom: 8,
  },
  dobRow: {
    flexDirection: "row",
    gap: 10,
  },
  dobField: {
    flex: 1,
  },
  yearField: {
    flex: 1.45,
  },
  dobLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1.5,
    color: "#666",
    marginBottom: 6,
  },
  dobInput: {
    textAlign: "center",
    paddingHorizontal: 8,
    fontSize: 18,
  },
  inputError: {
    borderColor: "#BF1D1D",
  },
  ageConfirmation: {
    marginTop: 12,
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
  input: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: "100%",
  },
  textarea: {
    height: 90,
    textAlignVertical: "top",
    paddingTop: 14,
  },
  errorText: {
    color: "#BF1D1D",
    fontFamily: "Outfit",
    fontSize: 13,
    marginTop: 8,
  },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginTop: 32,
  },
  backBtn: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  backText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 3,
    color: "#444",
  },
  nextBtn: {
    backgroundColor: "#8A6A2F",
    paddingHorizontal: 28,
    paddingVertical: 14,
    minWidth: 140,
    alignItems: "center",
  },
  nextText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 3,
    color: "#050505",
  },
});
