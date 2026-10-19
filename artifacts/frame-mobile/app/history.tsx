import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api";
import { useEntitlement } from "@/hooks/useEntitlement";
import { CATEGORY_LABELS, type ModelFact } from "@/lib/athleteModel";
import { bucketByDay, observationPrompt } from "@/lib/factHistory";
import { Body, Button, Display, EmptyState, FadeIn, GlassCard, IconButton, Label, Screen } from "@/components/ui";
import { FactConfidence } from "@/components/FactConfidence";
import { fonts, MIN_TAP, palette, SCREEN_PAD } from "@/constants/theme";


export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const activeFacts = useMemo(
    () => (Array.isArray(rawFacts) ? rawFacts : []).filter((f) => f.status === "active"),
    [rawFacts],
  );
  const buckets = useMemo(() => bucketByDay(activeFacts), [activeFacts]);

  return (
    <Screen light={null}>
      <View style={[s.root, { paddingTop: topPad }]}>
        <View style={s.header}>
          <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Display size="title">History</Display>
            <Body small style={{ marginTop: 2 }}>
              When FRAME last saw each observation, newest first.
            </Body>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: bottomPad, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {!isFramePlus ? (
            <FadeIn index={0}>
              <GlassCard padding={24}>
                <View style={s.lockCol}>
                  <View style={s.lockDisc}>
                    <Feather name="lock" size={18} color={palette.textMid} />
                  </View>
                  <Text style={s.lockTitle}>Full timeline is part of FRAME+</Text>
                  <Text style={s.bodyCopy}>
                    {activeFacts.length === 0
                      ? "FRAME records durable observations as you train and talk. The full timeline is a FRAME+ feature."
                      : `FRAME holds ${activeFacts.length} recorded observation${activeFacts.length === 1 ? "" : "s"} on you. The full timeline is a FRAME+ feature.`}
                  </Text>
                  <Button title="Unlock FRAME+" onPress={() => router.push("/paywall")} style={{ alignSelf: "stretch", marginTop: 8 }} />
                </View>
              </GlassCard>
            </FadeIn>
          ) : isLoading ? (
            <EmptyState kind="loading" title="Loading history" />
          ) : isError && !rawFacts ? (
            <EmptyState
              kind="error"
              title="Couldn't load history"
              body="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void refetch()}
            />
          ) : activeFacts.length === 0 ? (
            <FadeIn index={0}>
              <EmptyState
                kind="empty"
                icon="clock"
                title="No observations yet"
                body="As you talk to the coach, FRAME records durable observations and they will appear here, newest first."
                actionLabel="Talk to your coach"
                onAction={() => router.push("/(tabs)/chat")}
              />
            </FadeIn>
          ) : (
            <FadeIn index={0}>
              <View style={{ gap: 24 }}>
                {buckets.map((bucket) => (
                  <View key={bucket.key} style={{ gap: 8 }}>
                    <View style={s.dayHeadRow}>
                      <Label>{bucket.label}</Label>
                      <Text style={s.dayHeadCount}>{bucket.facts.length}</Text>
                    </View>
                    <GlassCard padding={0}>
                      {bucket.facts.map((f, i) => (
                        <Pressable
                          key={f.id}
                          onPress={() =>
                            router.push({
                              pathname: "/(tabs)/chat",
                              params: { prefill: observationPrompt(f, CATEGORY_LABELS[f.category] ?? f.category), n: String(Date.now()) },
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`${CATEGORY_LABELS[f.category] ?? f.category}: ${f.topic || f.content}, ${bucket.label}. Discuss this with your coach`}
                          style={({ pressed }) => [s.factItem, i > 0 && s.rule, pressed && { backgroundColor: palette.raised }]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={s.factCat}>{CATEGORY_LABELS[f.category] ?? f.category}</Text>
                            <Text style={s.factText}>{f.topic || f.content}</Text>
                          </View>
                          <View style={s.factMeta}>
                            {(f.evidenceCount ?? 1) > 1 && <Text style={s.factEvidence}>×{f.evidenceCount}</Text>}
                            <FactConfidence value={f.confidence} />
                          </View>
                          <Feather name="chevron-right" size={16} color={palette.textLow} />
                        </Pressable>
                      ))}
                    </GlassCard>
                  </View>
                ))}
              </View>
            </FadeIn>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: SCREEN_PAD, paddingBottom: 16, paddingTop: 8 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  lockCol: { alignItems: "center", gap: 10 },
  lockDisc: {
    width: MIN_TAP,
    height: MIN_TAP,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
  },
  lockTitle: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi, textAlign: "center" },
  bodyCopy: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, textAlign: "center" },
  dayHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayHeadCount: { fontFamily: fonts.medium, fontSize: 13, color: palette.textLow, fontVariant: ["tabular-nums"] },
  factItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  factCat: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid, marginBottom: 2 },
  factText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: palette.textHi },
  factMeta: { alignItems: "flex-end", gap: 6 },
  factEvidence: { fontFamily: fonts.medium, fontSize: 12, color: palette.textMid, fontVariant: ["tabular-nums"] },
});
