import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { ApiError, apiGet } from "@/lib/api";
import { useEntitlement } from "@/hooks/useEntitlement";
import {
  comparable,
  formatDelta,
  gapLabel,
  quickPair,
  toggleSelection,
  type CompareListItem,
  type CompareResult,
} from "@/lib/compareLogic";
import { FONT, TEXT_PRIMARY, TEXT_SECONDARY, caption, label, sectionTitle } from "@/constants/typography";

const ACCENT = "#8A6A2F";
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function CompareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { data: entitlement } = useEntitlement();
  const isFramePlus = entitlement?.plan === "frame_plus";
  const [sel, setSel] = useState<number[]>([]);
  const [pair, setPair] = useState<[number, number] | null>(null);

  const list = useQuery<CompareListItem[]>({
    queryKey: ["analysis-list"],
    queryFn: () => apiGet<{ analyses: CompareListItem[] }>("/analysis").then((r) => r.analyses ?? []),
    enabled: !!isSignedIn && isFramePlus,
  });
  const result = useQuery<CompareResult, ApiError>({
    queryKey: ["analysis-compare", pair?.[0], pair?.[1]],
    queryFn: () => apiGet<CompareResult>(`/analysis/compare?a=${pair![0]}&b=${pair![1]}`),
    enabled: !!pair && isFramePlus,
    retry: false,
    staleTime: Infinity,
  });

  const items = comparable(list.data ?? []);
  const quick = quickPair(list.data ?? []);
  const top = Platform.OS === "web" ? 20 : insets.top;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: top + 12, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 16 }}
    >
      <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <Feather name="chevron-left" size={22} color={TEXT_PRIMARY} />
      </Pressable>
      <Text style={s.title}>Compare analyses</Text>

      {!isFramePlus ? (
        <View style={s.panel}>
          <Text style={s.body}>Side-by-side comparison of two of your analyses is a FRAME+ feature.</Text>
          <Pressable style={s.button} onPress={() => router.push("/paywall")} accessibilityRole="button">
            <Text style={s.buttonText}>Unlock with FRAME+</Text>
          </Pressable>
        </View>
      ) : list.isLoading ? (
        <ActivityIndicator color={ACCENT} />
      ) : list.isError ? (
        <Text style={s.body}>Couldn't load your analyses. Check your connection and try again.</Text>
      ) : items.length < 2 ? (
        <Text style={s.body}>You need at least two analyses to compare. Run another one from the Analyse tab.</Text>
      ) : (
        <>
          {quick ? (
            <Pressable
              style={s.button}
              onPress={() => {
                setSel(quick);
                setPair(quick);
              }}
              accessibilityRole="button"
            >
              <Text style={s.buttonText}>Latest vs 4 weeks ago</Text>
            </Pressable>
          ) : null}
          <Text style={s.caption}>Or pick any two</Text>
          {items.map((a) => {
            const on = sel.includes(a.id);
            return (
              <Pressable
                key={a.id}
                style={[s.row, on && s.rowOn]}
                onPress={() => setSel((c) => toggleSelection(c, a.id))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Text style={s.rowText}>{day(a.createdAt)}</Text>
                <Text style={s.rowMeta}>{a.sessionScore != null ? `Score ${a.sessionScore}` : a.kind}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[s.button, sel.length !== 2 && s.disabled]}
            disabled={sel.length !== 2}
            onPress={() => setPair([sel[0]!, sel[1]!])}
            accessibilityRole="button"
          >
            <Text style={s.buttonText}>Compare</Text>
          </Pressable>
        </>
      )}

      {pair && isFramePlus ? (
        result.isLoading ? (
          <ActivityIndicator color={ACCENT} />
        ) : result.isError ? (
          <Text style={s.body}>
            {result.error?.code === "FRAME_PLUS_REQUIRED"
              ? "Comparison is a FRAME+ feature."
              : "Couldn't compare those two analyses. Try again."}
          </Text>
        ) : result.data ? (
          <Diff r={result.data} />
        ) : null
      ) : null}
    </ScrollView>
  );
}

function Diff({ r }: { r: CompareResult }) {
  return (
    <View style={{ gap: 14 }}>
      <Text style={s.caption}>{gapLabel(r.daysApart)}</Text>
      <View style={s.panel}>
        <Text style={s.sectionTitle}>Overall</Text>
        <Text style={s.big}>
          {r.sessionScore.before ?? "–"} → {r.sessionScore.after ?? "–"}
          {"  "}
          <Text style={s.delta}>{formatDelta(r.sessionScore.delta)}</Text>
        </Text>
      </View>
      <View style={s.panel}>
        <Text style={s.sectionTitle}>Key metrics</Text>
        {r.scores.map((m) => (
          <View key={m.key} style={s.metricRow}>
            <Text style={s.rowText}>{m.label}</Text>
            <Text style={s.rowMeta}>
              {m.before ?? "–"} → {m.after ?? "–"}  {formatDelta(m.delta)}
            </Text>
          </View>
        ))}
      </View>
      <Group title="Resolved" items={r.observations.resolved} />
      <Group title="Still showing" items={r.observations.persisting} />
      <Group title="New" items={r.observations.new} />
      <View style={s.panel}>
        <Text style={s.sectionTitle}>Summary</Text>
        <Text style={s.body}>{r.summary}</Text>
      </View>
    </View>
  );
}

function Group({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={s.panel}>
      <Text style={s.sectionTitle}>{title}</Text>
      {items.map((t, i) => (
        <Text key={`${i}-${t}`} style={s.body}>
          • {t}
        </Text>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  title: { fontFamily: FONT.medium, fontSize: 22, color: TEXT_PRIMARY },
  sectionTitle: { ...sectionTitle, marginBottom: 6 },
  caption: { ...caption },
  body: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23, color: TEXT_SECONDARY },
  panel: { borderColor: "#222", borderWidth: 1, padding: 16, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", borderColor: "#222", borderWidth: 1, padding: 14 },
  rowOn: { borderColor: ACCENT },
  rowText: { fontFamily: FONT.regular, fontSize: 15, color: TEXT_PRIMARY },
  rowMeta: { fontFamily: FONT.regular, fontSize: 14, color: TEXT_SECONDARY },
  metricRow: { flexDirection: "row", justifyContent: "space-between" },
  big: { fontFamily: FONT.medium, fontSize: 26, color: TEXT_PRIMARY },
  delta: { fontSize: 16, color: "#d9bc84" },
  button: { borderColor: ACCENT, borderWidth: 1, paddingVertical: 15, paddingHorizontal: 26, alignItems: "center" },
  disabled: { opacity: 0.4 },
  buttonText: { ...label, fontSize: 13, lineHeight: 17, color: "#d9bc84", textAlign: "center" },
});
