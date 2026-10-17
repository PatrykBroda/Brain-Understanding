import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { CompetitionBanner } from "@/components/CompetitionBanner";
import {
  ArcGauge,
  Body,
  Button,
  Display,
  Eyebrow,
  FadeIn,
  Field,
  GlassCard,
  IconButton,
  Numeral,
  Screen,
  Sparkline,
  TickScale,
} from "@/components/ui";
import { fonts, palette, radius } from "@/constants/theme";
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
import { apiGet, getAuthToken, heroFileUrl } from "@/lib/api";
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
  // The track's absolute left edge in window coordinates. We drive the slider
  // from the touch's absolute page X (gestureState) minus this offset, rather
  // than nativeEvent.locationX — locationX is reported relative to whichever
  // child view (the fill/thumb overlay) actually caught the touch, which made
  // the value jump. Absolute coordinates are immune to that.
  const leftRef = useRef(0);
  const trackRef = useRef<View>(null);

  const setFromPageX = (pageX: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const pct = Math.max(0, Math.min(1, (pageX - leftRef.current) / w));
    onChange(Math.round(pct * 100));
  };

  // Re-measure on each touch start so a scrolled position (this form lives in a
  // ScrollView) doesn't leave a stale offset.
  const remeasure = (then?: () => void) => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      leftRef.current = x;
      if (w > 0) {
        widthRef.current = w;
        setWidth(w);
      }
      then?.();
    });
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Don't let the enclosing ScrollView steal the drag mid-slide.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_e, g) => remeasure(() => setFromPageX(g.x0)),
      onPanResponderMove: (_e, g) => setFromPageX(g.moveX),
    }),
  ).current;

  return (
    <View
      ref={trackRef}
      style={sliderStyles.track}
      onLayout={() => remeasure()}
      {...responder.panHandlers}
    >
      <View style={sliderStyles.trackBg} />
      <View style={[sliderStyles.trackFill, { width: `${value}%` }]} />
      {width > 0 && (
        <View
          style={[
            sliderStyles.thumb,
            { left: Math.max(0, Math.min(width - 22, (value / 100) * width - 11)) },
          ]}
        />
      )}
    </View>
  );
}


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
    <GlassCard radius={28} padding={22}>
      <View style={styles.formStack}>
        <Body small>Rate how you actually feel. 100 = fully recovered.</Body>
        {METRIC_LABELS.map(({ key, label, hint }) => (
          <View key={key} style={styles.formRow}>
            <View style={styles.formRowHead}>
              <Eyebrow style={{ color: palette.textMid }}>{label}</Eyebrow>
              <Text style={styles.formValue}>{values[key]}</Text>
            </View>
            <MetricSlider
              value={values[key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
            />
            <Text style={styles.formHint}>{hint}</Text>
          </View>
        ))}
        <View style={styles.hrBox}>
          <Field
            label="Resting HR (optional, bpm)"
            value={hr}
            onChangeText={setHr}
            keyboardType="number-pad"
            placeholder="—"
          />
        </View>
        {err && <Text style={styles.formErr}>{err}</Text>}
        <View style={styles.formActions}>
          <Button
            title={save.isPending ? "Saving" : existing ? "Update" : "Log check-in"}
            onPress={submit}
            disabled={save.isPending}
          />
          <Pressable onPress={onDone} hitSlop={8} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );
}

function ReadinessTrend({ checkins }: { checkins: DailyCheckin[] }) {
  const [w, setW] = useState(0);
  const points = checkins.map((c) => ({
    date: c.checkinDate,
    score: Math.round((c.sleep + c.energy + c.soreness + c.stress) / 4),
  }));

  if (points.length < 2) {
    return (
      <View style={{ gap: 8 }}>
        <Eyebrow>Readiness trend</Eyebrow>
        <Body small>
          {points.length === 0
            ? "No check-ins in the last 30 days — log one to start the trend."
            : "One check-in logged — the trend starts at two."}
        </Body>
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
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.floor(e.nativeEvent.layout.width))}>
      <View style={styles.trendHead}>
        <Eyebrow>Readiness trend</Eyebrow>
        <Text style={styles.trendMeta}>
          {points.length} days · {delta === 0 ? "level" : delta > 0 ? `+${delta}` : `${delta}`}
        </Text>
      </View>
      <View style={{ marginTop: 12 }}>
        {w > 0 ? (
          <Sparkline data={points.map((p) => p.score)} width={w} height={84} />
        ) : (
          <View style={{ height: 84 }} />
        )}
      </View>
      <View style={styles.trendAxis}>
        <Text style={styles.trendAxisLabel}>{shortDay(first.date)}</Text>
        <Text style={styles.trendAxisLabel}>{shortDay(last.date)}</Text>
      </View>
    </View>
  );
}

