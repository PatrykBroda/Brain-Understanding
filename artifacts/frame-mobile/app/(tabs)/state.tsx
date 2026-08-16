import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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

  const readiness = checkinScore ?? sessionScore;
  const readinessSource = checkinScore != null ? "today" : "last session";

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
          <View>
            <Text style={styles.wordmark}>FRAME</Text>
            <Text style={styles.subline}>
              {(fighter?.primarySport ?? "COMBAT").toUpperCase()} · CALIBRATION SYSTEM
            </Text>
          </View>
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
        <OrbGL state={state} size={280} />

        <Text style={styles.stateCaption}>STATE</Text>
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
              <Feather name="chevron-right" size={12} color="#C9883A" />
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
          <Text style={styles.enterText}>ENTER</Text>
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
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 15,
    letterSpacing: 8,
    color: "#e0e0e0",
  },
  subline: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 4,
    color: "#555",
    marginTop: 4,
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
    gap: 16,
  },
  stateCaption: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 6,
    color: "#666",
    marginTop: 8,
  },
  stateLabel: {
    fontFamily: "SpaceMono",
    fontSize: 22,
    letterSpacing: 8,
    color: "#C9883A",
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
    color: "#C9883A",
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
    color: "#C9883A",
  },
  footer: {
    alignItems: "center",
    paddingBottom: 32,
  },
  enterBtn: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e0e0e0",
    paddingHorizontal: 48,
    paddingVertical: 14,
  },
  enterPressed: {
    borderColor: "#C9883A",
  },
  enterText: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    letterSpacing: 6,
    color: "#e0e0e0",
  },
});
