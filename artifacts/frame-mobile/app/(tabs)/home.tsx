import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { CompetitionBanner } from "@/components/CompetitionBanner";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { useActiveCompetition } from "@/hooks/useCompetition";
import { useIsFramePlus } from "@/hooks/useEntitlement";
import {
  useTodayCheckin,
  useSaveCheckin,
  useCheckinHistory,
  type DailyCheckin,
} from "@/hooks/useCheckin";
import { apiGet, heroFileUrl } from "@/lib/api";
import { primaryFocus, type AthleteFact } from "@/lib/primaryFocus";
import {
  readinessModifier,
  applyReadinessModifier,
  type ChatMessageLike,
} from "@/lib/readinessModifier";

// ── Real-composite band read (interpretation, not fabrication) ─────────────
function bandFor(score: number): string {
  if (score >= 80) return "Primed";
  if (score >= 65) return "Trainable";
  if (score >= 45) return "Guarded";
  return "Depleted";
}

interface AnalysisListItem {
  id: number;
  sessionScore: number | null;
  locked?: boolean;
}

const METRIC_LABELS: {
  key: "sleep" | "energy" | "soreness" | "stress";
  label: string;
  hint: string;
}[] = [
  { key: "sleep", label: "Sleep", hint: "How rested you woke up" },
  { key: "energy", label: "Energy", hint: "Fuel in the tank right now" },
  { key: "soreness", label: "Soreness", hint: "100 = most sore" },
  { key: "stress", label: "Stress", hint: "100 = most stressed" },
];

// Soreness and stress are persisted as recovery quality (100 = fully recovered:
// no soreness / clear-headed) so the readiness composite can sum all four
// metrics as "higher is better". The athlete, though, reads them the natural
// way — 100 = most sore / most stressed — so we invert just these two at the
// display and input boundary (v = 100 - v). Storage, the composite, and every
// historical check-in are untouched.
const INVERTED_METRICS: Partial<
  Record<(typeof METRIC_LABELS)[number]["key"], true>
> = {
  soreness: true,
  stress: true,
};

// ── PanResponder slider (0-100) — mobile has no <Slider> dependency ────────
function MetricSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const setFromX = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const pct = Math.max(0, Math.min(1, x / w));
    onChange(Math.round(pct * 100));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;

  return (
    <View
      style={sliderStyles.track}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        widthRef.current = w;
        setWidth(w);
      }}
      {...responder.panHandlers}
    >
      <View style={sliderStyles.trackBg} />
      <View style={[sliderStyles.trackFill, { width: `${value}%` }]} />
      {width > 0 && (
        <View
          style={[
            sliderStyles.thumb,
            { left: Math.max(0, Math.min(width - 16, (value / 100) * width - 8)) },
          ]}
        />
      )}
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  track: {
    height: 28,
    justifyContent: "center",
  },
  trackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#1e1e1e",
  },
  trackFill: {
    position: "absolute",
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#8A6A2F",
  },
  thumb: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#8A6A2F",
    top: 6,
  },
});

