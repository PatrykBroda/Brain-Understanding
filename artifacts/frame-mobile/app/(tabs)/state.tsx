import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { StateOrb } from "@/components/StateOrb";
import { DisclosureNotice } from "@/components/TodayCards";
import { ReadinessBars } from "@/components/ReadinessBars";
import { STATE_TIPS, stateTipPrompt } from "@/lib/stateTips";
import {
  ArcGauge,
  Body,
  Button,
  EmptyState,
  Eyebrow,
  FadeIn,
  GlassCard,
  Punch,
  Screen,
  haptic,
  useReducedMotion,
} from "@/components/ui";
import { fonts, motion, palette, radius, SCREEN_PAD } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { useCheckinHistory } from "@/hooks/useCheckin";
import { useIsFramePlus } from "@/hooks/useEntitlement";
import { useToday } from "@/hooks/useToday";
import { apiGet } from "@/lib/api";
import { formatDay } from "@/lib/localDay";
import { stateDateLine, stateHeadline } from "@/lib/today";
import {
  readinessModifier,
  applyReadinessModifier,
  type ChatMessageLike,
} from "@/lib/readinessModifier";

interface Fact {
  id: number;
  category: string;
  content: string;
  status: string;
  confidence: number;
}

interface AnalysisListItem {
  id: number;
  sessionScore: number | null;
  createdAt?: string;
  locked?: boolean;
}

const NO_DATA = "No data yet";

/** One real input: label, value (or "No data yet"), optional explanatory line. */
function FactorRow({ label, value, note, last }: { label: string; value: string | null; note?: string; last?: boolean }) {
  const empty = value == null;
  return (
    <View
      style={[styles.factor, !last && styles.factorRule]}
      accessible
      accessibilityLabel={`${label}: ${empty ? NO_DATA : value}${note ? `. ${note}` : ""}`}
    >
      <View style={styles.factorHead}>
        <Text style={styles.factorLabel}>{label}</Text>
        <Text style={[styles.factorValue, empty && { color: palette.textLow, fontFamily: fonts.regular }]}>
          {empty ? NO_DATA : value}
        </Text>
      </View>
      {note ? <Text style={styles.factorNote}>{note}</Text> : null}
    </View>
  );
}

/**
 * The factors behind the displayed state. Opens/closes with a 300ms opacity +
 * translate (instant when reduced motion), then unmounts so a closed panel
 * costs nothing and is not reachable by screen readers.
 */
function FactorsPanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(v, {
      toValue: open ? 1 : 0,
      duration: reduced ? 0 : motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, reduced, v]);
  if (!mounted) return null;
  return (
    <Animated.View
      style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}
    >
      {children}
    </Animated.View>
  );
}

