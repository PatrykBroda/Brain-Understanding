import { useRouter } from "expo-router";
import React, { useState } from "react";
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
import { apiPost } from "@/lib/api";

const SPORTS = [
  { key: "bjj", label: "BJJ" },
  { key: "mma", label: "MMA" },
  { key: "boxing", label: "Boxing" },
  { key: "muay_thai", label: "Muay Thai" },
  { key: "wrestling", label: "Wrestling" },
  { key: "judo", label: "Judo" },
  { key: "kickboxing", label: "Kickboxing" },
];

const BELTS = [
  { key: "white", label: "White" },
  { key: "blue", label: "Blue" },
  { key: "purple", label: "Purple" },
  { key: "brown", label: "Brown" },
  { key: "black", label: "Black" },
];

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
    backgroundColor: "#C9883A",
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
    borderColor: "#C9883A",
    backgroundColor: "rgba(201,136,58,0.1)",
  },
  text: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#666",
    letterSpacing: 0.5,
  },
  selectedText: {
    color: "#C9883A",
  },
});

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [sport, setSport] = useState("bjj");
  const [belt, setBelt] = useState("white");
  const [freq, setFreq] = useState("3-4");
  const [goals, setGoals] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);

  /** Validate a YYYY-MM-DD string and return a normalised ISO date or null. */
  function parseDob(raw: string): string | null {
    const trimmed = raw.trim();
    // Accept YYYY-MM-DD only.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    // Sanity: year must be plausible (1900–today).
    const year = d.getUTCFullYear();
    if (year < 1900 || year > new Date().getUTCFullYear()) return null;
    return trimmed;
  }

  function next() {
    if (step === 1) {
      if (!parseDob(dob)) {
        setDobError("Enter your date of birth as YYYY-MM-DD  (e.g. 1990-06-15)");
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
    setLoading(true);
    setError(null);
    try {
      const dobDate = parseDob(dob);
      if (!dobDate) {
        setError("Date of birth is missing or invalid. Go back and enter it as YYYY-MM-DD.");
        setLoading(false);
        return;
      }

      await apiPost("/fighter", {
        name: name.trim(),
        dateOfBirth: dobDate,
        art: sport,
        primarySport: sport,
        level: belt,
        trainingFrequency: freq,
        goals: goals.trim() || null,
        weaknesses: weaknesses.trim() || null,
        personality: `Training ${freq} per week. Sport: ${sport}. Belt: ${belt}.`,
      });

      qc.invalidateQueries({ queryKey: ["fighter"] });
      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      setError((e as Error).message ?? "Setup failed. Try again.");
    } finally {
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
          <Text style={styles.hint}>YYYY-MM-DD</Text>
          <TextInput
            style={[styles.input, dobError ? { borderColor: "#c0392b" } : null]}
            value={dob}
            onChangeText={(t) => { setDob(t); setDobError(null); }}
            placeholder="1990-06-15"
            placeholderTextColor="#444"
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            autoComplete="birthdate-full"
          />
          {dobError ? <Text style={styles.errorText}>{dobError}</Text> : null}
        </View>
      )}

      {step === 2 && (
        <View style={styles.section}>
          <Text style={styles.label}>PRIMARY SPORT</Text>
          <ChipSelector options={SPORTS} value={sport} onSelect={setSport} />

          <Text style={[styles.label, { marginTop: 28 }]}>BELT / LEVEL</Text>
          <ChipSelector options={BELTS} value={belt} onSelect={setBelt} />
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
              (step === 0 && !name.trim()) ||
              (step === 1 && !parseDob(dob))
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
    color: "#C9883A",
    marginBottom: 12,
  },
  hint: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#444",
    marginBottom: 8,
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
    backgroundColor: "#C9883A",
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
