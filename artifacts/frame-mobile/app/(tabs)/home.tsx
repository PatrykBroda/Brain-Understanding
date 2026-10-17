import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
  EmptyState,
  Eyebrow,
  FadeIn,
  Field,
  GlassCard,
  Label,
  Numeral,
  Punch,
  Screen,
  Sparkline,
  TickScale,
  haptic,
} from "@/components/ui";
import { fonts, MIN_TAP, palette, radius, SCREEN_PAD } from "@/constants/theme";
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
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
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
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "increment") onChange(Math.min(100, value + 5));
        if (e.nativeEvent.actionName === "decrement") onChange(Math.max(0, value - 5));
      }}
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
        onSuccess: () => {
          haptic.success();
          onDone();
        },
        onError: (e) => {
          haptic.error();
          setErr(e instanceof Error ? e.message : "Couldn't save check-in");
        },
      },
    );
  };

  return (
    <GlassCard raised padding={20}>
      <View style={styles.formStack}>
        <Display size="heading">{existing ? "Update today's check-in" : "Today's check-in"}</Display>
        <Body small>Rate how you actually feel. 100 = fully recovered.</Body>
        {METRIC_LABELS.map(({ key, label, hint }) => (
          <View key={key} style={styles.formRow}>
            <View style={styles.formRowHead}>
              <Text style={styles.formLabel}>{label}</Text>
              <Text style={styles.formValue}>{values[key]}</Text>
            </View>
            <MetricSlider
              label={label}
              value={values[key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
            />
            <Text style={styles.formHint}>{hint}</Text>
          </View>
        ))}
        <View style={styles.hrBox}>
          <Field
            label="Resting heart rate (optional, bpm)"
            value={hr}
            onChangeText={setHr}
            keyboardType="number-pad"
            placeholder="—"
          />
        </View>
        {err && (
          <Text style={styles.formErr} accessibilityRole="alert">
            {err}
          </Text>
        )}
        <View style={styles.formActions}>
          <Button
            title={existing ? "Update" : "Log check-in"}
            onPress={submit}
            loading={save.isPending}
            style={{ flex: 1 }}
          />
          <Button title="Cancel" variant="ghost" onPress={onDone} />
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
      <View style={{ gap: 6 }}>
        <Text style={styles.cardTitle}>Readiness trend</Text>
        <Body small>
          {points.length === 0
            ? "No check-ins in the last 30 days. Log one to start the trend."
            : "One check-in logged. The trend starts at two."}
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
        <Text style={styles.cardTitle}>Readiness trend</Text>
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

/** One check-in metric: label, tabular value and a score bar that fills the row. */
function MetricRow({ label, value }: { label: string; value: number | null }) {
  const [w, setW] = useState(0);
  return (
    <View
      style={styles.metricRow}
      onLayout={(e: LayoutChangeEvent) => setW(Math.floor(e.nativeEvent.layout.width))}
      accessible
      accessibilityLabel={`${label} ${value != null ? value : "no data"}`}
    >
      <View style={styles.metricHead}>
        <Label>{label}</Label>
        <Numeral size="s">{value != null ? value : "—"}</Numeral>
      </View>
      {value != null && w > 0 ? <TickScale value={value} width={w} height={14} /> : <View style={{ height: 14 }} />}
    </View>
  );
}

/** Setup step for a new athlete: done state is real (derived from their data). */
function SetupRow({ done, title, body, onPress, last }: { done: boolean; title: string; body: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}${done ? ", done" : ""}`}
      style={({ pressed }) => [styles.setupRow, !last && styles.setupRule, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.setupDot, done && styles.setupDotOn]}>
        {done ? <Feather name="check" size={13} color={palette.onGold} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.setupTitle}>{title}</Text>
        <Text style={styles.setupBody}>{body}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={palette.textLow} />
    </Pressable>
  );
}

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
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

  const factsQuery = useQuery<AthleteFact[]>({
    queryKey: ["facts"],
    queryFn: () =>
      apiGet<{ facts: AthleteFact[] }>("/memory").then((r) =>
        Array.isArray(r?.facts) ? r.facts : [],
      ),
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });
  const facts = useMemo(
    () => (Array.isArray(factsQuery.data) ? factsQuery.data : []),
    [factsQuery.data],
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
  const hasChat = (conversationQuery.data?.length ?? 0) > 0;

  const baseReadiness = checkinScore ?? sessionScore;
  const readiness = applyReadinessModifier(baseReadiness, chatModifier);
  const provenance =
    checkinScore != null
      ? "From today's check-in"
      : sessionScore != null
        ? "From your last session"
        : null;

  const readinessLoading = checkinQuery.isLoading && analysesQuery.isLoading;
  const readinessFailed = !readinessLoading && checkinQuery.isError && analysesQuery.isError && readiness == null;

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
        fighter.primarySport ? titleCase(fighter.primarySport) : null,
        fighter.level || null,
        fighter.weightClass || null,
        fighter.stance ? titleCase(fighter.stance) : null,
      ].filter((p): p is string => !!p)
    : [];

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 96;

  const metricVal = (key: (typeof METRIC_LABELS)[number]["key"]) =>
    checkin ? (INVERTED_METRICS[key] ? 100 - checkin[key] : checkin[key]) : null;

  const isNewAthlete = !readinessLoading && !readinessFailed && !checkin && sessionScore == null && !hasChat;

  const nameBlock = (
    <>
      <Punch style={styles.heroName} numberOfLines={2}>
        {fighter?.name ?? "Athlete"}
      </Punch>
      {metaParts.length > 0 ? (
        <Text style={styles.heroMeta}>{metaParts.join("  ·  ")}</Text>
      ) : null}
    </>
  );

  return (
    <Screen light="champagne" focus="topLeft" intensity={0.9}>
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
            accessibilityLabel="Frame"
          />
        </FadeIn>

        {/* ─── 1. Athlete context (real profile data) ────────────────── */}
        <FadeIn index={1} style={styles.pad}>
          {heroSrc ? (
            <View style={styles.hero}>
              <Image
                source={{
                  uri: heroSrc,
                  ...(heroToken ? { headers: { Authorization: `Bearer ${heroToken}` } } : {}),
                }}
                style={[StyleSheet.absoluteFill, { opacity: 0.7, transform: [{ scale: zoom }] }]}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["rgba(8,9,11,0.1)", "rgba(8,9,11,0.45)", "rgba(8,9,11,0.94)"]}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.heroIdentity}>{nameBlock}</View>
            </View>
          ) : (
            <View style={styles.identity}>{nameBlock}</View>
          )}
        </FadeIn>

        {/* ─── 2. Today's focus ───────────────────────────────────────── */}
        <FadeIn index={2} style={styles.pad}>
          <GlassCard padding={20}>
            <Eyebrow>Today&apos;s focus</Eyebrow>
            {factsQuery.isLoading ? (
              <Body small style={{ marginTop: 10 }}>
                Reading your athlete model…
              </Body>
            ) : hasFocus && focus ? (
              <>
                <Display size="heading" style={styles.focusLabel}>
                  {focus.label}
                </Display>
                <Text style={styles.focusSource}>{focus.source}</Text>
              </>
            ) : (
              <>
                <Display size="heading" style={styles.focusLabel}>
                  Your focus appears here
                </Display>
                <Text style={styles.focusSource}>
                  Tell your coach what breaks down in training, or add weaknesses in your profile.
                </Text>
              </>
            )}
          </GlassCard>
        </FadeIn>

        {/* ─── 3. Access to coaching — the one primary action ─────────── */}
        <FadeIn index={3} style={styles.pad}>
          <Button
            title={hasChat ? "Continue with your coach" : "Start with your coach"}
            onPress={() => router.push("/(tabs)/chat")}
          />
        </FadeIn>

        {/* ─── Supporting info ────────────────────────────────────────── */}
        {/* Fight readiness */}
        <FadeIn index={4} style={styles.pad}>
          {readinessLoading ? (
            <EmptyState kind="loading" title="Loading your readiness" />
          ) : readinessFailed ? (
            <EmptyState
              kind="error"
              title="Couldn't load your readiness"
              body="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => {
                void checkinQuery.refetch();
                void analysesQuery.refetch();
              }}
            />
          ) : (
            <GlassCard padding={20}>
              <View style={styles.sectionHeadRow}>
                <Text style={styles.cardTitle}>Fight readiness</Text>
                {provenance && <Text style={styles.sectionMeta}>{provenance}</Text>}
              </View>

              <View style={styles.gaugeBox}>
                {readiness != null ? (
                  <ArcGauge value={readiness} size={216} label={bandFor(readiness)} unit="/ 100" />
                ) : (
                  <View style={styles.emptyGauge}>
                    <Text style={styles.emptyTitle}>No readiness yet</Text>
                    <Body small style={styles.readyEmptyNote}>
                      It comes from a check-in or an analysed session. Log how you feel to start.
                    </Body>
                  </View>
                )}
              </View>

              {!editing && (
                <Button
                  title={checkin ? "Edit today's check-in" : "Log today's check-in"}
                  variant="secondary"
                  onPress={() => setEditing(true)}
                  style={{ marginTop: 8 }}
                />
              )}
            </GlassCard>
          )}
        </FadeIn>

        {editing && (
          <View style={styles.pad}>
            <CheckinForm existing={checkin} onDone={() => setEditing(false)} />
          </View>
        )}

        {/* New athlete: concrete first steps, completion is real */}
        {isNewAthlete && (
          <FadeIn index={5} style={styles.pad}>
            <GlassCard padding={20}>
              <Text style={styles.cardTitle}>Get set up</Text>
              <View style={{ marginTop: 4 }}>
                <SetupRow
                  done={!!checkin}
                  title="Log a check-in"
                  body="Sleep, energy, soreness and stress"
                  onPress={() => setEditing(true)}
                />
                <SetupRow
                  done={hasChat}
                  title="Tell your coach about your training"
                  body="What you do, and what breaks down"
                  onPress={() => router.push("/(tabs)/chat")}
                />
                <SetupRow
                  done={sessionScore != null}
                  title="Analyse a session"
                  body="Upload a clip for a session score"
                  onPress={() => router.push("/(tabs)/analyse")}
                  last
                />
              </View>
            </GlassCard>
          </FadeIn>
        )}

        {/* Today's breakdown */}
        {checkin && (
          <FadeIn index={5} style={styles.pad}>
            <GlassCard padding={20}>
              <Text style={styles.cardTitle}>Today&apos;s check-in</Text>
              <View style={styles.metricGrid}>
                {METRIC_LABELS.map(({ key, label }) => (
                  <MetricRow key={key} label={label} value={metricVal(key)} />
                ))}
                <View style={styles.metricHead}>
                  <Label>Resting heart rate</Label>
                  <Numeral size="s">
                    {checkin.restingHr != null ? `${checkin.restingHr}` : "—"}
                    {checkin.restingHr != null && <Text style={styles.bpm}> bpm</Text>}
                  </Numeral>
                </View>
              </View>
            </GlassCard>
          </FadeIn>
        )}

        {/* Camp: banner when active, a quiet prompt when not */}
        {competition ? (
          <FadeIn index={6}>
            <CompetitionBanner />
          </FadeIn>
        ) : activeComp.isLoading ? null : (
          <FadeIn index={6} style={styles.pad}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/planner")}
              style={({ pressed }) => [styles.campRow, pressed && { backgroundColor: palette.raised }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.campTitle}>No active camp</Text>
                <Text style={styles.campBody}>Set a fight or competition to plan your build.</Text>
              </View>
              <Feather name="chevron-right" size={18} color={palette.textLow} />
            </Pressable>
          </FadeIn>
        )}

        {/* Readiness trend — FRAME+ */}
        <FadeIn index={7} style={styles.pad}>
          <GlassCard padding={20}>
            {isFramePlus ? (
              historyQuery.isLoading ? (
                <Body small>Loading your trend…</Body>
              ) : (
                <ReadinessTrend checkins={historyCheckins} />
              )
            ) : (
              <Pressable
                onPress={() => router.push("/paywall")}
                accessibilityRole="button"
                accessibilityLabel="Readiness trend, included with FRAME+"
                style={styles.lockedRow}
              >
                <View style={styles.lockedLeft}>
                  <Feather name="lock" size={16} color={palette.textLow} />
                  <Text style={styles.cardTitle}>Readiness trend</Text>
                </View>
                <Text style={styles.lockedPlus}>FRAME+</Text>
              </Pressable>
            )}
          </GlassCard>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  pad: { paddingHorizontal: SCREEN_PAD, marginTop: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_PAD,
  },
  wordmark: { width: 104, height: 33, tintColor: palette.text },
  identity: { paddingTop: 20, paddingBottom: 4, gap: 6 },
  hero: {
    height: 220,
    borderRadius: radius.xl,
    overflow: "hidden",
    justifyContent: "flex-end",
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  heroIdentity: { padding: 20, gap: 6 },
  heroName: { fontSize: 36, lineHeight: 40, letterSpacing: -1.2, color: palette.textHi },
  heroMeta: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: palette.textMid },
  cardTitle: { fontFamily: fonts.semi, fontSize: 18, letterSpacing: -0.2, color: palette.textHi },
  focusLabel: { marginTop: 10 },
  focusSource: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, marginTop: 6 },
  sectionHeadRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  sectionMeta: { fontFamily: fonts.regular, fontSize: 13, color: palette.textMid, flexShrink: 1, textAlign: "right" },
  gaugeBox: { alignItems: "center", marginTop: 12 },
  emptyGauge: { alignItems: "center", paddingVertical: 20, gap: 8 },
  emptyTitle: { fontFamily: fonts.semi, fontSize: 17, color: palette.textMid },
  readyEmptyNote: { textAlign: "center", maxWidth: 280 },
  // Breakdown
  metricGrid: { gap: 18, marginTop: 16 },
  metricRow: { gap: 8 },
  metricHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  bpm: { fontFamily: fonts.regular, fontSize: 13, color: palette.textMid },
  // Setup
  setupRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 10 },
  setupRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.borderStrong },
  setupDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  setupDotOn: { backgroundColor: palette.gold, borderColor: palette.gold },
  setupTitle: { fontFamily: fonts.medium, fontSize: 16, color: palette.textHi },
  setupBody: { fontFamily: fonts.regular, fontSize: 13, color: palette.textMid },
  // Camp
  campRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: MIN_TAP + 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    marginTop: 16,
    marginHorizontal: SCREEN_PAD,
  },
  campTitle: { fontFamily: fonts.semi, fontSize: 16, color: palette.textHi },
  campBody: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.textMid, marginTop: 2 },
  // Check-in form
  formStack: { gap: 18 },
  formRow: { gap: 2 },
  formRowHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  formLabel: { fontFamily: fonts.medium, fontSize: 15, color: palette.textHi },
  formValue: { fontFamily: fonts.semi, fontSize: 20, color: palette.textHi, fontVariant: ["tabular-nums"] },
  formHint: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow },
  hrBox: { width: "100%" },
  formErr: { fontFamily: fonts.regular, fontSize: 14, color: palette.redText },
  formActions: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 4 },
  // Trend
  trendHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  trendMeta: { fontFamily: fonts.regular, fontSize: 13, color: palette.textMid, fontVariant: ["tabular-nums"] },
  trendAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  trendAxisLabel: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow, fontVariant: ["tabular-nums"] },
  lockedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TAP },
  lockedLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  lockedPlus: { fontFamily: fonts.medium, fontSize: 13, color: palette.gold },
});

const sliderStyles = StyleSheet.create({
  track: { height: 44, justifyContent: "center" },
  trackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.borderStrong,
  },
  trackFill: { position: "absolute", left: 0, height: 3, borderRadius: 2, backgroundColor: palette.gold },
  thumb: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.goldPale,
    borderWidth: 3,
    borderColor: palette.raised,
    top: 11,
  },
});
