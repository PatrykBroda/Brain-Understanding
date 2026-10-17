import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { OrbGL } from "@/components/OrbGL";
import { Body, Button, Display, Punch, Eyebrow, FadeIn, GlassCard, IconButton, ArcGauge, Screen, media } from "@/components/ui";
import { fonts, palette } from "@/constants/theme";
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
// honestly-derived state as the orb label, never generated, never a metric.
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

export default function StateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { fighter } = useFighter();

  const { data: rawFacts } = useQuery<Fact[]>({
    queryKey: ["facts"],
    queryFn: () =>
      apiGet<{ facts: Fact[]; count: number }>("/memory").then((r) => {
        const f = r?.facts;
        return Array.isArray(f) ? f : [];
      }),
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });

  const facts: Fact[] = Array.isArray(rawFacts) ? rawFacts : [];
  const { state, source } = useMemo(() => deriveState(facts), [facts]);

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
  const latest =
    analysesQuery.data?.find((a) => !a.locked && a.sessionScore != null) ?? null;
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
  const chatModifier = useMemo(
    () => readinessModifier(conversationQuery.data ?? []),
    [conversationQuery.data],
  );

  const baseReadiness = checkinScore ?? sessionScore;
  const readiness = applyReadinessModifier(baseReadiness, chatModifier);
  const readinessSource = checkinScore != null ? "today" : "last session";

  // Doorway label mirrors the prototype: "Continue" only when a real prior
  // session exists, else "Enter". Reuses the conversation query already fetched
  // for the readiness modifier.
  const hasSession = (conversationQuery.data?.length ?? 0) > 0;

  // Size the orb to fit the available vertical space rather than just the
  // screen width. The center view holds the orb + ~190px of text/gaps below it;
  // measuring its actual height prevents the footer from overlapping on short
  // devices (iPhone SE) or when the state text wraps to a second line.
  const { width } = useWindowDimensions();
  const [centerHeight, setCenterHeight] = useState(0);
  const TEXT_AND_GAPS = 150; // stateCaption + stateLabel + stateCue + gaps (readinessRow now lives outside center)
  const orbSize =
    centerHeight > 0
      ? Math.round(Math.min(width * 0.9, centerHeight - TEXT_AND_GAPS, 380))
      : Math.round(Math.min(width * 0.75, 300)); // safe fallback before first layout

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <Screen>
      <View style={[styles.root, { paddingTop: topPad }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image
              source={require("../../assets/images/frame-logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <View>
              <Image
                source={require("../../assets/images/frame-wordmark.png")}
                style={styles.wordmarkImg}
                resizeMode="contain"
              />
              <Eyebrow style={styles.subline}>State · calibration system</Eyebrow>
            </View>
          </View>
          <IconButton
            icon="shield"
            label="Open profile"
            onPress={() => router.push("/(tabs)/profile")}
          />
        </View>

        {/* Orb */}
        <View style={styles.center} onLayout={(e) => setCenterHeight(e.nativeEvent.layout.height)}>
          <OrbGL state={state} size={orbSize} />

          <FadeIn style={styles.stateBlock}>
            <Eyebrow style={{ color: palette.goldLight }}>State</Eyebrow>
            <Punch style={styles.stateLabel}>
              {state}
            </Punch>
            <Body small style={styles.stateCue}>
              {STATE_CUE[state]}
            </Body>
          </FadeIn>
        </View>

        {/* Fight readiness — glass dial card between the orb block and the CTA */}
        <FadeIn index={1} style={styles.readinessMiddle}>
          <Pressable
            hitSlop={8}
            onPress={() => router.push("/(tabs)/home")}
            accessibilityLabel={readiness != null ? "View readiness detail" : "Open home"}
            style={styles.readinessPress}
          >
            <GlassCard radius={28} padding={16} tone="gold">
              <View style={styles.readinessRow}>
                {readiness != null ? (
                  <View style={styles.gaugeWrap}>
                    <ArcGauge value={readiness} size={116} label="" />
                  </View>
                ) : null}
                <View style={styles.readinessText}>
                  <Eyebrow>Fight readiness</Eyebrow>
                  {readiness != null ? (
                    <Text style={styles.readinessUnit}>
                      {readiness} / 100 · {readinessSource}
                    </Text>
                  ) : (
                    <View style={styles.readinessCta}>
                      <Text style={styles.readinessCtaText}>Open training dashboard</Text>
                      <Feather name="chevron-right" size={14} color={palette.goldLight} />
                    </View>
                  )}
                </View>
              </View>
            </GlassCard>
          </Pressable>
        </FadeIn>

        {/* Enter CTA */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }]}>
          <Button
            title={hasSession ? "Continue" : "Enter"}
            onPress={() => router.push("/(tabs)/chat")}
            style={styles.enterBtn}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 34, height: 34, opacity: 0.9 },
  wordmarkImg: { width: 92, height: 26, tintColor: palette.text },
  subline: { marginTop: 4, fontSize: 12.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  stateBlock: { alignItems: "center", gap: 2 },
  stateLabel: { textAlign: "center", fontSize: 76, lineHeight: 74 },
  stateCue: { textAlign: "center", paddingHorizontal: 32, marginTop: 4 },
  readinessMiddle: { paddingHorizontal: 24, paddingVertical: 8 },
  readinessPress: { alignSelf: "stretch" },
  readinessRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  gaugeWrap: { width: 116, height: 100, overflow: "hidden" },
  readinessText: { flex: 1, gap: 8 },
  readinessValue: { fontFamily: fonts.numeral, fontSize: 30, color: palette.goldPale, letterSpacing: -1 },
  readinessUnit: { fontFamily: fonts.textMedium, fontSize: 15, color: palette.goldPale },
  readinessCta: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  readinessCtaText: { fontFamily: fonts.textMedium, fontSize: 14, color: palette.goldLight },
  footer: { alignItems: "center", paddingTop: 12 },
  enterBtn: { minWidth: 220 },
});
