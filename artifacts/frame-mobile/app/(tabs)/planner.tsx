import { useAuth } from "@clerk/clerk-expo";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { apiGet, apiPatch, apiPost } from "@/lib/api";

interface PlanItem {
  key: string;
  section: string;
  content: string;
  sourceLabel: string | null;
  completed?: boolean;
}

interface WeeklyPlan {
  id: number;
  weekStart: string;
  focusSummary: string | null;
  structuralObjective: string | null;
  items: PlanItem[];
}

const SECTION_LABELS: Record<string, string> = {
  primary_weakness: "PRIMARY WEAKNESS",
  structural_objective: "STRUCTURAL OBJECTIVE",
  daily_execution: "DAILY EXECUTION",
  technical_drilling: "TECHNICAL DRILLING",
  recovery_protocol: "RECOVERY PROTOCOL",
};

const SECTION_ORDER = [
  "primary_weakness",
  "structural_objective",
  "daily_execution",
  "technical_drilling",
  "recovery_protocol",
];

function PlanItemRow({
  item,
  onToggle,
  disabled,
}: {
  item: PlanItem;
  onToggle: (key: string, done: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        pi.row,
        item.completed && pi.rowCompleted,
        pressed && pi.rowPressed,
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle(item.key, !item.completed);
      }}
      disabled={disabled}
    >
      <View style={[pi.check, item.completed && pi.checkDone]}>
        {item.completed && <Feather name="check" size={10} color="#050505" />}
      </View>
      <Text style={[pi.text, item.completed && pi.textDone]}>{item.content}</Text>
    </Pressable>
  );
}

const pi = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  rowCompleted: {
    opacity: 0.5,
  },
  rowPressed: {
    backgroundColor: "#0a0a0a",
  },
  check: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkDone: {
    backgroundColor: "#C9883A",
    borderColor: "#C9883A",
  },
  text: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 20,
  },
  textDone: {
    textDecorationLine: "line-through",
    color: "#444",
  },
});

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const {
    data: plan,
    isLoading,
    refetch,
  } = useQuery<WeeklyPlan | null>({
    queryKey: ["plan"],
    queryFn: async () => {
      try {
        return await apiGet<WeeklyPlan>("/planner/current");
      } catch {
        return null;
      }
    },
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, done }: { key: string; done: boolean }) =>
      apiPatch(`/planner/items/${key}`, { completed: done }),
    onMutate: async ({ key, done }) => {
      await qc.cancelQueries({ queryKey: ["plan"] });
      qc.setQueryData<WeeklyPlan | null>(["plan"], (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((i) =>
            i.key === key ? { ...i, completed: done } : i
          ),
        };
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });

  async function handleGenerate() {
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiPost("/planner");
      qc.invalidateQueries({ queryKey: ["plan"] });
    } catch {
      // noop
    } finally {
      setGenerating(false);
    }
  }

  const sections = SECTION_ORDER.reduce<Record<string, PlanItem[]>>((acc, sec) => {
    if (!plan) return acc;
    const items = plan.items.filter((i) => i.section === sec);
    if (items.length > 0) acc[sec] = items;
    return acc;
  }, {});

  const completedCount = plan?.items.filter((i) => i.completed).length ?? 0;
  const totalCount = plan?.items.length ?? 0;

  return (
    <ScrollView
      style={[styles.root, { paddingTop: topPad }]}
      contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + bottomPad + 100 }]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          tintColor="#C9883A"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WEEKLY MISSION</Text>
        <Pressable
          style={({ pressed }) => [styles.genBtn, pressed && { opacity: 0.8 }]}
          onPress={handleGenerate}
          disabled={generating || isLoading}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#C9883A" />
          ) : (
            <Feather name="refresh-cw" size={16} color="#C9883A" />
          )}
        </Pressable>
      </View>

      {isLoading && !plan && (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color="#C9883A" />
        </View>
      )}

      {!isLoading && !plan && (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>NO MISSION SET</Text>
          <Text style={styles.emptyText}>
            Generate your weekly mission to get a structured plan built from your athlete model.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.8 }]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#050505" />
            ) : (
              <Text style={styles.generateBtnText}>GENERATE MISSION</Text>
            )}
          </Pressable>
        </View>
      )}

      {plan && (
        <>
          {/* Focus summary */}
          {plan.focusSummary && (
            <View style={styles.focusCard}>
              <Text style={styles.focusLabel}>MISSION FOCUS</Text>
              <Text style={styles.focusText}>{plan.focusSummary}</Text>
            </View>
          )}

          {/* Progress */}
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>
              {completedCount}/{totalCount}
            </Text>
          </View>

          {/* Sections */}
          {Object.entries(sections).map(([sec, items]) => (
            <View key={sec} style={styles.section}>
              <Text style={styles.sectionLabel}>
                {SECTION_LABELS[sec] ?? sec.toUpperCase()}
              </Text>
              <View style={styles.sectionItems}>
                {items.map((item) => (
                  <PlanItemRow
                    key={item.key}
                    item={item}
                    onToggle={(key, done) => toggleMutation.mutate({ key, done })}
                    disabled={toggleMutation.isPending}
                  />
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  genBtn: {
    padding: 8,
  },
  loadingBlock: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyBlock: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 16,
  },
  emptyTitle: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    letterSpacing: 4,
    color: "#333",
  },
  emptyText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
  },
  generateBtn: {
    backgroundColor: "#C9883A",
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
  },
  generateBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 3,
    color: "#050505",
  },
  focusCard: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    borderLeftColor: "#C9883A",
    borderLeftWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  focusLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#C9883A",
    marginBottom: 6,
  },
  focusText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 22,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  progressBar: {
    flex: 1,
    height: 2,
    backgroundColor: "#1a1a1a",
  },
  progressFill: {
    height: 2,
    backgroundColor: "#C9883A",
  },
  progressLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#444",
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#C9883A",
    marginBottom: 8,
  },
  sectionItems: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
});
