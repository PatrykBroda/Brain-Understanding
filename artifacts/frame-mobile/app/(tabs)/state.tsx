import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { StateOrb } from "@/components/StateOrb";
import {
  ArcGauge,
  Body,
  Button,
  EmptyState,
  Eyebrow,
  FadeIn,
  GlassCard,
  Label,
  Punch,
  Screen,
  useReducedMotion,
} from "@/components/ui";
import { fonts, motion, palette, SCREEN_PAD } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { useTodayCheckin } from "@/hooks/useCheckin";
import { apiGet } from "@/lib/api";
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

type OrbState =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

// One coaching cue per interpretive state. Deterministic — keyed to the same
// honestly-derived state as the label, never generated, never a metric.
const STATE_CUE: Record<OrbState, string> = {
  Dormant: "Step in. The frame reads what you feed it.",
  Stable: "Narrow the decision tree.",
  Loaded: "Trade speed for position.",
  Recovering: "Protect the rebuild.",
  Tight: "Commit earlier than comfort wants.",
  Volatile: "Anchor the breath before the exchange.",
  Composed: "Hold the standard. Add pressure, not pace.",
  Overextended: "Cut volume. Keep structure.",
};

function deriveState(facts: Fact[]): { state: OrbState; source: string } {
  const active = facts.filter((f) => f.status === "active");
  const content = active.map((f) => f.content.toLowerCase()).join(" ");

  if (/volatile|fragmented|breaking|panic|collapse/.test(content))
    return { state: "Volatile", source: "recent fragmentation pattern" };
  if (/overextended|overreaching|beyond capacity/.test(content))
    return { state: "Overextended", source: "load pattern" };
  if (/tight|tense|clenched|rigid/.test(content))
    return { state: "Tight", source: "tension marker" };
  if (/recovering|injury|rest|fatigue|tired/.test(content))
    return { state: "Recovering", source: "recovery note" };
  if (/composed|calm|centered|controlled/.test(content))
    return { state: "Composed", source: "composure pattern" };
  if (/loaded|high.*volume|intense|heavy/.test(content))
    return { state: "Loaded", source: "training load" };
  if (active.length >= 3) return { state: "Stable", source: "active model" };

  return { state: "Dormant", source: "no data yet" };
}

interface AnalysisListItem {
  id: number;
  sessionScore: number | null;
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
  const { state, source } = useMemo(() => deriveState(facts), [facts]);
  const activeCount = facts.filter((f) => f.status === "active").length;

  // Readiness priority mirrors the Home dashboard: today's self-reported
  // check-in composite first, else the last analysed session's score.
  const checkinQuery = useTodayCheckin();
  const checkin = checkinQuery.data?.checkin ?? null;
  const checkinScore = checkin
    ? Math.round((checkin.sleep + checkin.energy + checkin.soreness + checkin.stress) / 4)
    : null;

  const analysesQuery = useQuery<AnalysisListItem[]>({
    queryKey: ["analyses"],
    queryFn: () =>
      apiGet<{ analyses: AnalysisListItem[] }>("/analysis").then((r) =>
        Array.isArray(r?.analyses) ? r.analyses : [],
      ),
    enabled: !!fighter,
    staleTime: 60_000,
  });
  const latest = analysesQuery.data?.find((a) => !a.locked && a.sessionScore != null) ?? null;
  const sessionScore = latest?.sessionScore != null ? Math.round(latest.sessionScore) : null;

  // Recent chat drives a small ±10 modifier on top of the base readiness. It
  // reuses the same conversation the chat tab reads, so no new data flow.
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

  const baseReadiness = checkinScore ?? sessionScore;
  const readiness = applyReadinessModifier(baseReadiness, chatModifier);
  const readinessSource = checkinScore != null ? "today's check-in" : "your last session";

  const hasSession = chatMessages.length > 0;

