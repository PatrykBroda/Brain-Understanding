import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api";
import { useEntitlement } from "@/hooks/useEntitlement";
import { CATEGORY_LABELS, factSeenLabel, type ModelFact } from "@/lib/athleteModel";
import { bucketByDay, observationPrompt } from "@/lib/factHistory";
import { refreshModel } from "@/lib/modelRefresh";
import { FactConfidence } from "@/components/FactConfidence";

const ACCENT = "#8A6A2F";

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { isSignedIn } = useAuth();
  const { data: entitlement } = useEntitlement();
  const isFramePlus = entitlement?.plan === "frame_plus";

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 24;

  const {
    data: rawFacts,
    isLoading,
    isError,
    refetch,
  } = useQuery<ModelFact[]>({
    queryKey: ["memory"],
    queryFn: () =>
      apiGet<{ facts: ModelFact[]; count: number }>("/memory").then((r) => {
        const f = r?.facts;
        return Array.isArray(f) ? f : [];
      }),
    enabled: !!isSignedIn,
    staleTime: 0,
  });

  // Always show what the model holds now: refetch on focus and when the app returns to the foreground.
  useFocusEffect(
    useCallback(() => {
      if (isSignedIn) refreshModel(qc);
    }, [isSignedIn, qc]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isSignedIn) refreshModel(qc);
    });
    return () => sub.remove();
  }, [isSignedIn, qc]);

  const activeFacts = useMemo(
    () => (Array.isArray(rawFacts) ? rawFacts : []).filter((f) => f.status === "active"),
    [rawFacts],
  );
  const buckets = useMemo(() => bucketByDay(activeFacts), [activeFacts]);

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Feather name="arrow-left" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <View>
          <Text style={s.headerOverline}>FULL MODEL</Text>
          <Text style={s.headerTitle}>OBSERVATION HISTORY</Text>
          <Text style={s.headerSub}>BY LAST SEEN · NEWEST FIRST</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {!isFramePlus ? (
          <Pressable style={s.panel} onPress={() => router.push("/paywall")}>
            <View style={s.panelPad}>
              <Feather name="lock" size={16} color={ACCENT} style={{ marginBottom: 12 }} />
              <Text style={s.bodyCopy}>
                {activeFacts.length === 0
                  ? "FRAME records durable observations as you train and talk. The full timeline is a FRAME+ feature."
                  : `FRAME holds ${activeFacts.length} recorded observation${activeFacts.length === 1 ? "" : "s"} on you. The full timeline is a FRAME+ feature.`}
              </Text>
              <Text style={s.unlockLink}>UNLOCK FRAME+ →</Text>
            </View>
          </Pressable>
        ) : isLoading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={ACCENT} size="small" />
          </View>
        ) : isError && !rawFacts ? (
          <View style={[s.panel, s.panelPad]}>
            <Text style={s.bodyCopy}>Couldn't load history. Check your connection and try again.</Text>
            <Pressable onPress={() => void refetch()} hitSlop={8}>
              <Text style={s.unlockLink}>RETRY →</Text>
            </Pressable>
          </View>
        ) : activeFacts.length === 0 ? (
          <View style={[s.panel, s.panelPad]}>
            <Text style={s.bodyCopy}>
              No observations yet. As you talk to the coach, FRAME records durable observations and
              they'll appear here, newest first.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 28 }}>
            {buckets.map((bucket) => (
              <View key={bucket.key}>
                <View style={s.dayHeadRow}>
                  <Text style={s.dayHeadLabel}>{bucket.label.toUpperCase()}</Text>
                  <View style={s.dayHeadLine} />
                  <Text style={s.dayHeadCount}>{bucket.facts.length}</Text>
                </View>
                <View style={{ gap: 6 }}>
                  {bucket.facts.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() =>
                        router.push({
                          pathname: "/(tabs)/chat",
                          params: { prefill: observationPrompt(f, CATEGORY_LABELS[f.category] ?? f.category), n: String(Date.now()) },
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${CATEGORY_LABELS[f.category] ?? f.category}: ${f.topic || f.content}, ${factSeenLabel(f)}. Discuss this with your coach`}
                      style={({ pressed }) => [s.factItem, pressed && { opacity: 0.7 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.factCat}>
                          {(CATEGORY_LABELS[f.category] ?? f.category).toUpperCase()}
                        </Text>
                        <Text style={s.factText} numberOfLines={3}>
                          {(f.topic || f.content).toUpperCase()}
                        </Text>
                        <Text style={s.factSeen}>{factSeenLabel(f).toUpperCase()}</Text>
                      </View>
                      <View style={s.factMeta}>
                        {(f.evidenceCount ?? 1) > 1 && (
                          <Text style={s.factEvidence}>×{f.evidenceCount}</Text>
                        )}
                        <FactConfidence value={f.confidence} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  headerOverline: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 5,
    color: "rgba(255,255,255,0.45)",
    marginBottom: 6,
  },
  headerSub: { fontFamily: "SpaceMono", fontSize: 8, letterSpacing: 3, color: "rgba(255,255,255,0.35)", marginTop: 5 },
  headerTitle: {
    fontFamily: "Outfit",
    fontSize: 18,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.9)",
  },

  panel: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.018)",
    overflow: "hidden",
  },
  panelPad: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  bodyCopy: {
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 20,
    color: "rgba(255,255,255,0.5)",
  },
  unlockLink: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: ACCENT,
    marginTop: 16,
  },

  loadingWrap: { paddingVertical: 48, alignItems: "center" },

  dayHeadRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  dayHeadLabel: { fontFamily: "Outfit", fontSize: 13, letterSpacing: 3, color: "rgba(138,106,47,0.9)" },
  dayHeadLine: { flex: 1, height: 1, backgroundColor: "rgba(138,106,47,0.22)" },
  dayHeadCount: { fontFamily: "SpaceMono", fontSize: 9, color: "rgba(255,255,255,0.4)" },

  factItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingLeft: 14,
    paddingVertical: 6,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(138,106,47,0.25)",
  },
  factCat: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "rgba(138,106,47,0.7)",
    marginBottom: 3,
  },
  factText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    lineHeight: 15,
    color: "rgba(255,255,255,0.75)",
  },
  factSeen: { fontFamily: "SpaceMono", fontSize: 8, letterSpacing: 2, color: "rgba(138,106,47,0.7)", marginTop: 4 },
  factMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  factEvidence: { fontFamily: "SpaceMono", fontSize: 9, color: "rgba(138,106,47,0.7)" },
});
