import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
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
import { apiPost } from "@/lib/api";

const heroImage = require("../assets/images/login-hero.jpg");

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

const TOTAL_STEPS = 4;

const STEP_TITLES = [
  "YOUR NAME",
  "DATE OF BIRTH",
  "SPORT & LEVEL",
  "TRAINING FREQUENCY",
];

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    width: "100%",
    marginBottom: 24,
  },
  fill: {
    height: 1,
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
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  selected: {
    borderColor: "#C9883A",
    backgroundColor: "rgba(201,136,58,0.15)",
  },
  text: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
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
  const transitioning = useRef(false);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [sport, setSport] = useState("bjj");
  const [belt, setBelt] = useState("white");
  const [freq, setFreq] = useState("3-4");
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
    if (transitioning.current) return;
    if (step === 1) {
      if (!parseDob(dob)) {
        setDobError("Enter your date of birth as YYYY-MM-DD  (e.g. 1990-06-15)");
        return;
      }
      setDobError(null);
    }
    if (step < TOTAL_STEPS - 1) {
      transitioning.current = true;
      setStep((s) => s + 1);
      setTimeout(() => { transitioning.current = false; }, 0);
    }
  }

  function back() {
    if (transitioning.current) return;
    if (step > 0) {
      transitioning.current = true;
      setStep((s) => s - 1);
      setTimeout(() => { transitioning.current = false; }, 0);
    }
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
        goals: null,
        weaknesses: null,
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

  const isNextDisabled =
    (step === 0 && !name.trim()) ||
    (step === 1 && !parseDob(dob));

  return (
    <ImageBackground source={heroImage} style={styles.bg} resizeMode="cover">
      {/* Dark wash */}
      <View style={styles.wash} />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.shell,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerCenter}>
              <Text style={styles.wordmark}>FRAME</Text>
              <Text style={styles.tagline}>The coach that remembers.</Text>
            </View>
          </View>

          {/* Scrollable body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Card */}
            <View style={styles.card}>
              {/* Card top */}
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>ATHLETE PROFILE</Text>
                <Text style={styles.cardSub}>
                  STEP {step + 1} OF {TOTAL_STEPS} — {STEP_TITLES[step]}
                </Text>
                <ProgressBar step={step} />
              </View>

              {/* Card body */}
              <View style={styles.cardBody}>
                {step === 0 && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>YOUR NAME</Text>
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="Your name"
                      placeholderTextColor="#555"
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={next}
                    />
                  </View>
                )}

                {step === 1 && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
                    <TextInput
                      style={[styles.input, dobError ? styles.inputError : null]}
                      value={dob}
                      onChangeText={(t) => { setDob(t); setDobError(null); }}
                      placeholder="1990-06-15"
                      placeholderTextColor="#555"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      autoComplete="birthdate-full"
                      returnKeyType="next"
                    />
                    <Text style={styles.hint}>YYYY-MM-DD</Text>
                    {dobError ? (
                      <Text style={styles.errorText}>{dobError}</Text>
                    ) : null}
                  </View>
                )}

                {step === 2 && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>PRIMARY SPORT</Text>
                    <ChipSelector options={SPORTS} value={sport} onSelect={setSport} />

                    <Text style={[styles.fieldLabel, { marginTop: 24 }]}>BELT / LEVEL</Text>
                    <ChipSelector options={BELTS} value={belt} onSelect={setBelt} />
                  </View>
                )}

                {step === 3 && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>TRAINING FREQUENCY</Text>
                    <ChipSelector options={FREQS} value={freq} onSelect={setFreq} />
                  </View>
                )}

                {step === 3 && error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : null}

                {/* Navigation */}
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
                      style={({ pressed }) => [
                        styles.btn,
                        pressed && styles.btnPressed,
                        isNextDisabled && styles.btnDisabled,
                      ]}
                      onPress={next}
                      disabled={isNextDisabled}
                    >
                      <Text style={styles.btnText}>NEXT</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.btn,
                        pressed && styles.btnPressed,
                        loading && styles.btnDisabled,
                      ]}
                      onPress={handleSubmit}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#050505" />
                      ) : (
                        <Text style={styles.btnText}>FINISH</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Page footer */}
          <View style={styles.pageFooter}>
            <Text style={styles.pageFooterText}>
              YOUR PROFILE HELPS FRAME PERSONALISE EVERY SESSION.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: "#000",
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  kav: {
    flex: 1,
  },
  shell: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  headerCenter: {
    alignItems: "center",
  },
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 14,
    letterSpacing: 8,
    color: "rgba(255,255,255,0.95)",
    marginBottom: 4,
  },
  tagline: {
    fontFamily: "Outfit",
    fontSize: 10,
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.45)",
    fontStyle: "italic",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  card: {
    backgroundColor: "rgba(15,15,15,0.92)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  cardTop: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 0,
    alignItems: "center",
  },
  cardTitle: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "300",
    marginBottom: 6,
  },
  cardSub: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.40)",
    marginBottom: 20,
    textAlign: "center",
  },
  cardBody: {
    paddingHorizontal: 28,
    paddingBottom: 28,
    gap: 16,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.70)",
  },
  hint: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.35)",
    marginTop: 2,
  },
  input: {
    backgroundColor: "rgba(24,24,24,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 48,
  },
  inputError: {
    borderColor: "#c0392b",
  },
  errorText: {
    color: "#BF1D1D",
    fontFamily: "Outfit",
    fontSize: 12,
    marginTop: 4,
  },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  backBtn: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  backText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.35)",
  },
  btn: {
    backgroundColor: "#C9883A",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    paddingHorizontal: 28,
    minWidth: 140,
    shadowColor: "rgba(201,136,58,0.4)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 4,
    color: "#050505",
  },
  pageFooter: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: "center",
  },
  pageFooterText: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.40)",
    textAlign: "center",
  },
});