  const { width } = useWindowDimensions();
  const orbSize = Math.round(Math.min(width * 0.6, 260));
  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 96;

  const loading = factsQuery.isLoading;
  const failed = factsQuery.isError && !factsQuery.data;

  // Soreness / stress are stored as recovery quality; shown the natural way
  // (100 = most sore / most stressed), same as Home.
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
              onAction={() => void factsQuery.refetch()}
            />
          </View>
        ) : (
          <>
            {/* Orb + the state, understandable without the orb or any motion */}
            <View style={styles.center}>
              <StateOrb size={orbSize} stateLabel={state} expanded={expanded} onToggle={() => setExpanded((e) => !e)} />

              <FadeIn style={styles.stateBlock}>
                <Eyebrow>Your state</Eyebrow>
                <Punch style={[styles.stateLabel, loading && { color: palette.textLow }]}>
                  {loading ? "Reading…" : state}
                </Punch>
                <Body style={styles.stateCue}>{loading ? "Checking your athlete model." : STATE_CUE[state]}</Body>
                {!loading && state === "Dormant" ? (
                  <Label style={styles.stateSource}>No athlete data yet. Chat with your coach to build your model.</Label>
                ) : null}
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
              </FadeIn>
            </View>

            <FactorsPanel open={expanded}>
              <View style={styles.pad}>
                <GlassCard raised padding={20}>
                  <View style={styles.panelHead}>
                    <Text style={styles.panelState}>{state}</Text>
                    <Text style={styles.panelCue}>{STATE_CUE[state]}</Text>
                  </View>

                  <Eyebrow style={styles.groupLabel}>Your state</Eyebrow>
                  <FactorRow
                    label="Athlete model"
                    value={activeCount > 0 ? `${activeCount} active ${activeCount === 1 ? "note" : "notes"}` : null}
                    note={
                      state === "Dormant"
                        ? activeCount > 0
                          ? "A state needs at least 3 notes or a clear pattern."
                          : undefined
                        : `Read from a ${source}.`
                    }
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
                  <FactorRow label="Last session score" value={fmt(sessionScore)} note={sessionScore != null ? "From your latest analysed session" : undefined} />
                  <FactorRow
                    label="Recent chat adjustment"
                    value={modifierValue}
                    note={modifierValue != null ? "Up to ±10, from what you told your coach" : undefined}
                    last
                  />
                </GlassCard>
              </View>
            </FactorsPanel>

            {/* Fight readiness */}
            <FadeIn index={1} style={styles.pad}>
              <Pressable
                onPress={() => router.push("/(tabs)/home")}
                accessibilityRole="button"
                accessibilityLabel={readiness != null ? `Fight readiness ${readiness} out of 100. Open home` : "Fight readiness: no data yet. Open home"}
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
                        <Text style={styles.readinessSub}>
                          {readiness} / 100 from {readinessSource}
                        </Text>
                      ) : (
                        <Text style={styles.readinessSub}>No data yet. Log a check-in on Home.</Text>
                      )}
                    </View>
                    <Feather name="chevron-right" size={18} color={palette.textLow} />
                  </View>
                </GlassCard>
              </Pressable>
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
  stateBlock: { alignItems: "center", gap: 6, paddingHorizontal: SCREEN_PAD + 4, marginTop: 8 },
  stateLabel: { textAlign: "center", marginTop: 2 },
  stateCue: { textAlign: "center", fontSize: 17, lineHeight: 24, color: palette.textMid },
  stateSource: { textAlign: "center", color: palette.textLow },
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
  factorValue: { fontFamily: fonts.semi, fontSize: 16, color: palette.textHi, fontVariant: ["tabular-nums"] },
  factorNote: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, color: palette.textLow },
  readinessRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  gaugeWrap: { width: 104, height: 88, overflow: "hidden" },
  readinessText: { flex: 1, gap: 4 },
  readinessTitle: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi },
  readinessSub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, fontVariant: ["tabular-nums"] },
});
