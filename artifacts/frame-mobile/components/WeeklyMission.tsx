import React, { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import { useAuth } from "@/context/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost, apiUrl, ApiError } from "@/lib/api";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { useIsFramePlus } from "@/hooks/useEntitlement";
import {
  GENERATE_TIMEOUT_MS,
  formatWeekRange,
  groupItems,
  missionErrorMessage,
  type PlanCategory,
  type PlanItem,
  type PlannerResponse,
} from "@/lib/mission";

const PLAN_KEY = ["plan"] as const;

const CATEGORY_TITLE: Record<PlanCategory, string> = {
  fix: "PRIMARY WEAKNESS",
  goal_step: "STRUCTURAL OBJECTIVE",
  train: "DAILY EXECUTION",
  technique: "TECHNICAL DRILLING",
  regulate: "RECOVERY PROTOCOL",
};

const haptic = (style: Haptics.ImpactFeedbackStyle) => Haptics.impactAsync(style).catch(() => {});

/**
 * This week's mission. Reading never builds one; building is the Generate button, which
 * always ends in one of: the plan, or a plain error with TRY AGAIN. The plan is saved on
 * the server (POST /planner/generate, GET /planner/current, items completed via
 * POST/DELETE /planner/items/:key/complete) and is still there when the app is reopened.
 */
export function WeeklyMission() {
  const { isSignedIn } = useAuth();
  const qc = useQueryClient();
  const isFramePlus = useIsFramePlus();
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentStatus, setConsentStatus] = useState<AiConsentStatus | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const acceptingRef = useRef(false);

  const planQuery = useQuery<PlannerResponse>({
    queryKey: PLAN_KEY,
    queryFn: () => apiGet<PlannerResponse>("/planner/current"),
    enabled: !!isSignedIn,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });
  const data = planQuery.data;
  const plan = data?.plan ?? null;
  const done = new Set(data?.completions ?? []);
  const isPreview = data?.preview === true;

  const toggle = useMutation({
    mutationFn: ({ key, completed }: { key: string; completed: boolean }) =>
      completed
        ? apiPost(`/planner/items/${encodeURIComponent(key)}/complete`)
        : apiDelete(`/planner/items/${encodeURIComponent(key)}/complete`),
    onMutate: async ({ key, completed }) => {
      await qc.cancelQueries({ queryKey: PLAN_KEY });
      qc.setQueryData<PlannerResponse>(PLAN_KEY, (old) =>
        old
          ? {
              ...old,
              completions: completed
                ? [...new Set([...old.completions, key])]
                : old.completions.filter((k) => k !== key),
            }
          : old,
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: PLAN_KEY }),
  });

  async function build() {
    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, GENERATE_TIMEOUT_MS);
    try {
      const res = await apiPost<PlannerResponse>("/planner/generate", undefined, {
        signal: abort.signal,
      });
      qc.setQueryData(PLAN_KEY, res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      if (e instanceof ApiError && e.code === "FRAME_PLUS_REQUIRED") {
        router.push("/paywall");
      } else if (e instanceof ApiError && e.code === "AI_CONSENT_REQUIRED") {
        qc.setQueryData(["ai-consent"], { accepted: false });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setGenError(missionErrorMessage(e, timedOut));
      }
    } finally {
      clearTimeout(timer);
      setGenerating(false);
      inFlightRef.current = false;
    }
  }

  async function handleGenerate() {
    if (inFlightRef.current || generating) return;
    inFlightRef.current = true;
    setGenerating(true);
    setGenError(null);
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const status = await apiGet<AiConsentStatus>("/ai-consent");
      setConsentStatus(status);
      if (!status.accepted) {
        pendingRef.current = true;
        setConsentVisible(true);
        setGenerating(false);
        return;
      }
    } catch (e) {
      setGenError(missionErrorMessage(e, false));
      setGenerating(false);
      inFlightRef.current = false;
      return;
    }
    await build();
  }

  async function acceptConsentAndGenerate() {
    if (acceptingRef.current) return;
    if (!pendingRef.current) {
      setConsentVisible(false);
      inFlightRef.current = false;
      return;
    }
    acceptingRef.current = true;
    setConsentBusy(true);
    try {
      const status = await apiPatch<AiConsentStatus>("/ai-consent", { accepted: true });
      qc.setQueryData(["ai-consent"], status);
      setConsentStatus(status);
      pendingRef.current = false;
      setConsentVisible(false);
      setGenerating(true);
      await build();
    } catch {
      // Keep the intent and modal available so the user can try again.
      inFlightRef.current = false;
    } finally {
      setConsentBusy(false);
      acceptingRef.current = false;
    }
  }

  const groups = plan ? groupItems(plan.items) : [];
  const completedCount = plan ? plan.items.filter((i) => done.has(i.key)).length : 0;
  const totalCount = plan?.items.length ?? 0;

  return (
    <>
      <AiConsentModal
        visible={consentVisible}
        status={consentStatus}
        busy={consentBusy}
        onAccept={() => void acceptConsentAndGenerate()}
        onDecline={() => {
          pendingRef.current = false;
          inFlightRef.current = false;
          setGenerating(false);
          setConsentVisible(false);
          qc.setQueryData(["ai-consent"], { accepted: false });
        }}
        onPrivacy={() => void Linking.openURL(apiUrl("/privacy"))}
      />
      <View style={mission.wrap}>
        <View style={mission.header}>
          <View style={{ flex: 1 }}>
            <Text style={mission.headerTitle}>WEEKLY MISSION</Text>
            {data?.weekStart ? (
              <Text style={mission.week}>WEEK OF {formatWeekRange(data.weekStart).toUpperCase()}</Text>
            ) : null}
          </View>
          {plan ? (
            <Pressable
              style={({ pressed }) => [mission.genBtn, pressed && { opacity: 0.8 }]}
              onPress={() => (isFramePlus ? void handleGenerate() : router.push("/paywall"))}
              disabled={generating}
              accessibilityRole="button"
              accessibilityLabel={
                isFramePlus ? "Regenerate weekly mission" : "Regenerate weekly mission, FRAME+"
              }
            >
              {generating ? (
                <ActivityIndicator size="small" color="#8A6A2F" />
              ) : (
                <Feather name="refresh-cw" size={16} color="#8A6A2F" />
              )}
            </Pressable>
          ) : null}
        </View>

        {genError ? (
          <View style={mission.errorCard} accessibilityRole="alert">
            <Text style={mission.errorTitle}>COULDN'T BUILD YOUR MISSION</Text>
            <Text style={mission.errorBody}>{genError}</Text>
            <Pressable
              style={({ pressed }) => [mission.retryBtn, pressed && { opacity: 0.8 }]}
              onPress={() => void handleGenerate()}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#8A6A2F" />
              ) : (
                <Text style={mission.retryText}>TRY AGAIN</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {planQuery.isLoading ? (
          <View style={mission.loadingBlock}>
            <ActivityIndicator color="#8A6A2F" />
          </View>
        ) : planQuery.isError && !data ? (
          <View style={mission.emptyBlock}>
            <Text style={mission.emptyTitle}>COULDN'T LOAD YOUR MISSION</Text>
            <Text style={mission.emptyText}>Check your connection and try again.</Text>
            <Pressable
              style={({ pressed }) => [mission.retryBtn, pressed && { opacity: 0.8 }]}
              onPress={() => void planQuery.refetch()}
            >
              <Text style={mission.retryText}>TRY AGAIN</Text>
            </Pressable>
          </View>
        ) : !plan ? (
          generating ? (
            <View style={mission.emptyBlock} accessibilityLiveRegion="polite">
              <ActivityIndicator color="#8A6A2F" />
              <Text style={mission.emptyTitle}>BUILDING YOUR MISSION</Text>
              <Text style={mission.emptyText}>
                FRAME is reading what it knows about you. This can take up to a minute.
              </Text>
            </View>
          ) : data?.canGenerate === false ? (
            <View style={mission.emptyBlock}>
              <Text style={mission.emptyTitle}>NOTHING TO BUILD FROM YET</Text>
              <Text style={mission.emptyText}>
                Tell your coach about your training, or add your goals and weaknesses to your
                profile, then come back.
              </Text>
              <Pressable
                style={({ pressed }) => [mission.generateBtn, pressed && { opacity: 0.8 }]}
                onPress={() => router.push("/(tabs)/chat")}
              >
                <Text style={mission.generateBtnText}>TALK TO YOUR COACH</Text>
              </Pressable>
            </View>
          ) : (
            <View style={mission.emptyBlock}>
              <Text style={mission.emptyTitle}>NO MISSION SET</Text>
              <Text style={mission.emptyText}>
                FRAME builds 5 to 7 actions for the week from your athlete model. Each one rests on
                something you told it.
              </Text>
              <Pressable
                style={({ pressed }) => [mission.generateBtn, pressed && { opacity: 0.8 }]}
                onPress={() => void handleGenerate()}
              >
                <Text style={mission.generateBtnText}>GENERATE MISSION</Text>
              </Pressable>
            </View>
          )
        ) : (
          <>
            {generating ? (
              <View style={mission.buildingInline}>
                <ActivityIndicator size="small" color="#8A6A2F" />
                <Text style={mission.emptyText}>Building a new mission...</Text>
              </View>
            ) : null}

            {plan.rationale ? (
              <View style={mission.focusCard}>
                <Text style={mission.focusLabel}>MISSION FOCUS</Text>
                <Text style={mission.focusText}>{plan.rationale}</Text>
              </View>
            ) : null}

            {isPreview ? (
              <Pressable
                onPress={() => router.push("/paywall")}
                accessibilityRole="button"
                accessibilityLabel="Mission preview. FRAME+ unlocks the full week"
                style={mission.previewCard}
              >
                <Text style={mission.previewTitle}>MISSION PREVIEW</Text>
                <Text style={mission.previewBody}>
                  Your first action is open. FRAME+ unlocks the full week, every item with its
                  reason.
                </Text>
              </Pressable>
            ) : null}

            <View style={mission.progressRow} accessible accessibilityLabel={`${completedCount} of ${totalCount} done`}>
              <View style={mission.progressBar}>
                <View
                  style={[
                    mission.progressFill,
                    { width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` },
                  ]}
                />
              </View>
              <Text style={mission.progressLabel}>
                {completedCount}/{totalCount}
              </Text>
            </View>

            {groups.map((g) => (
              <View key={g.category} style={mission.section}>
                <Text style={mission.sectionLabel}>{CATEGORY_TITLE[g.category]}</Text>
                <View style={mission.sectionItems}>
                  {g.items.map((item) => (
                    <PlanItemRow
                      key={item.key}
                      item={item}
                      checked={done.has(item.key)}
                      onToggle={(checked) => toggle.mutate({ key: item.key, completed: checked })}
                      disabled={toggle.isPending}
                    />
                  ))}
                </View>
              </View>
            ))}

            <Text style={mission.issued}>
              BUILT{" "}
              {new Date(plan.createdAt)
                .toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                .toUpperCase()}
            </Text>
          </>
        )}
      </View>
    </>
  );
}

function PlanItemRow({
  item,
  checked,
  onToggle,
  disabled,
}: {
  item: PlanItem;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled: boolean;
}) {
  if (item.locked) {
    return (
      <Pressable
        onPress={() => router.push("/paywall")}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. FRAME+ unlocks this`}
        style={({ pressed }) => [pi.row, pressed && pi.rowPressed]}
      >
        <Feather name="lock" size={14} color="#444" style={{ marginTop: 2 }} />
        <Text style={[pi.text, { color: "#777" }]}>{item.title}</Text>
        <Text style={pi.plus}>FRAME+</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [pi.row, checked && pi.rowCompleted, pressed && pi.rowPressed]}
      onPress={() => {
        haptic(Haptics.ImpactFeedbackStyle.Light);
        onToggle(!checked);
      }}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={`${item.title}. ${item.detail}`}
      accessibilityState={{ checked, disabled }}
    >
      <View style={[pi.check, checked && pi.checkDone]}>
        {checked && <Feather name="check" size={10} color="#050505" />}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[pi.text, checked && pi.textDone]}>{item.title}</Text>
        {item.detail ? <Text style={[pi.detail, checked && pi.textDone]}>{item.detail}</Text> : null}
        {/* Why (summary) above when (schedule), both wrapping in full: the card grows to fit. */}
        {item.sourceLabel || item.suggestedDays ? (
          <View style={pi.meta}>
            {item.sourceLabel ? <Text style={pi.metaSummary}>{sentenceCase(item.sourceLabel)}</Text> : null}
            {item.suggestedDays ? <Text style={pi.metaSchedule}>{sentenceCase(item.suggestedDays)}</Text> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** First letter up, the rest as written (labels arrive lower-case from the planner). */
function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
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
    backgroundColor: "#8A6A2F",
    borderColor: "#8A6A2F",
  },
  text: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 20,
  },
  detail: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#777",
    lineHeight: 19,
  },
  textDone: {
    textDecorationLine: "line-through",
    color: "#444",
  },
  meta: {
    flexDirection: "column",
    gap: 2,
    marginTop: 4,
  },
  metaSummary: {
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 18,
    color: "#cfcfcf",
  },
  metaSchedule: {
    fontFamily: "Outfit",
    fontSize: 12,
    lineHeight: 17,
    color: "#999",
  },
  plus: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
});

const mission = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 5,
    color: "#e0e0e0",
  },
  week: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#444",
    marginTop: 4,
  },
  genBtn: {
    padding: 8,
  },
  errorCard: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    borderLeftColor: "#d2553f",
    borderLeftWidth: 2,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  errorTitle: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#d2553f",
  },
  errorBody: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 21,
  },
  retryBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.4)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 120,
    alignItems: "center",
    marginTop: 4,
  },
  retryText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 3,
    color: "#8A6A2F",
  },
  loadingBlock: {
    paddingVertical: 60,
    alignItems: "center",
  },
  buildingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
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
    textAlign: "center",
  },
  emptyText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
    flexShrink: 1,
  },
  generateBtn: {
    backgroundColor: "#8A6A2F",
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
    borderLeftColor: "#8A6A2F",
    borderLeftWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  focusLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#8A6A2F",
    marginBottom: 6,
  },
  focusText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 22,
  },
  previewCard: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.4)",
    padding: 16,
    marginBottom: 16,
    gap: 6,
  },
  previewTitle: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#8A6A2F",
  },
  previewBody: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#777",
    lineHeight: 20,
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
    backgroundColor: "#8A6A2F",
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
    color: "#8A6A2F",
    marginBottom: 8,
  },
  sectionItems: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
  },
  issued: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#333",
    textAlign: "center",
    marginTop: 4,
  },
});
