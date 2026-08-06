import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { apiGet } from "@/lib/api";
import { ProfileEditModal } from "@/components/ProfileEditModal";

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
  const { signOut, isSignedIn, email } = useAuth();
  const { fighter, isLoading: fighterLoading, refetch } = useFighter();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [editVisible, setEditVisible] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const {
    data: rawFacts,
    isLoading: factsLoading,
    refetch: refetchFacts,
  } = useQuery<Fact[]>({
    queryKey: ["memory"],
    queryFn: () =>
      apiGet<{ facts: Fact[]; count: number }>("/memory").then((r) => {
        const f = r?.facts;
        return Array.isArray(f) ? f : [];
      }),
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });

  const facts: Fact[] = Array.isArray(rawFacts) ? rawFacts : [];
  const activeFacts = facts.filter((f) => f.status === "active");

  const grouped = CATEGORY_ORDER.reduce<Record<string, Fact[]>>((acc, cat) => {
    const items = activeFacts.filter((f) => f.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const isLoading = fighterLoading || factsLoading;

  function handleRefresh() {
    refetch();
    refetchFacts();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/sign-in");
  }

  if (isLoading && !fighter) {
    return (
      <View style={[s.root, { paddingTop: topPad }]}>
        <ActivityIndicator color="#C9883A" style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: topPad + 16, paddingBottom: bottomPad + 32 }]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
          tintColor="#C9883A"
        />
      }
    >
      {/* IDENTITY */}
      {fighter && (
        <View style={s.section}>
          <View style={s.identityRow}>
            <Text style={s.name}>{fighter.name}</Text>
            <Pressable onPress={() => setEditVisible(true)} hitSlop={12}>
              <Feather name="edit-2" size={16} color="#666" />
            </Pressable>
          </View>
          {fighter.primarySport ? (
            <Text style={s.sport}>
              {fighter.primarySport.toUpperCase()} · {fighter.level?.toUpperCase()}
              {fighter.age ? ` · ${fighter.age}` : ""}
            </Text>
          ) : null}
          {fighter.archetype ? (
            <Text style={s.archetype}>{fighter.archetype.toUpperCase()}</Text>
          ) : null}
          {fighter.gym ? <Text style={s.sub}>{fighter.gym}</Text> : null}
        </View>
      )}

      {/* COMPETITION MODE */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>COMPETITION MODE</Text>
        <Pressable
          style={({ pressed }) => [s.navBtn, pressed && s.pressed]}
          onPress={() => router.push("/(tabs)/planner")}
        >
          <Feather name="target" size={14} color="#C9883A" style={{ marginRight: 8 }} />
          <Text style={s.navBtnText}>OPEN CAMP</Text>
          <Feather name="chevron-right" size={14} color="#444" style={{ marginLeft: "auto" }} />
        </Pressable>
      </View>

      {/* ATHLETE MODEL */}
      {Object.keys(grouped).length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>ATHLETE MODEL</Text>
          {CATEGORY_ORDER.filter((cat) => grouped[cat]).map((cat) => (
            <View key={cat} style={s.catBlock}>
              <Text style={s.catLabel}>{CATEGORY_LABELS[cat]}</Text>
              {grouped[cat]!.map((fact) => (
                <View key={fact.id} style={s.factRow}>
                  <ConfidenceDots n={fact.confidence} />
                  <Text style={s.factText}>{fact.content}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* ACCOUNT */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        {email ? <Text style={s.emailText}>{email}</Text> : null}
        <Pressable
          style={({ pressed }) => [s.signOutBtn, pressed && s.pressed]}
          onPress={handleSignOut}
        >
          <Feather name="log-out" size={14} color="#666" style={{ marginRight: 6 }} />
          <Text style={s.signOutText}>SIGN OUT</Text>
        </Pressable>
      </View>

      {fighter && (
        <ProfileEditModal
          visible={editVisible}
          fighter={fighter}
          onClose={() => setEditVisible(false)}
        />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  content: { paddingHorizontal: 20 },
  section: { marginBottom: 32 },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  name: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 26,
    color: "#e0e0e0",
    letterSpacing: 0.5,
  },
  sport: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#C9883A",
    letterSpacing: 3,
    marginBottom: 2,
  },
  sub: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#666",
  },
  sectionLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: "#444",
    letterSpacing: 3,
    marginBottom: 12,
  },
  catBlock: { marginBottom: 16 },
  catLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    color: "#555",
    letterSpacing: 2,
    marginBottom: 6,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  factText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#aaa",
    flex: 1,
    lineHeight: 18,
  },
  emailText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.7 },
  signOutText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#666",
    letterSpacing: 3,
  },
  archetype: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    color: "#555",
    letterSpacing: 2,
    marginTop: 2,
    marginBottom: 2,
  },
  navBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  navBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#C9883A",
    letterSpacing: 3,
  },
});