function CheckinForm({
  existing,
  onDone,
}: {
  existing: DailyCheckin | null;
  onDone: () => void;
}) {
  const save = useSaveCheckin();
  // Sliders hold display units: soreness/stress are shown as amount (100 = most
  // sore / most stressed), the inverse of how they're stored.
  const [values, setValues] = useState({
    sleep: existing?.sleep ?? 70,
    energy: existing?.energy ?? 70,
    soreness: existing != null ? 100 - existing.soreness : 30,
    stress: existing != null ? 100 - existing.stress : 30,
  });
  const [hr, setHr] = useState(
    existing?.restingHr != null ? String(existing.restingHr) : "",
  );
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const restingHr = hr.trim() === "" ? null : Number(hr);
    if (
      restingHr != null &&
      (!Number.isInteger(restingHr) || restingHr < 25 || restingHr > 220)
    ) {
      setErr("Resting HR must be a whole number between 25 and 220.");
      return;
    }
    setErr(null);
    // Convert the two display-inverted metrics back to stored recovery quality.
    save.mutate(
      {
        sleep: values.sleep,
        energy: values.energy,
        soreness: 100 - values.soreness,
        stress: 100 - values.stress,
        restingHr,
      },
      {
        onSuccess: onDone,
        onError: (e) =>
          setErr(e instanceof Error ? e.message : "Couldn't save check-in"),
      },
    );
  };

  return (
    <View style={styles.formCard}>
      <Text style={styles.formIntro}>
        RATE HOW YOU ACTUALLY FEEL. 100 = FULLY RECOVERED.
      </Text>
      {METRIC_LABELS.map(({ key, label, hint }) => (
        <View key={key} style={styles.formRow}>
          <View style={styles.formRowHead}>
            <Text style={styles.formLabel}>{label.toUpperCase()}</Text>
            <Text style={styles.formValue}>{values[key]}</Text>
          </View>
          <MetricSlider
            value={values[key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
          />
          <Text style={styles.formHint}>{hint.toUpperCase()}</Text>
        </View>
      ))}
      <View style={styles.formRow}>
        <Text style={styles.formLabel}>RESTING HR (OPTIONAL, BPM)</Text>
        <TextInput
          value={hr}
          onChangeText={setHr}
          keyboardType="number-pad"
          placeholder="—"
          placeholderTextColor="#333"
          style={styles.hrInput}
        />
      </View>
      {err && <Text style={styles.formErr}>{err}</Text>}
      <View style={styles.formActions}>
        <Pressable
          onPress={submit}
          disabled={save.isPending}
          style={[styles.saveBtn, save.isPending && { opacity: 0.4 }]}
        >
          <Text style={styles.saveBtnText}>
            {save.isPending ? "SAVING" : existing ? "UPDATE" : "LOG CHECK-IN"}
          </Text>
        </Pressable>
        <Pressable onPress={onDone} hitSlop={8}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReadinessTrend({ checkins }: { checkins: DailyCheckin[] }) {
  const points = checkins.map((c) => ({
    date: c.checkinDate,
    score: Math.round((c.sleep + c.energy + c.soreness + c.stress) / 4),
  }));

  if (points.length < 2) {
    return (
      <View>
        <Text style={styles.sectionLabel}>READINESS TREND</Text>
        <Text style={styles.trendEmpty}>
          {points.length === 0
            ? "No check-ins in the last 30 days — log one to start the trend."
            : "One check-in logged — the trend starts at two."}
        </Text>
      </View>
    );
  }

  const shortDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.score - first.score;

  return (
    <View>
      <View style={styles.trendHead}>
        <Text style={styles.sectionLabel}>READINESS TREND</Text>
        <Text style={styles.trendMeta}>
          {points.length} DAYS · {delta === 0 ? "LEVEL" : delta > 0 ? `+${delta}` : `${delta}`}
        </Text>
      </View>
      <View style={styles.trendBars}>
        {points.map((p) => (
          <View
            key={p.date}
            style={[
              styles.trendBar,
              {
                height: `${Math.max(6, p.score)}%`,
                backgroundColor: p.date === last.date ? "#8A6A2F" : "#3a3a3a",
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.trendAxis}>
        <Text style={styles.trendAxisLabel}>{shortDay(first.date)}</Text>
        <Text style={styles.trendAxisLabel}>{shortDay(last.date)}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { fighter } = useFighter();

  const analysesQuery = useQuery<AnalysisListItem[]>({
    queryKey: ["analyses"],
    queryFn: () =>
      apiGet<{ analyses: AnalysisListItem[] }>("/analysis").then((r) =>
        Array.isArray(r?.analyses) ? r.analyses : [],
      ),
    enabled: !!fighter,
    staleTime: 60_000,
  });
  const latest =
    analysesQuery.data?.find((a) => !a.locked && a.sessionScore != null) ?? null;

  const checkinQuery = useTodayCheckin();
  const checkin = checkinQuery.data?.checkin ?? null;

  const isFramePlus = useIsFramePlus();
  const historyQuery = useCheckinHistory(isFramePlus);
  const historyCheckins = historyQuery.data?.checkins ?? [];

  const activeComp = useActiveCompetition();
  const competition = activeComp.data?.competition ?? null;
  const pressure = activeComp.data?.pressure ?? null;

  const { data: rawFacts } = useQuery<AthleteFact[]>({
    queryKey: ["facts"],
    queryFn: () =>
      apiGet<{ facts: AthleteFact[] }>("/memory").then((r) =>
        Array.isArray(r?.facts) ? r.facts : [],
      ),
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });
  const facts = useMemo(
    () => (Array.isArray(rawFacts) ? rawFacts : []),
    [rawFacts],
  );
  const focus = fighter ? primaryFocus(fighter, facts) : null;
  const hasFocus = !!focus && focus.label !== "Not yet identified";

  const [editing, setEditing] = useState(false);

  const checkinScore = checkin
    ? Math.round((checkin.sleep + checkin.energy + checkin.soreness + checkin.stress) / 4)
    : null;
  const sessionScore =
    latest?.sessionScore != null ? Math.round(latest.sessionScore) : null;

  // Same lightweight ±10 chat modifier the STATE tab applies, so the Fight
  // Readiness number stays consistent across screens. Reuses the active
  // conversation query — no new data flow.
  const conversationQuery = useQuery<ChatMessageLike[]>({
    queryKey: ["conversation-active"],
    queryFn: () =>
      apiGet<{ messages: ChatMessageLike[] }>("/conversation/active").then((r) =>
        Array.isArray(r?.messages) ? r.messages : [],
      ),
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });
  const chatModifier = useMemo(
    () => readinessModifier(conversationQuery.data ?? []),
    [conversationQuery.data],
  );

  const baseReadiness = checkinScore ?? sessionScore;
  const readiness = applyReadinessModifier(baseReadiness, chatModifier);
  const provenance =
    checkinScore != null
      ? "TODAY'S CHECK-IN"
      : sessionScore != null
        ? "LAST SESSION"
        : null;

  const hasHero = !!fighter && (fighter.heroImageUrl ?? "").trim() !== "";
  const heroSrc = hasHero ? heroFileUrl(fighter!.updatedAt) : null;
  const zoom = (fighter?.heroZoom ?? 100) / 100;

  const metaParts = fighter
    ? [
        fighter.primarySport
          ? fighter.primarySport.replace(/_/g, " ").toUpperCase()
          : null,
        fighter.weightClass || null,
        fighter.stance ? fighter.stance.toUpperCase() : null,
      ].filter((p): p is string => !!p)
    : [];

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        {heroSrc ? (
          <Image
            source={{ uri: heroSrc }}
            style={[
              StyleSheet.absoluteFill,
              { opacity: 0.45, transform: [{ scale: zoom }] },
            ]}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={["#171717", "#050505"]}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.72)",
            "rgba(0,0,0,0.42)",
            "rgba(0,0,0,0.55)",
            "rgba(0,0,0,0.97)",
          ]}
          locations={[0, 0.34, 0.62, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Header over hero */}
        <View style={[styles.heroHeader, { paddingTop: topPad + 8 }]}>
          <Image
            source={require("@/assets/images/frame-wordmark.png")}
            style={styles.wordmark}
            resizeMode="contain"
          />
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.profileBtn}
            hitSlop={12}
            accessibilityLabel="Open profile"
          >
            <Feather name="user" size={18} color="#888" />
          </Pressable>
        </View>

        {/* Identity overlay */}
        <View style={styles.heroIdentity}>
          <Text style={styles.heroKicker}>ATHLETE</Text>
          <Text style={styles.heroName}>{(fighter?.name ?? "—").toUpperCase()}</Text>
          {metaParts.length > 0 && (
            <Text style={styles.heroMeta}>{metaParts.join("   ·   ")}</Text>
          )}
        </View>
      </View>

      <CompetitionBanner />

      {/* ─── Today's focus ────────────────────────────────────────────── */}
      {hasFocus && focus && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>TODAY'S FOCUS</Text>
          </View>
          <Pressable
            style={styles.focusRow}
            onPress={() => router.push("/(tabs)/chat")}
          >
            <Text style={styles.focusLabel}>{focus.label}</Text>
            <Feather name="chevron-right" size={16} color="#555" />
          </Pressable>
          <Text style={styles.focusSource}>{focus.source.toUpperCase()}</Text>
        </View>
      )}

      {/* ─── Fight readiness ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>FIGHT READINESS</Text>
          {provenance && <Text style={styles.sectionMeta}>{provenance}</Text>}
        </View>

        <View style={styles.readyGrid}>
          <View style={styles.readyLeft}>
            {readiness != null ? (
              <>
                <Text style={styles.readyBig}>{readiness}</Text>
                <Text style={styles.readyBand}>{bandFor(readiness).toUpperCase()}</Text>
              </>
            ) : (
              <>
                <Text style={styles.readyBigEmpty}>—</Text>
                <Text style={styles.readyEmptyNote}>
                  No real data yet. Log a check-in or analyse a session.
                </Text>
              </>
            )}
          </View>

          <View style={styles.readyRight}>
            {METRIC_LABELS.map(({ key, label }) => (
              <View key={key} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{label.toUpperCase()}</Text>
                <Text style={styles.breakdownValue}>
                  {checkin
                    ? INVERTED_METRICS[key]
                      ? 100 - checkin[key]
                      : checkin[key]
                    : "—"}
                </Text>
              </View>
            ))}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>CARDIO HR</Text>
              <Text style={styles.breakdownValue}>
                {checkin?.restingHr != null ? `${checkin.restingHr}` : "—"}
                {checkin?.restingHr != null && (
                  <Text style={styles.bpm}> bpm</Text>
                )}
              </Text>
            </View>

            {!editing && (
              <Pressable
                onPress={() => setEditing(true)}
                style={styles.editRow}
                hitSlop={8}
              >
                {checkin ? (
                  <>
                    <Feather name="edit-2" size={11} color="#8A6A2F" />
                    <Text style={styles.editText}>EDIT TODAY'S CHECK-IN</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.editText}>LOG TODAY'S CHECK-IN</Text>
                    <Feather name="chevron-right" size={11} color="#8A6A2F" />
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {editing && (
          <CheckinForm existing={checkin} onDone={() => setEditing(false)} />
        )}

        {/* Readiness trend — FRAME+ */}
        <View style={styles.trendWrap}>
          {isFramePlus ? (
            historyQuery.isLoading ? (
              <ActivityIndicator size="small" color="#8A6A2F" />
            ) : (
              <ReadinessTrend checkins={historyCheckins} />
            )
          ) : (
            <Pressable
              onPress={() => router.push("/paywall")}
              style={styles.lockedRow}
            >
              <View style={styles.lockedLeft}>
                <Feather name="lock" size={13} color="#555" />
                <Text style={styles.lockedLabel}>READINESS TREND</Text>
              </View>
              <Text style={styles.lockedPlus}>FRAME+</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ─── Competition context ──────────────────────────────────────── */}
      <View style={[styles.section, { paddingBottom: 32 }]}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>COMPETITION CONTEXT</Text>
        </View>
        {competition && pressure ? (
          <Pressable
            style={styles.compRow}
            onPress={() => router.push("/(tabs)/planner")}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.compEvent}>{competition.eventName}</Text>
              <Text style={styles.compPhase}>{pressure.phase.toUpperCase()}</Text>
            </View>
            <View style={styles.compRight}>
              <Text style={styles.compDays}>{pressure.daysToEvent}</Text>
              <Text style={styles.compDaysLabel}>DAYS OUT</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.compEmpty}>
            <Text style={styles.compEmptyText}>NO ACTIVE CAMP.</Text>
            <Pressable
              style={styles.compEmptyCta}
              onPress={() => router.push("/(tabs)/planner")}
              hitSlop={8}
            >
              <Text style={styles.compEmptyCtaText}>SET A CAMP</Text>
              <Feather name="chevron-right" size={11} color="#8A6A2F" />
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },
  // Hero
  hero: {
    height: 380,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  heroHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  wordmark: {
    width: 104,
    height: 33,
    tintColor: "#e0e0e0",
  },
  profileBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIdentity: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  heroKicker: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 6,
    color: "#888",
    marginBottom: 8,
  },
  heroName: {
    fontFamily: "Outfit",
    fontSize: 44,
    letterSpacing: 4,
    color: "#f2f2f2",
  },
  heroMeta: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#999",
    marginTop: 10,
  },
  // Sections
  section: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  sectionHead: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    paddingBottom: 8,
  },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    paddingBottom: 8,
  },
  sectionTitle: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 6,
    color: "#777",
  },
  sectionMeta: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#555",
  },
  sectionLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 4,
    color: "#777",
  },
  // Focus
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    gap: 12,
  },
  focusLabel: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 18,
    color: "#f0f0f0",
    lineHeight: 24,
  },
  focusSource: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#555",
    marginTop: 8,
  },
  // Readiness
  readyGrid: {
    flexDirection: "row",
    gap: 28,
    paddingTop: 20,
  },
  readyLeft: {
    minWidth: 120,
  },
  readyBig: {
    fontFamily: "Outfit",
    fontSize: 84,
    lineHeight: 84,
    color: "#f2f2f2",
  },
  readyBand: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 6,
    color: "#8A6A2F",
    marginTop: 10,
  },
  readyBigEmpty: {
    fontFamily: "Outfit",
    fontSize: 84,
    lineHeight: 84,
    color: "#2a2a2a",
  },
  readyEmptyNote: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#666",
    marginTop: 10,
    maxWidth: 170,
    lineHeight: 15,
  },
  readyRight: {
    flex: 1,
    paddingTop: 4,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  breakdownLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#777",
  },
  breakdownValue: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#d8d8d8",
  },
  bpm: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: "#666",
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  editText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#8A6A2F",
  },
  // Check-in form
  formCard: {
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.015)",
    padding: 18,
    gap: 16,
  },
  formIntro: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#777",
    lineHeight: 15,
  },
  formRow: {
    gap: 6,
  },
  formRowHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  formLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#aaa",
  },
  formValue: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#8A6A2F",
  },
  formHint: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#444",
  },
  hrInput: {
    width: 96,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 14,
    marginTop: 4,
  },
  formErr: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#d2553f",
  },
  formActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingTop: 4,
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.4)",
  },
  saveBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#8A6A2F",
  },
  cancelText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#666",
  },
  // Trend
  trendWrap: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: 20,
  },
  trendHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  trendMeta: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#555",
  },
  trendEmpty: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#555",
    marginTop: 8,
    lineHeight: 15,
  },
  trendBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 56,
    marginTop: 16,
  },
  trendBar: {
    flex: 1,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  trendAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  trendAxisLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#444",
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  lockedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lockedLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#777",
  },
  lockedPlus: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
  // Competition
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 20,
    gap: 16,
  },
  compEvent: {
    fontFamily: "Outfit",
    fontSize: 17,
    color: "#f0f0f0",
    letterSpacing: 0.5,
  },
  compPhase: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#666",
    marginTop: 6,
  },
  compRight: {
    alignItems: "flex-end",
  },
  compDays: {
    fontFamily: "Outfit",
    fontSize: 34,
    lineHeight: 34,
    color: "#8A6A2F",
  },
  compDaysLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#666",
    marginTop: 4,
  },
  compEmpty: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingTop: 20,
  },
  compEmptyText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#555",
  },
  compEmptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compEmptyCtaText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#8A6A2F",
  },
});
