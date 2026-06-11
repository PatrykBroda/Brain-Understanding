import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";

type AnalysisKind =
  | "sparring"
  | "padwork"
  | "shadowboxing"
  | "drilling"
  | "movement"
  | "lifting";
type NervousSystemLoad = "low" | "moderate" | "elevated" | "high";

interface FrameReportScore {
  key: string;
  label: string;
  value: number;
  basis: string;
}

interface AnalysisSignal {
  key: string;
  label: string;
  value: string;
  detail: string;
}

type SignalHistoryEntry = { id: number; createdAt: string; signals: AnalysisSignal[] };

interface AnalysisResult {
  id: number;
  scores: FrameReportScore[];
  sessionScore: number;
  fragmentationRisk: NervousSystemLoad;
  styleProfile: string;
  aiComment: string;
  summary: string;
  metrics?: { signals: AnalysisSignal[] };
  signalHistory?: SignalHistoryEntry[] | null;
}

const KINDS: { value: AnalysisKind; label: string }[] = [
  { value: "sparring", label: "Sparring" },
  { value: "padwork", label: "Pad work" },
  { value: "shadowboxing", label: "Shadow" },
  { value: "drilling", label: "Drilling" },
  { value: "movement", label: "Movement" },
  { value: "lifting", label: "Lifting" },
];

const LOADS: { value: NervousSystemLoad; label: string; desc: string }[] = [
  { value: "low", label: "Low", desc: "Easy day" },
  { value: "moderate", label: "Moderate", desc: "Steady work" },
  { value: "elevated", label: "Elevated", desc: "Pushed hard" },
  { value: "high", label: "High", desc: "Max output" },
];

const DIMENSIONS: {
  key: keyof typeof initialScores;
  apiKey: string;
  label: string;
  question: string;
}[] = [
  {
    key: "aggression",
    apiKey: "aggression",
    label: "AGGRESSION",
    question: "How much forward pressure did you generate?",
  },
  {
    key: "composure",
    apiKey: "composure",
    label: "COMPOSURE",
    question: "How calm were you under pressure?",
  },
  {
    key: "reactionSpeed",
    apiKey: "reaction_speed",
    label: "REACTION SPEED",
    question: "How quickly did you read and respond to threats?",
  },
  {
    key: "defensiveRecovery",
    apiKey: "defensive_recovery",
    label: "DEFENSIVE RECOVERY",
    question: "How well did you recover from bad positions?",
  },
];

const initialScores = {
  aggression: 60,
  composure: 60,
  reactionSpeed: 60,
  defensiveRecovery: 60,
};

const LEVELS = [20, 40, 60, 80, 100] as const;

function ScoreSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={ss.row}>
      {LEVELS.map((lvl) => (
        <Pressable
          key={lvl}
          style={[ss.seg, value >= lvl && ss.segActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(lvl);
          }}
          hitSlop={8}
        />
      ))}
      <Text style={ss.val}>{value}</Text>
    </View>
  );
}

const ss = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  seg: { flex: 1, height: 6, backgroundColor: "#1a1a1a", borderRadius: 2 },
  segActive: { backgroundColor: "#C9883A" },
  val: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: "#666",
    width: 28,
    textAlign: "right",
  },
});

function buildSignalTrail(
  signalKey: string,
  currentValue: string,
  history: SignalHistoryEntry[],
): string[] {
  const allValues: string[] = [];
  for (const h of history) {
    const sig = h.signals.find((s) => s.key === signalKey);
    if (sig?.value) allValues.push(sig.value);
  }
  allValues.push(currentValue);
  const deduped: string[] = [];
  for (const v of allValues) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== v) {
      deduped.push(v);
    }
  }
  return deduped.slice(-5);
}

