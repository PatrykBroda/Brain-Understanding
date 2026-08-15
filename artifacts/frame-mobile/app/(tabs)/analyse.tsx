import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  FlatList,
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
import { apiGet, apiPost } from "@/lib/api";

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

interface AnalysisSummary {
  id: number;
  kind: string;
  nervousSystemLoad: string | null;
  sessionScore: number | null;
  styleProfile: string | null;
  summary: string | null;
  createdAt: string;
}

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
  { value: "padwork", label: "Padwork" },
  { value: "shadowboxing", label: "Shadow" },
  { value: "drilling", label: "Drilling" },
  { value: "movement", label: "Movement" },
  { value: "lifting", label: "Lifting" },
];

const FOCUS_PRESETS: { label: string; value: string }[] = [
  { label: "Overall", value: "" },
  { label: "Striking", value: "my striking — output, distance, shot selection" },
  { label: "Grappling", value: "my grappling — control, transitions, scrambles" },
  { label: "Footwork", value: "my footwork and positioning" },
  { label: "Defence", value: "my defence under pressure" },
  { label: "Fight IQ", value: "my decision-making and fight IQ" },
  { label: "Pace", value: "my pace and output under fatigue" },
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
}[] = [
  { key: "aggression", apiKey: "aggression", label: "AGGRESSION" },
  { key: "composure", apiKey: "composure", label: "COMPOSURE" },
  { key: "reactionSpeed", apiKey: "reaction_speed", label: "REACTION SPEED" },
  { key: "defensiveRecovery", apiKey: "defensive_recovery", label: "DEFENSIVE RECOVERY" },
];

const initialScores = {
  aggression: 60,
  composure: 60,
  reactionSpeed: 60,
  defensiveRecovery: 60,
};

type TrailStep = { value: string; id: number | null };

function buildSignalTrail(
  signalKey: string,
  currentValue: string,
  history: SignalHistoryEntry[],
): TrailStep[] {
  const allEntries: TrailStep[] = [];
  for (const h of history) {
    const sig = h.signals.find((s) => s.key === signalKey);
    if (sig?.value) allEntries.push({ value: sig.value, id: h.id });
  }
  allEntries.push({ value: currentValue, id: null });
  const deduped: TrailStep[] = [];
  for (const entry of allEntries) {
    if (deduped.length === 0 || deduped[deduped.length - 1]!.value !== entry.value) {
      deduped.push({ ...entry });
    } else {
      deduped[deduped.length - 1] = { ...entry };
    }
  }
  return deduped.slice(-5);
}

