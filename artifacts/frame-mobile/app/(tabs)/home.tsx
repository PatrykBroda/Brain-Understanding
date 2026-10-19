import { useLocalSearchParams, useRouter } from "expo-router";
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
  useSaveCheckin,
  useCheckinHistory,
  type DailyCheckin,
} from "@/hooks/useCheckin";
import { useToday } from "@/hooks/useToday";
import { useLocalDay } from "@/hooks/useLocalDay";
import { DisclosureNotice, FocusCard } from "@/components/TodayCards";
import { FirstUsePointers } from "@/components/FirstUsePointers";
import { ReadinessBars } from "@/components/ReadinessBars";
import { dismissProps } from "@/components/FormScroll";
import { KEYBOARD_DONE_ID } from "@/components/KeyboardDoneBar";
import { apiGet, getAuthToken, heroFileUrl } from "@/lib/api";
import { formatDay } from "@/lib/localDay";
import { sportDisplayName } from "@/lib/onboarding";
import { questionnaireAnswered } from "@workspace/onboarding";
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
          inputAccessoryViewID={KEYBOARD_DONE_ID}
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

function ReadinessHistory({
  checkins,
  today,
}: {
  checkins: DailyCheckin[];
  today: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const hasAny = checkins.length > 0;
  return (
    <View>
      <View style={styles.trendHead}>
        <Text style={styles.sectionLabel}>READINESS HISTORY</Text>
        <Text style={styles.trendMeta}>
          {hasAny ? "LAST 14 DAYS · TAP A BAR" : "LAST 14 DAYS"}
        </Text>
      </View>
      <View style={{ marginTop: 16 }}>
        <ReadinessBars
          checkins={checkins}
          today={today}
          selected={selected}
          onSelect={setSelected}
        />
      </View>
      {!hasAny && (
        <Text style={styles.trendEmpty}>
          No check-ins in the last 14 days — log one to start the history.
        </Text>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn, userId } = useAuth();
  const { fighter } = useFighter();

  // State, Today's Focus and readiness for the athlete's local day (the server is the one
  // authority on what "today" is; an older check-in is never returned as today's).
  const todayQuery = useToday();
  const today = todayQuery.data ?? null;
  const checkin = today?.readiness.today?.checkin ?? null;
  const latestCheckin = today?.readiness.latest ?? null;
  const localDay = useLocalDay();

  const isFramePlus = useIsFramePlus();
  const historyQuery = useCheckinHistory(isFramePlus);
  const historyCheckins = historyQuery.data?.checkins ?? [];

  const activeComp = useActiveCompetition();
  const competition = activeComp.data?.competition ?? null;
  const pressure = activeComp.data?.pressure ?? null;

  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const formY = useRef(0);
  // "Check in now" on State lands here with the form open.
  const { checkin: checkinParam, n: checkinNonce } = useLocalSearchParams<{
    checkin?: string;
    n?: string;
  }>();
  useEffect(() => {
    if (checkinParam === "1") setEditing(true);
  }, [checkinParam, checkinNonce]);
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(
      () => scrollRef.current?.scrollTo({ y: Math.max(0, formY.current - 16), animated: true }),
      120,
    );
    return () => clearTimeout(t);
  }, [editing]);

  const checkinScore = checkin
    ? Math.round((checkin.sleep + checkin.energy + checkin.soreness + checkin.stress) / 4)
    : null;

  // Same lightweight +/-10 chat modifier the STATE tab applies, so the Fight
  // Readiness number stays consistent across screens. Reuses the active
  // conversation query - no new data flow.
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

  // Today's number comes from today's check-in only. An older check-in or an old
  // session score is never presented as today's readiness (it is shown dated).
  const readiness = applyReadinessModifier(checkinScore, chatModifier);
  const provenance =
    checkinScore != null
      ? "TODAY'S CHECK-IN"
      : latestCheckin
        ? `LAST CHECK-IN ${formatDay(latestCheckin.date).toUpperCase()}`
        : null;
  const readinessLoading = todayQuery.isLoading;
  const readinessFailed = !readinessLoading && todayQuery.isError && readiness == null;

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
        fighter.primarySport ? sportDisplayName(fighter.primarySport).toUpperCase() : null,
        fighter.level ? fighter.level.toUpperCase() : null,
        fighter.weightClass || null,
        fighter.stance ? fighter.stance.toUpperCase() : null,
      ].filter((p): p is string => !!p)
    : [];

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.root}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
      {...dismissProps}
    >
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        {heroSrc ? (
          <Image
            source={{
              uri: heroSrc,
              ...(heroToken ? { headers: { Authorization: `Bearer ${heroToken}` } } : {}),
            }}
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

      {/* Onboarding questions prompt: shown until the athlete has answered them */}
      {fighter && !questionnaireAnswered(fighter) && (
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.qCard, pressed && { borderColor: "#8A6A2F" }]}
            onPress={() => router.push({ pathname: "/(tabs)/profile", params: { section: "questions", n: String(Date.now()) } })}
            accessibilityRole="button"
            accessibilityLabel="Answer your onboarding questions so FRAME can coach you"
          >
            <Text style={styles.qLabel}>ONBOARDING QUESTIONS</Text>
            <Text style={styles.qText}>Answer your onboarding questions so FRAME can coach you</Text>
            <View style={styles.editRow}>
              <Text style={styles.editText}>ANSWER NOW</Text>
              <Feather name="chevron-right" size={11} color="#8A6A2F" />
            </View>
          </Pressable>
        </View>
      )}

      {/* Today's focus (from /today, dated) */}
      <View style={styles.section}>
        {today && today.disclosure.code !== "none" ? (
          <View style={{ marginBottom: 20 }}>
            <DisclosureNotice disclosure={today.disclosure} onCheckIn={() => setEditing(true)} />
          </View>
        ) : null}
        <FocusCard
          focus={today?.focus ?? null}
          loading={todayQuery.isLoading}
          onAskCoach={(prompt) =>
            router.push({ pathname: "/(tabs)/chat", params: { prefill: prompt, n: String(Date.now()) } })
          }
        />
      </View>

      {/* First-use pointers: log training, check in, update profile */}
      <View style={styles.section}>
        <FirstUsePointers
          userId={userId}
          hasCheckinToday={!!checkin}
          hasEverCheckedIn={!!latestCheckin}
          hasChatted={hasChat}
          onAction={(id) => {
            if (id === "log-training") router.push("/(tabs)/chat");
            else if (id === "checkin") setEditing(true);
            else router.push("/(tabs)/profile");
          }}
        />
      </View>

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
                  {readinessLoading
                    ? "READING YOUR DAY…"
                    : readinessFailed
                      ? "COULDN'T LOAD YOUR READINESS."
                      : latestCheckin
                        ? `NO CHECK-IN TODAY. LAST CHECK-IN ${formatDay(latestCheckin.date).toUpperCase()}: ${latestCheckin.score} / 100. THAT IS NOT TODAY'S READINESS.`
                        : "NO READINESS YET. IT COMES FROM TODAY'S CHECK-IN."}
                </Text>
                {readinessFailed && (
                  <Pressable
                    onPress={() => {
                      void todayQuery.refetch();
                    }}
                    style={styles.editRow}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.editText}>TRY AGAIN</Text>
                    <Feather name="chevron-right" size={11} color="#8A6A2F" />
                  </Pressable>
                )}
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
          <View onLayout={(e) => { formY.current = e.nativeEvent.layout.y; }}>
            <CheckinForm existing={checkin} onDone={() => setEditing(false)} />
          </View>
        )}

        {/* Readiness trend — FRAME+ */}
        <View style={styles.trendWrap}>
          {isFramePlus ? (
            historyQuery.isLoading ? (
              <ActivityIndicator size="small" color="#8A6A2F" />
            ) : (
              <ReadinessHistory checkins={historyCheckins} today={localDay} />
            )
          ) : (
            <Pressable
              onPress={() => router.push("/paywall")}
              style={styles.lockedRow}
            >
              <View style={styles.lockedLeft}>
                <Feather name="lock" size={13} color="#555" />
                <Text style={styles.lockedLabel}>READINESS HISTORY</Text>
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
  qCard: {
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.35)",
    padding: 16,
    gap: 8,
  },
  qLabel: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 4, color: "#8A6A2F" },
  qText: { fontFamily: "Outfit", fontSize: 15, lineHeight: 22, color: "#e0e0e0" },
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
