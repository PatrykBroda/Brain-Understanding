import React, { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import { Button, Display, EmptyState, GlassCard, IconButton, Label, haptic } from "@/components/ui";
import { fonts, MIN_TAP, palette } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost, apiUrl, ApiError } from "@/lib/api";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { useIsFramePlus } from "@/hooks/useEntitlement";
import {
  CATEGORY_LABEL,
  GENERATE_TIMEOUT_MS,
  formatWeekRange,
  groupItems,
  missionErrorMessage,
  type PlanItem,
  type PlannerResponse,
} from "@/lib/mission";

const PLAN_KEY = ["plan"] as const;

/**
 * This week's mission. Reading never builds one; building is the Generate button, which
 * always ends in one of: the plan, or a plain error with Try again. The plan is saved on
 * the server and is still there when the app is reopened.
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
      completed ? apiPost(`/planner/items/${encodeURIComponent(key)}/complete`) : apiDelete(`/planner/items/${encodeURIComponent(key)}/complete`),
    onMutate: async ({ key, completed }) => {
      await qc.cancelQueries({ queryKey: PLAN_KEY });
      qc.setQueryData<PlannerResponse>(PLAN_KEY, (old) =>
        old
          ? { ...old, completions: completed ? [...new Set([...old.completions, key])] : old.completions.filter((k) => k !== key) }
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
      const res = await apiPost<PlannerResponse>("/planner/generate", undefined, { signal: abort.signal });
      qc.setQueryData(PLAN_KEY, res);
      haptic.success();
    } catch (e) {
      if (e instanceof ApiError && e.code === "FRAME_PLUS_REQUIRED") {
        router.push("/paywall");
      } else if (e instanceof ApiError && e.code === "AI_CONSENT_REQUIRED") {
        qc.setQueryData(["ai-consent"], { accepted: false });
      } else {
        haptic.error();
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
    haptic.press();
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
      <View style={styles.block}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Display size="heading">Weekly mission</Display>
            {data?.weekStart ? <Text style={styles.week}>Week of {formatWeekRange(data.weekStart)}</Text> : null}
          </View>
          {plan ? (
            <IconButton
              icon="refresh-cw"
              label={isFramePlus ? "Regenerate weekly mission" : "Regenerate weekly mission, FRAME+"}
              onPress={() => (isFramePlus ? void handleGenerate() : router.push("/paywall"))}
              disabled={generating}
            />
          ) : null}
        </View>

        {genError ? (
          <GlassCard tone="red" padding={16} style={{ marginBottom: 12 }}>
            <View accessibilityRole="alert" style={{ gap: 10 }}>
              <Text style={styles.errTitle}>Couldn&apos;t build your mission</Text>
              <Text style={styles.errBody}>{genError}</Text>
              <Button title="Try again" variant="secondary" onPress={() => void handleGenerate()} loading={generating} style={styles.retry} />
            </View>
          </GlassCard>
        ) : null}

        {planQuery.isLoading ? (
          <EmptyState kind="loading" title="Loading your mission" />
        ) : planQuery.isError && !data ? (
          <EmptyState
            kind="error"
            title="Couldn't load your mission"
            body="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void planQuery.refetch()}
          />
        ) : !plan ? (
          generating ? (
            <GlassCard padding={24}>
              <View style={styles.building} accessibilityLiveRegion="polite">
                <ActivityIndicator color={palette.textMid} />
                <Text style={styles.buildTitle}>Building your mission</Text>
                <Text style={styles.buildBody}>FRAME is reading what it knows about you. This can take up to a minute.</Text>
              </View>
            </GlassCard>
          ) : data?.canGenerate === false ? (
            <EmptyState
              kind="empty"
              icon="target"
              title="Nothing to build from yet"
              body="Tell your coach about your training, or add your goals and weaknesses to your profile, then come back."
              actionLabel="Talk to your coach"
              onAction={() => router.push("/(tabs)/chat")}
            />
          ) : (
            <EmptyState
              kind="empty"
              icon="target"
              title="No mission yet this week"
              body="FRAME builds 5 to 7 actions for the week from your athlete model. Each one rests on something you told it."
              actionLabel="Generate this week's mission"
              onAction={() => void handleGenerate()}
            />
          )
        ) : (
          <View style={{ gap: 20 }}>
            {generating ? (
              <GlassCard padding={16}>
                <View style={styles.buildingInline}>
                  <ActivityIndicator size="small" color={palette.textMid} />
                  <Text style={styles.buildBody}>Building a new mission…</Text>
                </View>
              </GlassCard>
            ) : null}

            {plan.rationale ? (
              <GlassCard raised padding={20}>
                <Text style={styles.focusLabel}>Mission focus</Text>
                <Text style={styles.focusText}>{plan.rationale}</Text>
              </GlassCard>
            ) : null}

            {isPreview ? (
              <Pressable
                onPress={() => router.push("/paywall")}
                accessibilityRole="button"
                accessibilityLabel="Mission preview. FRAME+ unlocks the full week"
              >
                <GlassCard tone="gold" padding={16}>
                  <Text style={styles.previewTitle}>Mission preview</Text>
                  <Text style={styles.previewBody}>Your first action is open. FRAME+ unlocks the full week, every item with its reason.</Text>
                </GlassCard>
              </Pressable>
            ) : null}

            <View style={styles.progressRow} accessible accessibilityLabel={`${completedCount} of ${totalCount} done`}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {completedCount} of {totalCount} done
              </Text>
            </View>

            {groups.map((g) => (
              <View key={g.category} style={{ gap: 8 }}>
                <Label>{CATEGORY_LABEL[g.category]}</Label>
                <GlassCard padding={0}>
                  {g.items.map((item, i) => (
                    <PlanRow
                      key={item.key}
                      item={item}
                      first={i === 0}
                      checked={done.has(item.key)}
                      onToggle={(checked) => toggle.mutate({ key: item.key, completed: checked })}
                      disabled={toggle.isPending}
                    />
                  ))}
                </GlassCard>
              </View>
            ))}

            <Text style={styles.issued}>Built {new Date(plan.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Text>
          </View>
        )}
      </View>
    </>
  );
}

function PlanRow({
  item,
  first,
  checked,
  onToggle,
  disabled,
}: {
  item: PlanItem;
  first: boolean;
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
        style={({ pressed }) => [styles.row, !first && styles.rule, pressed && styles.rowPressed]}
      >
        <Feather name="lock" size={18} color={palette.textLow} />
        <Text style={[styles.rowTitle, { color: palette.textMid }]}>{item.title}</Text>
        <Text style={styles.plus}>FRAME+</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onToggle(!checked);
      }}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={`${item.title}. ${item.detail}`}
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [styles.row, !first && styles.rule, pressed && styles.rowPressed]}
    >
      <View style={[styles.check, checked && styles.checkDone]}>{checked ? <Feather name="check" size={14} color={palette.onGold} /> : null}</View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.rowTitle, checked && styles.done]}>{item.title}</Text>
        <Text style={[styles.rowDetail, checked && styles.done]}>{item.detail}</Text>
        <View style={styles.meta}>
          <Text style={styles.metaText} numberOfLines={1}>
            {item.sourceLabel}
          </Text>
          <Text style={styles.metaText}>{item.suggestedDays}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 24 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, minHeight: MIN_TAP, gap: 12 },
  week: { fontFamily: fonts.regular, fontSize: 13, color: palette.textMid, marginTop: 2, fontVariant: ["tabular-nums"] },
  errTitle: { fontFamily: fonts.semi, fontSize: 16, color: palette.redText },
  errBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: palette.textHi },
  retry: { alignSelf: "flex-start", minHeight: 48, paddingHorizontal: 22 },
  building: { alignItems: "center", gap: 10 },
  buildingInline: { flexDirection: "row", alignItems: "center", gap: 12 },
  buildTitle: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi },
  buildBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, textAlign: "center", flexShrink: 1 },
  focusLabel: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid, marginBottom: 6 },
  focusText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: palette.textHi },
  previewTitle: { fontFamily: fonts.semi, fontSize: 15, color: palette.goldPale },
  previewBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, marginTop: 4 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.gold },
  progressLabel: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingHorizontal: 20, paddingVertical: 14, minHeight: MIN_TAP + 8 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  rowPressed: { backgroundColor: palette.raised },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: palette.borderStrong, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkDone: { backgroundColor: palette.gold, borderColor: palette.gold },
  rowTitle: { flex: 1, fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: palette.textHi },
  rowDetail: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: palette.textMid },
  done: { color: palette.textLow, textDecorationLine: "line-through" },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 4 },
  metaText: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow, flexShrink: 1 },
  plus: { fontFamily: fonts.medium, fontSize: 13, color: palette.gold },
  issued: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow, textAlign: "center" },
});

