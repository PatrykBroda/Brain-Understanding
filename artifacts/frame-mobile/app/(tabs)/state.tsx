import { useRouter } from "expo-router";
import React, { useMemo } from "react";
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

  // Orb sits a touch inside the screen edges so the lattice reads as contained,
  // not bleeding off-screen (capped so it stays sane on web/tablet).
  // Size from BOTH axes: width keeps it edge-contained, height keeps the orb +
  // caption stack from overflowing the centre box and colliding with the ENTER
  // button on shorter screens.
  const { width, height } = useWindowDimensions();
  const orbSize = Math.round(Math.min(width * 0.84, height * 0.34, 372));

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image
            source={require("../../assets/images/frame-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Image
            source={require("../../assets/images/frame-wordmark.png")}
            style={styles.wordmarkImg}
            resizeMode="contain"
          />
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/profile")}
          style={styles.profileBtn}
          hitSlop={12}
          accessibilityLabel="Open profile"
        >
          <Feather name="shield" size={18} color="#666" />
        </Pressable>
      </View>

      {/* Orb */}
      <View style={styles.center}>
        <OrbGL state={state} size={orbSize} />

        <Text style={styles.stateCaption}>STATE · CALIBRATION SYSTEM</Text>
        <Text style={styles.stateLabel}>{state.toUpperCase()}</Text>
        <Text style={styles.stateCue}>{STATE_CUE[state]}</Text>

        {/* Fight readiness */}
        <Pressable
          style={styles.readinessRow}
          hitSlop={8}
          onPress={() =>
            router.push(
              readiness != null && checkinScore != null
                ? "/(tabs)/home"
                : "/(tabs)/analyse",
            )
          }
          accessibilityLabel={
            readiness != null ? "View readiness detail" : "Analyse a session"
          }
        >
          <Text style={styles.readinessLabel}>FIGHT READINESS</Text>
          <View style={styles.readinessDivider} />
          {readiness != null ? (
            <Text style={styles.readinessValue}>
              {readiness}
              <Text style={styles.readinessUnit}> / 100 · {readinessSource}</Text>
            </Text>
          ) : (
            <View style={styles.readinessCta}>
              <Text style={styles.readinessCtaText}>Analyse a session</Text>
              <Feather name="chevron-right" size={12} color="#8A6A2F" />
            </View>
          )}
        </Pressable>
      </View>

      {/* Enter CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }]}>
        <Pressable
          style={({ pressed }) => [styles.enterBtn, pressed && styles.enterPressed]}
          onPress={() => router.push("/(tabs)/chat")}
        >
          <Text style={styles.enterText}>{hasSession ? "CONTINUE" : "ENTER"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 34,
    height: 34,
    opacity: 0.9,
  },
  wordmarkImg: {
    width: 92,
    height: 26,
    tintColor: "#e0e0e0",
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateCaption: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3.5,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
  stateLabel: {
    fontFamily: "SpaceMono",
    fontSize: 22,
    letterSpacing: 8,
    color: "#8A6A2F",
  },
  stateCue: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 16,
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingVertical: 6,
  },
  readinessLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 4,
    color: "#555",
  },
  readinessDivider: {
    width: 1,
    height: 12,
    backgroundColor: "#1a1a1a",
  },
  readinessValue: {
    fontFamily: "SpaceMono",
    fontSize: 16,
    color: "#8A6A2F",
  },
  readinessUnit: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#555",
  },
  readinessCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readinessCtaText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  enterBtn: {
    width: "100%",
    maxWidth: 360,
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.38)",
    backgroundColor: "rgba(138,106,47,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  enterPressed: {
    borderColor: "rgba(138,106,47,0.7)",
    backgroundColor: "rgba(138,106,47,0.1)",
  },
  enterText: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    letterSpacing: 6,
    color: "#c9a24b",
  },
});
