import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api";
import { useEntitlement } from "@/hooks/useEntitlement";
import { CATEGORY_LABELS, type ModelFact } from "@/lib/athleteModel";
import { Display, Eyebrow, FadeIn, GlassCard, IconButton, Screen } from "@/components/ui";
import { fonts, palette } from "@/constants/theme";


// ─── Confidence pips (fact 1–5) — mirrors profile.tsx FactConfidence ──────────
function FactConfidence({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <View style={cd.wrap}>
      <View style={cd.row}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[cd.pip, i <= v ? cd.active : cd.inactive]} />
        ))}
      </View>
      <Text style={cd.count}>{v}/5</Text>
    </View>
  );
}

type DayBucket = { key: string; label: string; facts: ModelFact[] };

/**
 * Chronological counterpart to the profile "FULL MODEL" section, which groups
 * observations by category. History buckets the same active observations by the
 * day FRAME first recorded them, newest day first — a timeline of when the model
 * learned each thing. FRAME+ gated, same as the full model breakdown.
 */
function bucketByDay(facts: ModelFact[]): DayBucket[] {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const oneDay = 24 * 60 * 60 * 1000;

  const byKey = new Map<string, { ts: number; label: string; facts: ModelFact[] }>();

  for (const f of facts) {
    const raw = f.createdAt ?? f.updatedAt;
    const d = raw ? new Date(raw) : null;
    const valid = d && !Number.isNaN(d.getTime()) ? d : null;
    const dayTs = valid ? startOfDay(valid) : 0;
    const key = valid ? String(dayTs) : "undated";

    let label: string;
    if (!valid) {
      label = "UNDATED";
    } else if (dayTs === today) {
      label = "TODAY";
    } else if (dayTs === today - oneDay) {
      label = "YESTERDAY";
    } else {
      label = valid
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        .toUpperCase();
    }

    const bucket = byKey.get(key);
    if (bucket) bucket.facts.push(f);
    else byKey.set(key, { ts: valid ? dayTs : -1, label, facts: [f] });
  }

  return Array.from(byKey.entries())
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([key, v]) => ({ key, label: v.label, facts: v.facts }));
}

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
  } = useQuery<ModelFact[]>({
    queryKey: ["memory"],
    queryFn: () =>
      apiGet<{ facts: ModelFact[]; count: number }>("/memory").then((r) => {
        const f = r?.facts;
        return Array.isArray(f) ? f : [];
      }),
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });

  const activeFacts = useMemo(
    () => (Array.isArray(rawFacts) ? rawFacts : []).filter((f) => f.status === "active"),
    [rawFacts],
  );
  const buckets = useMemo(() => bucketByDay(activeFacts), [activeFacts]);

  return (
    <Screen>
      <View style={[s.root, { paddingTop: topPad }]}>
        <View style={s.header}>
          <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Eyebrow style={{ color: palette.goldLight }}>FULL MODEL</Eyebrow>
            <Display size="heading" style={{ marginTop: 2 }}>
              OBSERVATION HISTORY
            </Display>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {!isFramePlus ? (
            <FadeIn index={0}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/paywall")}
              >
                <GlassCard tone="gold" radius={28} padding={24}>
                  <View style={s.lockDisc}>
                    <Feather name="lock" size={16} color={palette.goldPale} />
                  </View>
                  <Text style={s.bodyCopy}>
                    {activeFacts.length === 0
                      ? "FRAME records durable observations as you train and talk. The full timeline is a FRAME+ feature."
                      : `FRAME holds ${activeFacts.length} recorded observation${activeFacts.length === 1 ? "" : "s"} on you. The full timeline is a FRAME+ feature.`}
                  </Text>
                  <Text style={s.unlockLink}>UNLOCK FRAME+ →</Text>
                </GlassCard>
              </Pressable>
            </FadeIn>
          ) : isLoading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={palette.goldLight} size="small" />
            </View>
          ) : activeFacts.length === 0 ? (
            <FadeIn index={0}>
              <GlassCard radius={28} padding={24}>
                <Text style={s.bodyCopy}>
                  No observations yet. As you talk to the coach, FRAME records durable observations and
                  they'll appear here, newest first.
                </Text>
              </GlassCard>
            </FadeIn>
          ) : (
            <FadeIn index={0}>
              <View style={{ gap: 28 }}>
                {buckets.map((bucket) => (
                  <View key={bucket.key}>
                    <View style={s.dayHeadRow}>
                      <Text style={s.dayHeadLabel}>{bucket.label}</Text>
                      <View style={s.dayHeadLine} />
                      <Text style={s.dayHeadCount}>{bucket.facts.length}</Text>
                    </View>
                    <View style={{ gap: 10 }}>
                      {bucket.facts.map((f) => (
                        <GlassCard key={f.id} radius={20} padding={16}>
                          <View style={s.factItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.factCat}>
                                {(CATEGORY_LABELS[f.category] ?? f.category).toUpperCase()}
                              </Text>
                              <Text style={s.factText} numberOfLines={3}>
                                {f.topic || f.content}
                              </Text>
                            </View>
                            <View style={s.factMeta}>
                              {(f.evidenceCount ?? 1) > 1 && (
                                <Text style={s.factEvidence}>×{f.evidenceCount}</Text>
                              )}
                              <FactConfidence value={f.confidence} />
                            </View>
                          </View>
                        </GlassCard>
                      ))}
                    </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  lockDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
    marginBottom: 14,
  },
  bodyCopy: {
    fontFamily: fonts.text,
    fontSize: 14,
    lineHeight: 22,
    color: palette.textMid,
  },
  unlockLink: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.goldLight,
    marginTop: 16,
  },

  loadingWrap: { paddingVertical: 48, alignItems: "center" },

  dayHeadRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  dayHeadLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.goldLight,
  },
  dayHeadLine: { flex: 1, height: 1, backgroundColor: palette.goldHair },
  dayHeadCount: { fontFamily: fonts.numeral, fontSize: 16, color: palette.textMid },

  factItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  factCat: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: palette.goldLight,
    marginBottom: 4,
  },
  factText: {
    fontFamily: fonts.text,
    fontSize: 14,
    lineHeight: 20,
    color: palette.text,
  },
  factMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  factEvidence: { fontFamily: fonts.numeral, fontSize: 14, color: palette.goldLight },
});

const cd = StyleSheet.create({
  wrap: { alignItems: "flex-end", gap: 4 },
  row: { flexDirection: "row", gap: 3 },
  pip: { width: 5, height: 5, borderRadius: 3 },
  active: { backgroundColor: palette.goldLight },
  inactive: { backgroundColor: palette.glassStrong },
  count: { fontFamily: fonts.numeral, fontSize: 11, color: palette.textLow },
});
