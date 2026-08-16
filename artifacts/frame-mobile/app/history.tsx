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

const ACCENT = "#8A6A2F";

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
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Feather name="arrow-left" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <View>
          <Text style={s.headerOverline}>FULL MODEL</Text>
          <Text style={s.headerTitle}>OBSERVATION HISTORY</Text>
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
                  <Text style={s.dayHeadLabel}>{bucket.label}</Text>
                  <View style={s.dayHeadLine} />
                  <Text style={s.dayHeadCount}>{bucket.facts.length}</Text>
                </View>
                <View style={{ gap: 6 }}>
                  {bucket.facts.map((f) => (
                    <View key={f.id} style={s.factItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.factCat}>
                          {(CATEGORY_LABELS[f.category] ?? f.category).toUpperCase()}
                        </Text>
                        <Text style={s.factText} numberOfLines={3}>
                          {(f.topic || f.content).toUpperCase()}
                        </Text>
                      </View>
                      <View style={s.factMeta}>
                        {(f.evidenceCount ?? 1) > 1 && (
                          <Text style={s.factEvidence}>×{f.evidenceCount}</Text>
                        )}
                        <FactConfidence value={f.confidence} />
                      </View>
                    </View>
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
  factMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  factEvidence: { fontFamily: "SpaceMono", fontSize: 9, color: "rgba(138,106,47,0.7)" },
});

const cd = StyleSheet.create({
  wrap: { alignItems: "flex-end", gap: 3 },
  row: { flexDirection: "row", gap: 2 },
  pip: { width: 4, height: 4, borderRadius: 2 },
  active: { backgroundColor: ACCENT },
  inactive: { backgroundColor: "rgba(255,255,255,0.15)" },
  count: { fontFamily: "SpaceMono", fontSize: 8, color: "rgba(255,255,255,0.35)" },
});
