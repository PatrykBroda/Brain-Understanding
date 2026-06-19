import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useFighter } from "@/context/FighterContext";
import { apiGet } from "@/lib/api";

interface Fact {
  id: number;
  category: string;
  content: string;
  confidence: number;
  status: string;
  source: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  strength: "STRENGTHS",
  weakness: "WEAKNESSES",
  technical_knowledge: "TECHNICAL KNOWLEDGE",
  pattern: "RECURRING PATTERNS",
  preference: "COACHING PREFERENCES",
  goal: "ACTIVE GOALS",
  event: "RECENT EVENTS",
  context: "LIFE CONTEXT",
};

const CATEGORY_ORDER = [
  "weakness",
  "strength",
  "goal",
  "technical_knowledge",
  "pattern",
  "preference",
  "event",
  "context",
];

function ConfidenceDots({ n }: { n: number }) {
  return (
    <View style={cd.row}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[cd.dot, i <= n ? cd.active : cd.inactive]} />
      ))}
    </View>
  );
}
const cd = StyleSheet.create({
  row: { flexDirection: "row", gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  active: { backgroundColor: "#C9883A" },
  inactive: { backgroundColor: "#1a1a1a" },
});

export default function ProfileScreen() {
  const { signOut, isSignedIn } = useAuth();
  const { fighter, isLoading: fighterLoading, refetch } = useFighter();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const {
    data: facts = [],
    isLoading: factsLoading,
    refetch: refetchFacts,
  } = useQuery<Fact[]>({
    queryKey: ["memory"],
    queryFn: () =>
      apiGet<{ facts: Fact[]; count: number }>("/memory").then((r) => r.facts ?? []),
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });

  const activeFacts = (facts as Fact[]).filter((f) => f.status === "active");

  const grouped = CATEGORY_ORDER.reduce<Record<string, Fact[]>>((acc, cat) => {
    const items = activeFacts.filter((f) => f.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const isLoading = fighterLoading || factsLoading;

  function handleRefresh() {
    refetch();
    refetchFacts();
  }

  async function handleSignOut() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await signOut();
    router.replace("/sign-in");
  }

  if (isLoading && !fighter) {
    return (
      <View style={[styles.loadingRoot, { paddingTop: topPad }]}>
        <ActivityIndicator color="#C9883A" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { paddingTop: topPad }]}
      contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + bottomPad + 100 }]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
          tintColor="#C9883A"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PROFILE</Text>
        <Pressable onPress={() => router.push("/analyse")} hitSlop={12}>
          <Feather name="film" size={20} color="#666" />
        </Pressable>
      </View>

      {/* Fighter info */}
      {fighter ? (
        <View style={styles.card}>
          <Text style={styles.fighterName}>{fighter.name}</Text>
          <View style={styles.metaRow}>
            {fighter.primarySport && (
              <Text style={styles.metaTag}>{fighter.primarySport.toUpperCase()}</Text>
            )}
            {fighter.level && (
              <Text style={styles.metaTag}>{fighter.level.toUpperCase()}</Text>
            )}
            {fighter.age != null && (
              <Text style={styles.metaTag}>{fighter.age} YRS</Text>
            )}
          </View>
          {fighter.gym && <Text style={styles.gym}>{fighter.gym}</Text>}

          {fighter.archetype && (
            <View style={styles.archetypeRow}>
              <View style={styles.archetypeDot} />
              <Text style={styles.archetypeText}>{fighter.archetype.toUpperCase()}</Text>
            </View>
          )}

          {fighter.goals && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>GOALS</Text>
              <Text style={styles.infoValue}>{fighter.goals}</Text>
            </View>
          )}

          {fighter.weaknesses && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>ACKNOWLEDGED WEAKNESSES</Text>
              <Text style={styles.infoValue}>{fighter.weaknesses}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No fighter profile yet.</Text>
        </View>
      )}

      {/* Competition mode */}
      <Pressable
        style={({ pressed }) => [styles.linkRow, pressed && { borderColor: "#C9883A" }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/competition");
        }}
      >
        <View style={styles.linkLeft}>
          <Feather name="target" size={16} color="#C9883A" />
          <Text style={styles.linkLabel}>COMPETITION MODE</Text>
        </View>
        <Feather name="chevron-right" size={16} color="#666" />
      </Pressable>

      {/* Athlete model */}
      <Text style={styles.sectionHeader}>ATHLETE MODEL</Text>

      {Object.keys(grouped).length === 0 && (
        <View style={styles.card}>
          <Text style={styles.emptyText}>
            Your model builds through conversation. Start training with FRAME.
          </Text>
        </View>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <View key={cat} style={styles.factGroup}>
          <Text style={styles.catLabel}>{CATEGORY_LABELS[cat] ?? cat.toUpperCase()}</Text>
          {items.map((f) => (
            <View key={f.id} style={styles.factRow}>
              <Text style={styles.factContent}>{f.content}</Text>
              <View style={styles.factMeta}>
                <ConfidenceDots n={f.confidence} />
              </View>
            </View>
          ))}
        </View>
      ))}

      {/* Sign out */}
      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
        onPress={handleSignOut}
      >
        <Text style={styles.signOutText}>SIGN OUT</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
  },
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },
  inner: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 5,
    color: "#e0e0e0",
  },
  card: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    padding: 20,
    marginBottom: 16,
  },
  fighterName: {
    fontFamily: "Outfit",
    fontSize: 22,
    fontWeight: "600",
    color: "#e0e0e0",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  metaTag: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#666",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gym: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#444",
    marginBottom: 8,
  },
  archetypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    marginTop: 4,
  },
  archetypeDot: {
    width: 6,
    height: 6,
    backgroundColor: "#C9883A",
  },
  archetypeText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#C9883A",
  },
  infoBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  infoLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#444",
    marginBottom: 6,
  },
  infoValue: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#999",
    lineHeight: 20,
  },
  sectionHeader: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 4,
    color: "#444",
    marginBottom: 12,
    marginTop: 4,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 24,
  },
  linkLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  linkLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#e0e0e0",
  },
  factGroup: {
    marginBottom: 16,
  },
  catLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#C9883A",
    marginBottom: 8,
  },
  factRow: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    padding: 12,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  factContent: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 20,
  },
  factMeta: {
    paddingTop: 2,
  },
  emptyText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#444",
    lineHeight: 22,
  },
  signOutBtn: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  signOutText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 4,
    color: "#444",
  },
});