/** One check-in metric: label, thin numeral and a tick scale that fills the row. */
function MetricRow({ label, value }: { label: string; value: number | null }) {
  const [w, setW] = useState(0);
  return (
    <View
      style={styles.metricRow}
      onLayout={(e: LayoutChangeEvent) => setW(Math.floor(e.nativeEvent.layout.width))}
    >
      <View style={styles.metricHead}>
        <Eyebrow>{label}</Eyebrow>
        <Numeral size="s">{value != null ? value : "—"}</Numeral>
      </View>
      {value != null && w > 0 ? (
        <TickScale value={value} width={w} height={26} ticks={Math.max(21, Math.floor(w / 7))} />
      ) : (
        <View style={{ height: 26 }} />
      )}
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

  // Auth token for the hero image request — Image doesn't send Bearer headers
  // automatically, so without this the GET /fighter/hero/file returns 401.
  const [heroToken, setHeroToken] = useState<string | null>(null);
  useEffect(() => {
    if (hasHero) getAuthToken().then(setHeroToken);
  }, [hasHero, fighter?.updatedAt]);

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

  const metricVal = (key: (typeof METRIC_LABELS)[number]["key"]) =>
    checkin ? (INVERTED_METRICS[key] ? 100 - checkin[key] : checkin[key]) : null;

  return (
    <Screen>
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ paddingBottom: bottomPad, paddingTop: topPad + 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <FadeIn index={0} style={styles.header}>
          <Image
            source={require("@/assets/images/frame-wordmark.png")}
            style={styles.wordmark}
            resizeMode="contain"
          />
          <IconButton
            icon="user"
            label="Open profile"
            onPress={() => router.push("/(tabs)/profile")}
          />
        </FadeIn>

        {/* ─── Athlete hero card ──────────────────────────────────────── */}
        <FadeIn index={1} style={styles.pad}>
          <View style={styles.hero}>
            {heroSrc ? (
              <Image
                source={{
                  uri: heroSrc,
                  ...(heroToken ? { headers: { Authorization: `Bearer ${heroToken}` } } : {}),
                }}
                style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ scale: zoom }] }]}
                resizeMode="cover"
              />
            ) : (
              <>
                <LinearGradient
                  colors={[palette.graphite3, palette.graphite0]}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={["rgba(138,106,47,0.38)", "rgba(138,106,47,0)"]}
                  start={{ x: 0.9, y: 0 }}
                  end={{ x: 0.2, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </>
            )}
            <LinearGradient
              colors={["rgba(5,5,5,0.15)", "rgba(5,5,5,0.35)", "rgba(5,5,5,0.92)"]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.heroIdentity}>
              <Eyebrow style={{ color: palette.goldLight }}>Athlete</Eyebrow>
              <Display size="title" style={styles.heroName} numberOfLines={2}>
                {fighter?.name ?? "—"}
              </Display>
              {metaParts.length > 0 && (
                <Text style={styles.heroMeta}>{metaParts.join("  ·  ")}</Text>
              )}
            </View>
          </View>
        </FadeIn>

        <FadeIn index={2}>
          <CompetitionBanner />
        </FadeIn>

        {/* ─── Fight readiness ────────────────────────────────────────── */}
        <FadeIn index={3} style={styles.pad}>
          <GlassCard tone="gold" radius={32} padding={22}>
            <View style={styles.sectionHeadRow}>
              <Eyebrow>Fight readiness</Eyebrow>
              {provenance && <Text style={styles.sectionMeta}>{provenance}</Text>}
            </View>

            <View style={styles.gaugeBox}>
              {readiness != null ? (
                <ArcGauge value={readiness} size={250} label={bandFor(readiness)} unit="/ 100" />
              ) : (
                <View style={styles.emptyGauge}>
                  <Text style={styles.readyBigEmpty}>—</Text>
                  <Body small style={styles.readyEmptyNote}>
                    No real data yet. Log a check-in or analyse a session.
                  </Body>
                </View>
              )}
            </View>

            {!editing && (
              <Pressable
                onPress={() => setEditing(true)}
                style={styles.editPill}
                hitSlop={6}
                accessibilityRole="button"
              >
                {checkin ? (
                  <>
                    <Feather name="edit-2" size={13} color={palette.goldLight} />
                    <Text style={styles.editText}>Edit today's check-in</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.editText}>Log today's check-in</Text>
                    <Feather name="chevron-right" size={14} color={palette.goldLight} />
                  </>
                )}
              </Pressable>
            )}
          </GlassCard>
        </FadeIn>

        {editing && (
          <View style={styles.pad}>
            <CheckinForm existing={checkin} onDone={() => setEditing(false)} />
          </View>
        )}

        {/* ─── Breakdown ──────────────────────────────────────────────── */}
        <FadeIn index={4} style={styles.pad}>
          <GlassCard radius={28} padding={20}>
            <View style={styles.metricGrid}>
              {METRIC_LABELS.map(({ key, label }) => (
                <MetricRow key={key} label={label} value={metricVal(key)} />
              ))}
              <View style={styles.metricHead}>
                <Eyebrow>Cardio HR</Eyebrow>
                <Numeral size="s">
                  {checkin?.restingHr != null ? `${checkin.restingHr}` : "—"}
                  {checkin?.restingHr != null && <Text style={styles.bpm}> bpm</Text>}
                </Numeral>
              </View>
            </View>
          </GlassCard>
        </FadeIn>

        {/* ─── Today's focus ──────────────────────────────────────────── */}
        {hasFocus && focus && (
          <FadeIn index={5} style={styles.pad}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/chat")}>
              <GlassCard radius={28} padding={20}>
                <Eyebrow style={{ color: palette.goldLight }}>Today's focus</Eyebrow>
                <View style={styles.focusRow}>
                  <Display size="sub" style={styles.focusLabel}>
                    {focus.label}
                  </Display>
                  <View style={styles.chevDisc}>
                    <Feather name="arrow-up-right" size={16} color={palette.goldPale} />
                  </View>
                </View>
                <Text style={styles.focusSource}>{focus.source}</Text>
              </GlassCard>
            </Pressable>
          </FadeIn>
        )}

        {/* ─── Readiness trend — FRAME+ ───────────────────────────────── */}
        <FadeIn index={6} style={styles.pad}>
          <GlassCard radius={28} padding={20}>
            {isFramePlus ? (
              historyQuery.isLoading ? (
                <ActivityIndicator size="small" color={palette.goldLight} />
              ) : (
                <ReadinessTrend checkins={historyCheckins} />
              )
            ) : (
              <Pressable onPress={() => router.push("/paywall")} style={styles.lockedRow}>
                <View style={styles.lockedLeft}>
                  <Feather name="lock" size={14} color={palette.textLow} />
                  <Eyebrow>Readiness trend</Eyebrow>
                </View>
                <Text style={styles.lockedPlus}>FRAME+</Text>
              </Pressable>
            )}
          </GlassCard>
        </FadeIn>

        {/* ─── Competition context ────────────────────────────────────── */}
        <FadeIn index={7} style={styles.pad}>
          <GlassCard radius={28} padding={20}>
            <Eyebrow>Competition context</Eyebrow>
            {competition && pressure ? (
              <Pressable style={styles.compRow} onPress={() => router.push("/(tabs)/planner")}>
                <View style={{ flex: 1 }}>
                  <Display size="sub">{competition.eventName}</Display>
                  <Text style={styles.compPhase}>{pressure.phase}</Text>
                </View>
                <View style={styles.compRight}>
                  <Text style={styles.compDays}>{pressure.daysToEvent}</Text>
                  <Text style={styles.compDaysLabel}>days out</Text>
                </View>
              </Pressable>
            ) : (
              <View style={styles.compEmpty}>
                <Body small>No active camp.</Body>
                <Pressable
                  style={styles.compEmptyCta}
                  onPress={() => router.push("/(tabs)/planner")}
                  hitSlop={8}
                >
                  <Text style={styles.compEmptyCtaText}>Set a camp</Text>
                  <Feather name="chevron-right" size={14} color={palette.goldLight} />
                </Pressable>
              </View>
            )}
          </GlassCard>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  pad: { paddingHorizontal: 20, marginTop: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  wordmark: { width: 104, height: 33, tintColor: palette.text },
  hero: {
    height: 230,
    borderRadius: radius.xl,
    overflow: "hidden",
    justifyContent: "flex-end",
    borderWidth: 1,
    borderColor: palette.glassEdge,
    backgroundColor: palette.graphite1,
  },
  heroIdentity: { padding: 22, gap: 4 },
  heroName: { color: palette.textHi },
  heroMeta: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    color: palette.textMid,
    marginTop: 6,
    textTransform: "uppercase",
  },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionMeta: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: palette.goldLight,
    textTransform: "uppercase",
  },
  gaugeBox: { alignItems: "center", marginTop: 14 },
  emptyGauge: { alignItems: "center", paddingVertical: 28, gap: 8 },
  readyBigEmpty: { fontFamily: fonts.numeralXL, fontSize: 84, lineHeight: 88, color: palette.textLow },
  readyEmptyNote: { textAlign: "center", maxWidth: 240 },
  editPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
    marginTop: 6,
  },
  editText: { fontFamily: fonts.textMedium, fontSize: 13, letterSpacing: 0.4, color: palette.goldPale },
  // Breakdown
  metricGrid: { gap: 18 },
  metricRow: { gap: 6 },
  metricHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  bpm: { fontFamily: fonts.text, fontSize: 12, color: palette.textMid },
  // Focus
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 10,
  },
  focusLabel: { flex: 1 },
  chevDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
  },
  focusSource: {
    fontFamily: fonts.text,
    fontSize: 12,
    color: palette.textLow,
    marginTop: 8,
    textTransform: "capitalize",
  },
  // Check-in form
  formStack: { gap: 20 },
  formRow: { gap: 4 },
  formRowHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  formValue: { fontFamily: fonts.numeral, fontSize: 22, color: palette.goldPale },
  formHint: { fontFamily: fonts.text, fontSize: 12, color: palette.textLow },
  hrBox: { width: 220 },
  formErr: { fontFamily: fonts.text, fontSize: 13, color: palette.redLight },
  formActions: { flexDirection: "row", alignItems: "center", gap: 18, paddingTop: 4 },
  cancelBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  cancelText: { fontFamily: fonts.textMedium, fontSize: 13, letterSpacing: 0.6, color: palette.textMid },
  // Trend
  trendHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  trendMeta: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: palette.goldLight,
    textTransform: "uppercase",
  },
  trendAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  trendAxisLabel: { fontFamily: fonts.text, fontSize: 11, color: palette.textLow },
  lockedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  lockedLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  lockedPlus: { fontFamily: fonts.textMedium, fontSize: 11, letterSpacing: 1.6, color: palette.goldLight },
  // Competition
  compRow: { flexDirection: "row", alignItems: "center", paddingTop: 14, gap: 16, minHeight: 44 },
  compPhase: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    color: palette.textMid,
    marginTop: 6,
    textTransform: "uppercase",
  },
  compRight: { alignItems: "flex-end" },
  compDays: { fontFamily: fonts.numeralXL, fontSize: 52, lineHeight: 54, letterSpacing: -2, color: palette.goldPale },
  compDaysLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: palette.textMid,
    textTransform: "uppercase",
  },
  compEmpty: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10 },
  compEmptyCta: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  compEmptyCtaText: { fontFamily: fonts.textMedium, fontSize: 13, color: palette.goldLight },
});

const sliderStyles = StyleSheet.create({
  track: { height: 44, justifyContent: "center" },
  trackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,244,224,0.12)",
  },
  trackFill: { position: "absolute", left: 0, height: 3, borderRadius: 2, backgroundColor: palette.goldLight },
  thumb: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.goldPale,
    borderWidth: 5,
    borderColor: "rgba(199,161,90,0.35)",
    top: 11,
  },
});