export default function StateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { fighter } = useFighter();
  const [expanded, setExpanded] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const todayQuery = useToday();
  const today = todayQuery.data ?? null;
  const state = today?.state ?? null;
  const current = !!state?.current && !!state.name;
  const stateName = current ? state!.name! : null;

  const factsQuery = useQuery<Fact[]>({
    queryKey: ["facts"],
    queryFn: () =>
      apiGet<{ facts: Fact[]; count: number }>("/memory").then((r) => {
        const f = r?.facts;
        return Array.isArray(f) ? f : [];
      }),
    enabled: !!isSignedIn,
    staleTime: 0,
  });
  const facts: Fact[] = useMemo(() => (Array.isArray(factsQuery.data) ? factsQuery.data : []), [factsQuery.data]);
  const activeCount = facts.filter((f) => f.status === "active").length;

  // Readiness is TODAY's check-in. An older check-in is shown dated, never as today's number.
  const checkin = today?.readiness.today?.checkin ?? null;
  const checkinScore = today?.readiness.today?.score ?? null;
  const latest = today?.readiness.latest ?? null;

  const analysesQuery = useQuery<AnalysisListItem[]>({
    queryKey: ["analyses"],
    queryFn: () =>
      apiGet<{ analyses: AnalysisListItem[] }>("/analysis").then((r) =>
        Array.isArray(r?.analyses) ? r.analyses : [],
      ),
    enabled: !!fighter,
    staleTime: 60_000,
  });
  const lastAnalysis = analysesQuery.data?.find((a) => !a.locked && a.sessionScore != null) ?? null;
  const sessionScore = lastAnalysis?.sessionScore != null ? Math.round(lastAnalysis.sessionScore) : null;

  // Recent chat drives a small ±10 modifier on top of today's check-in. It reuses the
  // same conversation the chat tab reads, so no new data flow.
  const conversationQuery = useQuery<ChatMessageLike[]>({
    queryKey: ["conversation-active"],
    queryFn: () =>
      apiGet<{ messages: ChatMessageLike[] }>("/conversation/active").then((r) =>
        Array.isArray(r?.messages) ? r.messages : [],
      ),
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });
  const chatMessages = conversationQuery.data ?? [];
  const chatModifier = useMemo(() => readinessModifier(chatMessages), [chatMessages]);
  const readiness = applyReadinessModifier(checkinScore, chatModifier);
  const hasSession = chatMessages.length > 0;

  // FRAME+: tappable readiness history.
  const isFramePlus = useIsFramePlus();
  const historyQuery = useCheckinHistory(isFramePlus);
  const historyCheckins = historyQuery.data?.checkins ?? [];

  const { width } = useWindowDimensions();
  const orbSize = Math.round(Math.min(width * 0.6, 260));
  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 96;

  const loading = todayQuery.isLoading;
  const failed = todayQuery.isError && !todayQuery.data;

  const checkinNote = checkin ? "From today's check-in, out of 100" : undefined;
  const fmt = (n: number | null | undefined) => (n == null ? null : String(n));

  const modifierValue =
    conversationQuery.isLoading || chatMessages.length === 0
      ? null
      : chatModifier === 0
        ? "None"
        : chatModifier > 0
          ? `+${chatModifier}`
          : `${chatModifier}`;

  function goCheckIn() {
    haptic.select();
    router.push({ pathname: "/(tabs)/home", params: { checkin: "1", n: String(Date.now()) } });
  }

  const dateLine = state ? stateDateLine(state, formatDay) : null;

  return (
    <Screen light="silver" focus="center" intensity={0.9}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image
            source={require("../../assets/images/frame-wordmark.png")}
            style={styles.wordmarkImg}
            resizeMode="contain"
            accessibilityLabel="Frame"
          />
        </View>

        {failed ? (
          <View style={styles.pad}>
            <EmptyState
              kind="error"
              title="Couldn't load your state"
              body="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => void todayQuery.refetch()}
            />
          </View>
        ) : (
          <>
            {/* Orb + the state, understandable without the orb or any motion */}
            <View style={styles.center}>
              <StateOrb
                size={orbSize}
                stateLabel={stateName ?? "Dormant"}
                expanded={expanded}
                onToggle={() => setExpanded((e) => !e)}
              />

              <FadeIn style={styles.stateBlock}>
                {dateLine ? <Eyebrow>{dateLine}</Eyebrow> : <Eyebrow>Your state</Eyebrow>}
                <Punch style={[styles.stateLabel, (loading || !current) && { color: palette.textLow }]}>
                  {loading ? "Reading…" : state ? stateHeadline(state) : "No read yet"}
                </Punch>
                {!loading && !current && state?.name ? (
                  <Text style={styles.lastRead} accessibilityRole="text">
                    Last read: {state.name}, {state.asOf ? formatDay(state.asOf) : ""}. Not today&apos;s state.
                  </Text>
                ) : null}
                {loading ? (
                  <Body style={styles.stateCue}>Checking your athlete model.</Body>
                ) : null}
              </FadeIn>
            </View>

            {today && !loading ? (
              <View style={styles.pad}>
                <DisclosureNotice disclosure={today.disclosure} onCheckIn={goCheckIn} />
              </View>
            ) : null}

            {stateName && !loading ? (
              <View style={styles.pad}>
                <Pressable
                  onPress={() => {
                    haptic.select();
                    router.push({
                      pathname: "/(tabs)/chat",
                      params: { prefill: stateTipPrompt(stateName), n: String(Date.now()) },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Tip: ${STATE_TIPS[stateName].tip} ${STATE_TIPS[stateName].why}`}
                  accessibilityHint="Opens your coach with this tip ready to send"
                  style={({ pressed }) => [styles.tip, pressed && styles.tipPressed]}
                >
                  <View style={styles.tipHead}>
                    <Eyebrow>Tip</Eyebrow>
                    <Feather name="arrow-up-right" size={16} color={palette.textMid} />
                  </View>
                  <Text style={styles.tipText}>{STATE_TIPS[stateName].tip}</Text>
                  <Text style={styles.tipWhy}>{STATE_TIPS[stateName].why}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.centerRow}>
              <Pressable
                onPress={() => setExpanded((e) => !e)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={expanded ? "Hide what shapes this" : "Show what shapes this"}
                style={styles.whyBtn}
                hitSlop={6}
              >
                <Text style={styles.whyText}>What shapes this</Text>
                <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={palette.textMid} />
              </Pressable>
            </View>

            <FactorsPanel open={expanded}>
              <View style={styles.pad}>
                <GlassCard raised padding={20}>
                  <View style={styles.panelHead}>
                    <Text style={styles.panelState}>{stateName ?? (state?.name ? "No read today" : "No read yet")}</Text>
                    <Text style={styles.panelCue}>
                      {stateName
                        ? STATE_TIPS[stateName].tip
                        : "FRAME has nothing from you today, so it is not reading a state."}
                    </Text>
                  </View>

                  <Eyebrow style={styles.groupLabel}>Your state</Eyebrow>
                  <FactorRow
                    label="Read from"
                    value={current ? state!.source : null}
                    note={current && state ? `Based on ${formatDay(state.asOf!)}.` : undefined}
                  />
                  <FactorRow
                    label="Athlete model"
                    value={activeCount > 0 ? `${activeCount} active ${activeCount === 1 ? "note" : "notes"}` : null}
                    last
                  />

                  <Eyebrow style={[styles.groupLabel, { marginTop: 20 }]}>Fight readiness</Eyebrow>
                  <FactorRow label="Sleep" value={fmt(checkin?.sleep)} note={checkinNote} />
                  <FactorRow label="Energy" value={fmt(checkin?.energy)} />
                  <FactorRow
                    label="Soreness"
                    value={checkin ? String(100 - checkin.soreness) : null}
                    note={checkin ? "100 = most sore" : undefined}
                  />
                  <FactorRow
                    label="Stress"
                    value={checkin ? String(100 - checkin.stress) : null}
                    note={checkin ? "100 = most stressed" : undefined}
                  />
                  <FactorRow
                    label="Last session score"
                    value={fmt(sessionScore)}
                    note={
                      sessionScore != null
                        ? lastAnalysis?.createdAt
                          ? `From your latest analysed session, ${formatDay(lastAnalysis.createdAt.slice(0, 10))}`
                          : "From your latest analysed session"
                        : undefined
                    }
                  />
                  <FactorRow
                    label="Recent chat adjustment"
                    value={checkin ? modifierValue : null}
                    note={checkin && modifierValue != null ? "Up to ±10, from what you told your coach" : undefined}
                    last
                  />
                </GlassCard>
              </View>
            </FactorsPanel>

            {/* Fight readiness: today's number, or the last one clearly dated */}
            <FadeIn index={1} style={styles.pad}>
              <Pressable
                onPress={goCheckIn}
                accessibilityRole="button"
                accessibilityLabel={
                  readiness != null
                    ? `Fight readiness ${readiness} out of 100 from today's check-in. Update it`
                    : "No check-in today. Log one"
                }
              >
                <GlassCard padding={16}>
                  <View style={styles.readinessRow}>
                    {readiness != null ? (
                      <View style={styles.gaugeWrap}>
                        <ArcGauge value={readiness} size={104} label="" />
                      </View>
                    ) : null}
                    <View style={styles.readinessText}>
                      <Text style={styles.readinessTitle}>Fight readiness</Text>
                      {readiness != null ? (
                        <Text style={styles.readinessSub}>{readiness} / 100 from today&apos;s check-in</Text>
                      ) : latest ? (
                        <Text style={styles.readinessSub}>
                          No check-in today. Last: {latest.score} / 100 on {formatDay(latest.date)}.
                        </Text>
                      ) : (
                        <Text style={styles.readinessSub}>No check-in yet. Log one to start.</Text>
                      )}
                    </View>
                    <Feather name="chevron-right" size={18} color={palette.textLow} />
                  </View>
                </GlassCard>
              </Pressable>
            </FadeIn>

            {/* Check-in history: tap a bar to open that day */}
            <FadeIn index={2} style={styles.pad}>
              <GlassCard padding={16}>
                <Text style={styles.readinessTitle}>Check-in history</Text>
                {isFramePlus ? (
                  historyQuery.isLoading ? (
                    <Body small style={{ marginTop: 8 }}>
                      Loading your check-ins…
                    </Body>
                  ) : historyQuery.isError ? (
                    <Body small style={{ marginTop: 8 }}>
                      Couldn&apos;t load your history. Pull to refresh or try again later.
                    </Body>
                  ) : historyCheckins.length === 0 ? (
                    <Body small style={{ marginTop: 8 }}>
                      No check-ins in the last 30 days. Log one to start your history.
                    </Body>
                  ) : (
                    <View style={{ marginTop: 14 }}>
                      <ReadinessBars
                        checkins={historyCheckins}
                        today={today?.date ?? ""}
                        selected={openDate}
                        onSelect={setOpenDate}
                      />
                      {openDate == null ? <Text style={styles.barsHint}>Tap a day to open that check-in.</Text> : null}
                    </View>
                  )
                ) : (
                  <Pressable
                    onPress={() => router.push("/paywall")}
                    accessibilityRole="button"
                    accessibilityLabel="Check-in history, included with FRAME+"
                    style={styles.lockedRow}
                  >
                    <View style={styles.lockedLeft}>
                      <Feather name="lock" size={16} color={palette.textLow} />
                      <Text style={styles.factorLabel}>See past check-ins</Text>
                    </View>
                    <Text style={styles.lockedPlus}>FRAME+</Text>
                  </Pressable>
                )}
              </GlassCard>
            </FadeIn>

            <View style={[styles.pad, { marginTop: 16 }]}>
              <Button
                title={hasSession ? "Continue with your coach" : "Start coaching"}
                onPress={() => router.push("/(tabs)/chat")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 8,
  },
  wordmarkImg: { width: 92, height: 26, tintColor: palette.text },
  pad: { paddingHorizontal: SCREEN_PAD, marginTop: 16 },
  center: { alignItems: "center", paddingTop: 8 },
  centerRow: { alignItems: "center" },
  stateBlock: { alignItems: "center", gap: 6, paddingHorizontal: SCREEN_PAD + 4, marginTop: 8 },
  stateLabel: { textAlign: "center", marginTop: 2 },
  lastRead: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, textAlign: "center" },
  tip: {
    alignSelf: "stretch",
    padding: 16,
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  tipPressed: { backgroundColor: palette.raised },
  tipHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tipText: { fontFamily: fonts.semi, fontSize: 18, lineHeight: 25, letterSpacing: -0.2, color: palette.textHi },
  tipWhy: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid },
  stateCue: { textAlign: "center", fontSize: 17, lineHeight: 24, color: palette.textMid },
  whyBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, marginTop: 4 },
  whyText: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  panelHead: { marginBottom: 18, gap: 4 },
  panelState: { fontFamily: fonts.semi, fontSize: 19, letterSpacing: -0.3, color: palette.textHi },
  panelCue: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: palette.textMid },
  groupLabel: { marginBottom: 4 },
  factor: { paddingVertical: 12, gap: 2 },
  factorRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.borderStrong },
  factorHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  factorLabel: { fontFamily: fonts.medium, fontSize: 15, color: palette.textHi, flexShrink: 1 },
  factorValue: { fontFamily: fonts.semi, fontSize: 16, color: palette.textHi, fontVariant: ["tabular-nums"], flexShrink: 1, textAlign: "right" },
  factorNote: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, color: palette.textLow },
  readinessRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  gaugeWrap: { width: 104, height: 88, overflow: "hidden" },
  readinessText: { flex: 1, gap: 4 },
  readinessTitle: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi },
  readinessSub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, fontVariant: ["tabular-nums"] },
  barsHint: { fontFamily: fonts.regular, fontSize: 12.5, color: palette.textLow, marginTop: 10 },
  lockedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginTop: 4 },
  lockedLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  lockedPlus: { fontFamily: fonts.medium, fontSize: 13, color: palette.gold },
});