function SignalHistoryTrail({
  signalKey,
  currentValue,
  history,
}: {
  signalKey: string;
  currentValue: string;
  history: SignalHistoryEntry[];
}) {
  const trail = buildSignalTrail(signalKey, currentValue, history);
  if (trail.length < 3) return null;
  return (
    <View style={trailSs.row}>
      {trail.map((v, i) => {
        const isCurrent = i === trail.length - 1;
        return (
          <View key={i} style={trailSs.entry}>
            {i > 0 && (
              <Text style={trailSs.sep}>›</Text>
            )}
            <Text style={[trailSs.val, isCurrent && trailSs.valCurrent]}>
              {v}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const trailSs = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 4, gap: 2 },
  entry: { flexDirection: "row", alignItems: "center", gap: 2 },
  sep: { fontFamily: "SpaceMono", fontSize: 8, color: "#333", lineHeight: 12 },
  val: { fontFamily: "SpaceMono", fontSize: 8, color: "#3a3a3a", textTransform: "uppercase", letterSpacing: 1, lineHeight: 12 },
  valCurrent: { color: "#888" },
});

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function derivedLoad(scores: typeof initialScores): NervousSystemLoad {
  const avg =
    (scores.aggression + scores.composure + scores.reactionSpeed + scores.defensiveRecovery) / 4;
  if (avg >= 80) return "high";
  if (avg >= 60) return "elevated";
  if (avg >= 40) return "moderate";
  return "low";
}

function buildSignals(
  scores: typeof initialScores,
  video: ImagePicker.ImagePickerAsset | null
): AnalysisSignal[] {
  const signals: AnalysisSignal[] = [
    {
      key: "aggression_drive",
      label: "Forward pressure",
      value: `${scores.aggression}/100`,
      detail: "Self-assessed aggression drive",
    },
    {
      key: "composure_baseline",
      label: "Composure under load",
      value: `${scores.composure}/100`,
      detail: "Self-assessed composure",
    },
    {
      key: "reaction_pattern",
      label: "Reaction speed",
      value: `${scores.reactionSpeed}/100`,
      detail: "Self-assessed threat reading",
    },
    {
      key: "recovery_efficiency",
      label: "Defensive recovery",
      value: `${scores.defensiveRecovery}/100`,
      detail: "Self-assessed positional recovery",
    },
  ];
  if (video) {
    const dur =
      video.duration != null && video.duration > 0 ? formatDuration(video.duration) : null;
    signals.push({
      key: "clip_duration",
      label: "Clip duration",
      value: dur ?? "unknown",
      detail: "From camera roll footage",
    });
  }
  return signals;
}

export default function AnalyseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [video, setVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [kind, setKind] = useState<AnalysisKind>("sparring");
  const [load, setLoad] = useState<NervousSystemLoad>("moderate");
  const [scores, setScores] = useState(initialScores);
  const [focusPrompt, setFocusPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickVideo() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError("Camera roll access is required to select footage.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "videos",
      quality: 0.5,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset) {
        setVideo(asset);
        setError(null);
      }
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const scorePayload: FrameReportScore[] = DIMENSIONS.map((d) => ({
      key: d.apiKey,
      label: d.label,
      value: scores[d.key],
      basis: video ? "Athlete self-assessment (with footage)" : "Athlete self-assessment",
    }));

    const sessionScore = Math.round(
      (scores.aggression + scores.composure + scores.reactionSpeed + scores.defensiveRecovery) / 4
    );

    const fragmentationRisk: NervousSystemLoad =
      scores.composure >= 80
        ? "low"
        : scores.composure >= 60
          ? "moderate"
          : scores.composure >= 40
            ? "elevated"
            : "high";

    const signals = buildSignals(scores, video);

    const durationSec =
      video?.duration != null && video.duration > 0 ? Math.round(video.duration / 1000) : 0;

    try {
      const res = await apiPost<{ analysis: AnalysisResult }>("/analysis", {
        kind,
        load,
        fragmentationRisk,
        signals,
        scores: scorePayload,
        sessionScore,
        focus: focusPrompt.trim() || undefined,
        durationSec,
      });
      setResult(res.analysis);
      qc.invalidateQueries({ queryKey: ["memory"] });
    } catch (e: unknown) {
      setError((e as Error).message ?? "Analysis failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setVideo(null);
    setKind("sparring");
    setLoad("moderate");
    setScores(initialScores);
    setFocusPrompt("");
  }

  if (result) {
    return (
      <ScrollView
        style={[styles.root, { paddingTop: topPad }]}
        contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 40 }]}
      >
        <View style={styles.header}>
          <Pressable onPress={handleReset} hitSlop={12}>
            <Feather name="chevron-left" size={20} color="#666" />
          </Pressable>
          <Text style={styles.headerTitle}>FRAME REPORT</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.sessionScoreBlock}>
          <Text style={styles.sessionScoreLabel}>SESSION SCORE</Text>
          <Text style={styles.sessionScore}>{result.sessionScore}</Text>
          <Text style={styles.sessionScoreUnit}>/100</Text>
        </View>

        <View style={styles.scoresGrid}>
          {result.scores.map((sc) => (
            <View key={sc.key ?? sc.label} style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>{sc.label}</Text>
              <Text style={styles.scoreValue}>{sc.value}</Text>
              <View style={styles.scoreBar}>
                <View style={[styles.scoreBarFill, { width: `${sc.value}%` as `${number}%` }]} />
              </View>
              <Text style={styles.scoreBasis}>{sc.basis}</Text>
            </View>
          ))}
        </View>

        {(() => {
          const signals = result.metrics?.signals ?? [];
          const history: SignalHistoryEntry[] = result.signalHistory ?? [];
          if (signals.length === 0) return null;
          const hasTrail = signals.some((s) => buildSignalTrail(s.key, s.value, history).length >= 3);
          return (
            <View style={styles.rawSignalsSection}>
              <Text style={styles.rawSignalsLabel}>RAW SIGNALS</Text>
              {signals.map((s) => (
                <View key={s.key} style={styles.rawSignalRow}>
                  <Text style={styles.rawSignalName} numberOfLines={1}>{s.label}</Text>
                  <View style={styles.rawSignalRight}>
                    <Text style={styles.rawSignalValue}>{s.value}</Text>
                    {hasTrail && (
                      <SignalHistoryTrail
                        signalKey={s.key}
                        currentValue={s.value}
                        history={history}
                      />
                    )}
                  </View>
                </View>
              ))}
            </View>
          );
        })()}

        {(result.styleProfile || result.aiComment) && (
          <View style={styles.narrativeCard}>
            {result.styleProfile ? (
              <>
                <Text style={styles.narrativeLabel}>STYLE PROFILE</Text>
                <Text style={styles.narrativeText}>{result.styleProfile}</Text>
              </>
            ) : null}
            {result.aiComment ? (
              <>
                <Text style={[styles.narrativeLabel, { marginTop: 16 }]}>FRAME READ</Text>
                <Text style={styles.narrativeText}>{result.aiComment}</Text>
              </>
            ) : null}
          </View>
        )}

        {result.summary ? (
          <View style={styles.summaryCard}>
            <Text style={styles.narrativeLabel}>SUMMARY</Text>
            <Text style={styles.narrativeText}>{result.summary}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.8 }]}
          onPress={handleReset}
        >
          <Text style={styles.submitBtnText}>NEW SESSION</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { paddingTop: topPad }]}
      contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color="#666" />
        </Pressable>
        <Text style={styles.headerTitle}>SESSION DEBRIEF</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Footage picker */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>FOOTAGE</Text>
        {video ? (
          <View style={styles.videoSelected}>
            <Feather name="video" size={16} color="#C9883A" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.videoName} numberOfLines={1}>
                {video.fileName ?? "Selected clip"}
              </Text>
              {video.duration != null && video.duration > 0 ? (
                <Text style={styles.videoDuration}>{formatDuration(video.duration)}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setVideo(null)}
              hitSlop={10}
              style={styles.removeVideoBtn}
            >
              <Feather name="x" size={14} color="#444" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.pickVideoBtn, pressed && { opacity: 0.8 }]}
            onPress={pickVideo}
          >
            <Feather name="video" size={14} color="#666" />
            <Text style={styles.pickVideoBtnText}>SELECT FROM CAMERA ROLL</Text>
          </Pressable>
        )}
        <Text style={styles.sectionHint}>Optional. Helps FRAME read your session in context.</Text>
      </View>

      {/* Session type */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SESSION TYPE</Text>
        <View style={styles.chipGrid}>
          {KINDS.map((k) => (
            <Pressable
              key={k.value}
              style={[styles.chip, kind === k.value && styles.chipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setKind(k.value);
              }}
            >
              <Text style={[styles.chipText, kind === k.value && styles.chipTextActive]}>
                {k.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Intensity */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>INTENSITY</Text>
        <View style={styles.loadRow}>
          {LOADS.map((l) => (
            <Pressable
              key={l.value}
              style={[styles.loadBtn, load === l.value && styles.loadBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setLoad(l.value);
              }}
            >
              <Text style={[styles.loadBtnLabel, load === l.value && styles.loadBtnLabelActive]}>
                {l.label}
              </Text>
              <Text style={styles.loadBtnDesc}>{l.desc}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Assessment */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SELF-ASSESSMENT</Text>
        {DIMENSIONS.map((d) => (
          <View key={d.key} style={styles.dimBlock}>
            <Text style={styles.dimLabel}>{d.label}</Text>
            <Text style={styles.dimQuestion}>{d.question}</Text>
            <ScoreSelector
              value={scores[d.key]}
              onChange={(v) => setScores((prev) => ({ ...prev, [d.key]: v }))}
            />
          </View>
        ))}
      </View>

      {/* Focus prompt */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>FOCUS PROMPT</Text>
        <Text style={styles.sectionHint}>Anything specific FRAME should read? (optional)</Text>
        <TextInput
          style={styles.focusInput}
          value={focusPrompt}
          onChangeText={setFocusPrompt}
          placeholder="e.g. my guard retention under pressure"
          placeholderTextColor="#333"
          multiline
          maxLength={200}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.submitBtn,
          submitting && styles.submitBtnDisabled,
          pressed && !submitting && { opacity: 0.85 },
        ]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#050505" />
        ) : (
          <Text style={styles.submitBtnText}>BUILD FRAME REPORT</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  inner: { paddingHorizontal: 20, paddingTop: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 5,
    color: "#e0e0e0",
  },
  section: { marginBottom: 28 },
  sectionLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#C9883A",
    marginBottom: 10,
  },
  sectionHint: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#444",
    marginTop: 6,
    lineHeight: 18,
  },
  pickVideoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pickVideoBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#666",
  },
  videoSelected: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C9883A",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  videoName: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#e0e0e0",
  },
  videoDuration: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },
  removeVideoBtn: { padding: 4 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  chipActive: { borderColor: "#C9883A", backgroundColor: "#0d0a07" },
  chipText: { fontFamily: "Outfit", fontSize: 13, color: "#555" },
  chipTextActive: { color: "#C9883A" },
  loadRow: { flexDirection: "row", gap: 8 },
  loadBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 10,
    alignItems: "center",
  },
  loadBtnActive: { borderColor: "#C9883A", backgroundColor: "#0d0a07" },
  loadBtnLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#555",
    marginBottom: 2,
  },
  loadBtnLabelActive: { color: "#C9883A" },
  loadBtnDesc: { fontFamily: "Outfit", fontSize: 10, color: "#333" },
  dimBlock: { marginBottom: 22 },
  dimLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#C9883A",
    marginBottom: 4,
  },
  dimQuestion: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#999",
    marginBottom: 12,
    lineHeight: 18,
  },
  focusInput: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 60,
    marginTop: 8,
  },
  errorText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#BF1D1D",
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: "#C9883A",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginBottom: 8,
  },
  submitBtnDisabled: { backgroundColor: "#1a1a1a" },
  submitBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 3,
    color: "#050505",
  },
  sessionScoreBlock: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    paddingVertical: 24,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    marginBottom: 20,
  },
  sessionScoreLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#444",
    flex: 1,
  },
  sessionScore: { fontFamily: "SpaceMono", fontSize: 40, color: "#e0e0e0" },
  sessionScoreUnit: { fontFamily: "SpaceMono", fontSize: 16, color: "#444" },
  scoresGrid: { gap: 12, marginBottom: 20 },
  scoreCard: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    padding: 14,
  },
  scoreLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#C9883A",
    marginBottom: 4,
  },
  scoreValue: { fontFamily: "SpaceMono", fontSize: 24, color: "#e0e0e0", marginBottom: 8 },
  scoreBar: { height: 2, backgroundColor: "#1a1a1a", marginBottom: 8 },
  scoreBarFill: { height: 2, backgroundColor: "#C9883A" },
  scoreBasis: { fontFamily: "Outfit", fontSize: 11, color: "#444" },
  rawSignalsSection: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  rawSignalsLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#444",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  rawSignalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  rawSignalName: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#555",
    flex: 1,
    marginRight: 12,
    textTransform: "uppercase",
    lineHeight: 14,
    paddingTop: 1,
  },
  rawSignalRight: {
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: "55%",
  },
  rawSignalValue: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    color: "#c0c0c0",
    lineHeight: 14,
    textAlign: "right",
  },
  narrativeCard: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    borderLeftColor: "#C9883A",
    borderLeftWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    padding: 16,
    marginBottom: 20,
  },
  narrativeLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#444",
    marginBottom: 8,
  },
  narrativeText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 22,
  },
});
