import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { FrameOrb } from "@/components/FrameOrb";
import { CompetitionBanner } from "@/components/CompetitionBanner";
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
  if (active.length >= 3)
    return { state: "Stable", source: "active model" };

  return { state: "Dormant", source: "no data yet" };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();

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

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>FRAME</Text>
        <Pressable
          onPress={() => router.push("/(tabs)/profile")}
          style={styles.profileBtn}
          hitSlop={12}
        >
          <Feather name="user" size={20} color="#666" />
        </Pressable>
      </View>

      <CompetitionBanner />

      {/* Orb + state */}
      <View style={styles.center}>
        <FrameOrb state={state} size={200} />

        <Text style={styles.stateLabel}>{state.toUpperCase()}</Text>
        <Text style={styles.stateSource}>via {source}</Text>
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
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 16,
    letterSpacing: 8,
    color: "#e0e0e0",
  },
  profileBtn: {
    padding: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  stateLabel: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    letterSpacing: 6,
    color: "#C9883A",
  },
  stateSource: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#444",
    letterSpacing: 0.5,
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