function SignalHistoryTrail({
  signalKey,
  currentValue,
  history,
  onSelectSession,
}: {
  signalKey: string;
  currentValue: string;
  history: SignalHistoryEntry[];
  onSelectSession?: (id: number) => void;
}) {
  const trail = buildSignalTrail(signalKey, currentValue, history);
  if (trail.length < 3) return null;
  return (
    <View style={trailSs.row}>
      {trail.map((step, i) => {
        const isCurrent = i === trail.length - 1;
        const tappable = !isCurrent && step.id != null && onSelectSession != null;
        return (
          <View key={i} style={trailSs.entry}>
            {i > 0 && (
              <Text style={trailSs.sep}>›</Text>
            )}
            {tappable ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelectSession!(step.id!);
                }}
                hitSlop={8}
                accessibilityLabel={`View session read: ${step.value}`}
                accessibilityRole="button"
              >
                {({ pressed }) => (
                  <Text style={[trailSs.val, trailSs.valTappable, pressed && trailSs.valPressed]}>
                    {step.value}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Text style={[trailSs.val, isCurrent && trailSs.valCurrent]}>
                {step.value}
              </Text>
            )}
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
  valTappable: { color: "#555", textDecorationLine: "underline" },
  valPressed: { color: "#C9883A" },
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Session-log stamp — matches the site: "13 AUG AT 18:13".
function formatLogStamp(iso: string): string {
  const d = new Date(iso);
  const mon = d.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${mon} AT ${hh}:${mm}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function AnalyseScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [video, setVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [kind, setKind] = useState<AnalysisKind>("sparring");
  const [load, setLoad] = useState<NervousSystemLoad>("moderate");
  const [scores, setScores] = useState(initialScores);
  const [focusPrompt, setFocusPrompt] = useState("");
  const [subject, setSubject] = useState<"self" | "opponent">("self");
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("upload");
  const [linkUrl, setLinkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  const [historyMode, setHistoryMode] = useState(false);
  const [resultSource, setResultSource] = useState<"form" | "history">("form");
  const [pastSessions, setPastSessions] = useState<AnalysisSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<AnalysisSummary[]>([]);

  const reportOpacity = useRef(new Animated.Value(1)).current;
  const historyOpacity = useRef(new Animated.Value(0)).current;
  const resultScrollRef = useRef<ScrollView>(null);

  function fadeIn() {
    Animated.timing(reportOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }

  async function fadeOutThen(callback: () => void): Promise<void> {
    const reduced = await AccessibilityInfo.isReduceMotionEnabled();
    if (reduced) {
      callback();
      return;
    }
    Animated.timing(reportOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => callback());
  }

  useEffect(() => {
    if (!historyMode) return;
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError(null);
    apiGet<{ analyses: AnalysisSummary[] }>("/analysis")
      .then((res) => {
        if (!cancelled) setPastSessions(res.analyses);
      })
      .catch((e: unknown) => {
        if (!cancelled) setHistoryError((e as Error).message ?? "Failed to load history.");
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => { cancelled = true; };
  }, [historyMode]);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ analyses: AnalysisSummary[] }>("/analysis")
      .then((res) => {
        if (!cancelled) setRecentSessions(res.analyses.slice(0, 4));
      })
      .catch(() => {
        /* swallow — empty feed on failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (openId == null) return;
    let cancelled = false;
    setLoadingSession(true);
    setResult(null);
    setError(null);
    apiGet<{ analysis: AnalysisResult }>(`/analysis/${openId}`)
      .then((res) => {
        if (!cancelled) setResult(res.analysis);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error).message ?? "Failed to load session.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });
    return () => { cancelled = true; };
  }, [openId]);

  useEffect(() => {
    if (result == null) return;
    resultScrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) {
        reportOpacity.setValue(1);
      } else {
        reportOpacity.setValue(0);
        fadeIn();
      }
    });
  }, [result]);

  function handleSelectSession(id: number) {
    if (result == null) {
      setOpenId(id);
      return;
    }
    void fadeOutThen(() => {
      setResult(null);
      setOpenId(id);
    });
  }

  function handleOpenFromHistory(id: number) {
    setResultSource("history");
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!reduced) {
        reportOpacity.setValue(0);
      }
      if (reduced) {
        setOpenId(id);
      } else {
        Animated.timing(historyOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setOpenId(id));
      }
    });
  }

  useEffect(() => {
    if (!historyMode) {
      historyOpacity.setValue(0);
      return;
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) {
        historyOpacity.setValue(1);
      } else {
        historyOpacity.setValue(0);
        Animated.timing(historyOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [historyMode]);

  function handleEnterHistory() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHistoryMode(true);
  }

  function handleBackFromHistory() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      const commit = () => {
        setHistoryMode(false);
        setPastSessions([]);
        setHistoryError(null);
      };
      if (reduced) {
        commit();
      } else {
        Animated.timing(historyOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => commit());
      }
    });
  }

  function handleBackFromResult() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resultSource === "history") {
      setResult(null);
      setOpenId(null);
      setError(null);
    } else {
      handleReset();
    }
  }

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
        subject: subject === "opponent" ? "opponent" : undefined,
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
    setSubject("self");
    setSourceMode("upload");
    setLinkUrl("");
    setOpenId(null);
    setResultSource("form");
    setHistoryMode(false);
    setPastSessions([]);
    setHistoryError(null);
  }

  if (loadingSession) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: topPad }]}>
        <ActivityIndicator color="#C9883A" />
        <Text style={styles.loadingText}>LOADING SESSION</Text>
      </View>
    );
  }

  if (historyMode && !result) {
    return (
      <Animated.View style={[styles.root, { paddingTop: topPad, opacity: historyOpacity }]}>
        <View style={[styles.header, { paddingHorizontal: 20 }]}>
          <Pressable onPress={handleBackFromHistory} hitSlop={12}>
            <Feather name="chevron-left" size={20} color="#666" />
          </Pressable>
          <Text style={styles.headerTitle}>PAST SESSIONS</Text>
          <View style={{ width: 28 }} />
        </View>
        {loadingHistory ? (
          <View style={[styles.centered, { flex: 1 }]}>
            <ActivityIndicator color="#C9883A" />
            <Text style={styles.loadingText}>LOADING</Text>
          </View>
        ) : historyError ? (
          <View style={[styles.centered, { flex: 1, paddingHorizontal: 24 }]}>
            <Text style={styles.errorText}>{historyError}</Text>
          </View>
        ) : pastSessions.length === 0 ? (
          <View style={[styles.centered, { flex: 1, paddingHorizontal: 24 }]}>
            <Text style={histSs.emptyText}>No sessions recorded yet.</Text>
          </View>
        ) : (
          <FlatList
            data={pastSessions}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
            ItemSeparatorComponent={() => <View style={histSs.separator} />}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [histSs.row, pressed && histSs.rowPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleOpenFromHistory(item.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open session from ${formatDate(item.createdAt)}`}
              >
                <View style={histSs.rowLeft}>
                  <Text style={histSs.rowDate}>{formatDate(item.createdAt)}</Text>
                  <Text style={histSs.rowKind}>
                    {capitalise(item.kind)}
                    {item.nervousSystemLoad ? ` · ${capitalise(item.nervousSystemLoad)}` : ""}
                  </Text>
                  {item.styleProfile ? (
                    <Text style={histSs.rowProfile} numberOfLines={1}>{item.styleProfile}</Text>
                  ) : null}
                </View>
                <View style={histSs.rowRight}>
                  {item.sessionScore != null ? (
                    <>
                      <Text style={histSs.rowScore}>{item.sessionScore}</Text>
                      <Text style={histSs.rowScoreUnit}>/100</Text>
                    </>
                  ) : null}
                  <Feather name="chevron-right" size={14} color="#333" style={{ marginTop: 4 }} />
                </View>
              </Pressable>
            )}
          />
        )}
      </Animated.View>
    );
  }

  if (result) {
    return (
      <Animated.View style={[styles.root, { opacity: reportOpacity }]}>
      <ScrollView
        ref={resultScrollRef}
        style={{ paddingTop: topPad }}
        contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 40 }]}
      >
        <View style={styles.header}>
          <Pressable onPress={handleBackFromResult} hitSlop={12}>
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
                        onSelectSession={handleSelectSession}
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
      </Animated.View>
    );
  }

  const accent = subject === "opponent" ? "#31B1ED" : "#C52626";
  const accentText = subject === "opponent" ? "#7CCBEB" : "#D77575";
  const accentBg =
    subject === "opponent" ? "rgba(49,177,237,0.08)" : "rgba(197,38,38,0.08)";

  const hasClip =
    (sourceMode === "upload" && !!video) ||
    (sourceMode === "link" && !!linkUrl.trim());

  const submitDisabled = submitting || !hasClip;

  return (
    <ScrollView
      style={[styles.root, { paddingTop: topPad }]}
      contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.headerTitle}>ANALYSE</Text>
        <Pressable onPress={handleEnterHistory} hitSlop={12} accessibilityLabel="View past sessions" accessibilityRole="button">
          <Feather name="clock" size={18} color="#555" />
        </Pressable>
      </View>

      {/* Mode toggle */}
      <View style={[styles.section, styles.modeRow]}>
        <Pressable
          style={[
            styles.modeBtn,
            subject === "self" && {
              borderColor: "#C52626",
              backgroundColor: "rgba(197,38,38,0.08)",
              borderLeftWidth: 3,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSubject("self");
          }}
        >
          <Text
            style={[
              styles.modeBtnText,
              subject === "self" && { color: "#D77575" },
            ]}
          >
            YOUR READ
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.modeBtn,
            subject === "opponent" && {
              borderColor: "#31B1ED",
              backgroundColor: "rgba(49,177,237,0.08)",
              borderLeftWidth: 3,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSubject("opponent");
          }}
        >
          <Text
            style={[
              styles.modeBtnText,
              subject === "opponent" && { color: "#7CCBEB" },
            ]}
          >
            OPPONENT SCOUT
          </Text>
        </Pressable>
      </View>

      {/* Movement-read intro block */}
      <View style={[styles.introBlock, { borderLeftColor: accent }]}>
        <Text style={[styles.introLabel, { color: accent }]}>
          {subject === "opponent" ? "OPPONENT SCOUT" : "MOVEMENT READ"}
        </Text>
        <Text style={styles.introBody}>
          {subject === "opponent"
            ? "Upload footage of your opponent. The system builds a categorical scouting model and contrasts it against your own recorded model for the matchup."
            : "Upload a clip. FRAME analyses your movement, positioning, timing, balance and reactions to identify patterns in how you perform under pressure."}
        </Text>
        <Text style={styles.introCaption}>
          PROCESSED ON DEVICE · ONLY THE READ IS KEPT
        </Text>
      </View>

      {/* Clip type */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: accent }]}>CLIP TYPE</Text>
        <View style={styles.gridRow}>
          {KINDS.map((k) => {
            const active = kind === k.value;
            return (
              <Pressable
                key={k.value}
                style={[
                  styles.gridBtn,
                  active && { borderColor: accent, backgroundColor: accentBg },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setKind(k.value);
                }}
              >
                <Text
                  style={[styles.gridBtnText, active && { color: accentText }]}
                >
                  {k.label.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Analysis category */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: accent }]}>
          ANALYSIS CATEGORY
        </Text>
        <View style={styles.chipWrap}>
          {FOCUS_PRESETS.map((preset) => {
            const active =
              preset.value === ""
                ? focusPrompt === ""
                : focusPrompt === preset.value;
            return (
              <Pressable
                key={preset.label}
                style={[
                  styles.presetChip,
                  active && { borderColor: accent, backgroundColor: accentBg },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFocusPrompt(preset.value);
                }}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    active && { color: accentText },
                  ]}
                >
                  {preset.label.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Source toggle + upload */}
      <View style={styles.section}>
        <View style={styles.modeRow}>
          <Pressable
            style={[
              styles.modeBtn,
              sourceMode === "upload" && {
                borderColor: accent,
                backgroundColor: accentBg,
                borderLeftWidth: 3,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSourceMode("upload");
            }}
          >
            <Text
              style={[
                styles.modeBtnText,
                sourceMode === "upload" && { color: accentText },
              ]}
            >
              UPLOAD FILE
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeBtn,
              sourceMode === "link" && {
                borderColor: accent,
                backgroundColor: accentBg,
                borderLeftWidth: 3,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSourceMode("link");
            }}
          >
            <Text
              style={[
                styles.modeBtnText,
                sourceMode === "link" && { color: accentText },
              ]}
            >
              PASTE LINK
            </Text>
          </Pressable>
        </View>

        {sourceMode === "upload" ? (
          video ? (
            <View style={[styles.videoSelected, { marginTop: 12, borderColor: accent }]}>
              <Feather name="video" size={16} color={accent} />
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
              style={({ pressed }) => [styles.dropZoneWrap, pressed && { opacity: 0.8 }]}
              onPress={pickVideo}
            >
              <View style={styles.dropZone}>
                <Feather name="upload" size={22} color={accent} />
                <Text style={styles.dropZoneText}>DROP FOOTAGE</Text>
                <Text style={styles.dropZoneHint}>MP4 · MOV · FIRST 75S PROCESSED</Text>
              </View>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </Pressable>
          )
        ) : (
          <>
            <View style={styles.linkBox}>
              <Feather name="link" size={16} color="#555" />
              <TextInput
                style={styles.linkInput}
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="https://…"
                placeholderTextColor="#333"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            <Text style={styles.sectionHint}>
              Direct video links (.mp4 / .mov), Google Drive and Dropbox links work best. The clip is read on this device, nothing else is stored.
            </Text>
          </>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!hasClip ? (
        <>
          {/* SESSION LOG feed */}
          {recentSessions.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.logHeader}>
                <View style={styles.logDot} />
                <Text style={styles.logLabel}>SESSION LOG</Text>
              </View>
              <View style={styles.logRule} />
              {recentSessions.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.logCard, pressed && { opacity: 0.65 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleOpenFromHistory(item.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open session from ${formatDate(item.createdAt)}`}
                >
                  <View style={styles.logCardTop}>
                    <View style={styles.logCardTitleRow}>
                      <Feather name="film" size={13} color="#555" />
                      <Text style={styles.logCardTitle} numberOfLines={2}>
                        {`${capitalise(item.kind)}${
                          item.styleProfile ? " · " + item.styleProfile : ""
                        }`.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.logCardScore}>
                      {item.sessionScore != null ? (
                        <Text style={styles.logScoreNum}>{item.sessionScore}</Text>
                      ) : null}
                      {item.nervousSystemLoad ? (
                        <Text style={styles.logScoreLoad}>
                          {capitalise(item.nervousSystemLoad).toUpperCase()}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {item.summary ? (
                    <Text style={styles.logCardBody} numberOfLines={2}>
                      {item.summary}
                    </Text>
                  ) : null}
                  <Text style={styles.logCardDate}>
                    {formatLogStamp(item.createdAt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* WEEKLY INTELLIGENCE REPORT — TODO: a dedicated weekly-report route
              may be needed; for now this opens PAST SESSIONS (closest existing). */}
          <Pressable
            style={({ pressed }) => [styles.weeklyBtn, pressed && { opacity: 0.7 }]}
            onPress={handleEnterHistory}
            accessibilityRole="button"
            accessibilityLabel="Weekly intelligence report"
          >
            <Feather name="file-text" size={15} color="#888" />
            <Text style={styles.weeklyBtnText}>WEEKLY INTELLIGENCE REPORT</Text>
          </Pressable>
        </>
      ) : (
        <>
          {/* Intensity */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: accent }]}>INTENSITY</Text>
            <View style={styles.loadRow}>
              {LOADS.map((l) => {
                const active = load === l.value;
                return (
                  <Pressable
                    key={l.value}
                    style={[
                      styles.loadBtn,
                      active && { borderColor: accent, backgroundColor: accentBg },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setLoad(l.value);
                    }}
                  >
                    <Text
                      style={[styles.loadBtnLabel, active && { color: accentText }]}
                    >
                      {l.label.toUpperCase()}
                    </Text>
                    <Text style={styles.loadBtnDesc}>{l.desc}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: accent },
              submitDisabled && styles.submitBtnDisabled,
              pressed && !submitDisabled && { opacity: 0.85 },
            ]}
            onPress={handleSubmit}
            disabled={submitDisabled}
          >
            {submitting ? (
              <ActivityIndicator color="#f5f5f5" />
            ) : (
              <Text style={[styles.submitBtnText, { color: "#f5f5f5" }]}>ANALYSE</Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  centered: { alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#444",
    marginTop: 8,
  },
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
  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#555",
  },
  introBlock: {
    borderLeftWidth: 2,
    paddingLeft: 14,
    paddingVertical: 4,
    marginBottom: 28,
  },
  introLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    marginBottom: 8,
  },
  introBody: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#888",
    lineHeight: 20,
  },
  introCaption: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1,
    color: "#444",
    marginTop: 10,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionalLabel: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#444",
  },
  textInput: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  gridRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridBtn: {
    width: "31.5%",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  gridBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#555",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chipWrapTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  presetChipText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#555",
  },
  dropZone: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    borderStyle: "dashed",
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
  },
  dropZoneText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 3,
    color: "#888",
  },
  dropZoneHint: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1,
    color: "#444",
  },
  dropZoneWrap: {
    position: "relative",
    marginTop: 12,
  },
  corner: {
    position: "absolute",
    width: 16,
    height: 16,
    borderColor: "#C52626",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  logDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C52626",
  },
  logLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#888",
  },
  logRule: {
    height: 1,
    backgroundColor: "#1a1a1a",
    marginBottom: 4,
  },
  logCard: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  logCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  logCardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
  },
  logCardTitle: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#c0c0c0",
    lineHeight: 14,
    flex: 1,
  },
  logCardScore: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    flexShrink: 0,
  },
  logScoreNum: {
    fontFamily: "SpaceMono",
    fontSize: 18,
    color: "#e0e0e0",
  },
  logScoreLoad: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1,
    color: "#C9883A",
  },
  logCardBody: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
    marginTop: 8,
  },
  logCardDate: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1,
    color: "#444",
    marginTop: 8,
  },
  weeklyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 16,
    marginBottom: 8,
  },
  weeklyBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#888",
  },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 14,
    marginTop: 12,
  },
  linkInput: {
    flex: 1,
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 14,
    paddingVertical: 12,
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

const histSs = StyleSheet.create({
  separator: { height: 1, backgroundColor: "#111" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  },
  rowPressed: { opacity: 0.6 },
  rowLeft: { flex: 1, marginRight: 12 },
  rowDate: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#888",
    marginBottom: 4,
  },
  rowKind: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#c0c0c0",
    marginBottom: 2,
  },
  rowProfile: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#555",
    lineHeight: 16,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  rowScore: {
    fontFamily: "SpaceMono",
    fontSize: 22,
    color: "#e0e0e0",
    lineHeight: 26,
  },
  rowScoreUnit: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#444",
  },
  emptyText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
  },
});
