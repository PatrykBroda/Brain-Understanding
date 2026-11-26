import React, { useState } from "react";
import { Alert, Share, Switch, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { Button, Field } from "@/components/entry";
import { Card, EmptyCard, ErrorBox, H, Page, Section, Segmented, Stat, StatusPill, T, errMsg } from "@/components/junior/ui";
import { formatClassWhen } from "@/lib/junior";
import {
  PERIOD_OPTIONS,
  juniorStatusLabel,
  juniorStatusTone,
  lastActiveLabel,
  minutesLabel,
  ordinal,
  type BoardPeriod,
  type JuniorSummary,
} from "@/lib/juniorAccounts";

interface Rank { gym: string | null; rank: number | null; outOf: number; trainingMinutes: number; sessions: number; shownOnGymBoard: boolean }

/** Parent's view of one junior account: activity summary, own rank, gym board opt-in, pause / reset / export / delete. */
export default function JuniorSummaryScreen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<BoardPeriod>("week");
  const [newPw, setNewPw] = useState("");

  const sum = useQuery({ queryKey: ["junior", "junior-summary", childId, period], enabled: !!childId, queryFn: () => apiGet<JuniorSummary>(`/junior/junior-accounts/${childId}/summary?period=${period}`) });
  const hasGym = sum.data?.gym?.status === "approved";
  const rank = useQuery({
    queryKey: ["junior", "gym-rank", childId, period],
    enabled: !!childId && hasGym,
    retry: false,
    queryFn: () => apiGet<Rank>(`/junior/children/${childId}/gym-rank?period=${period}`),
  });
  const privacy = useQuery({
    queryKey: ["junior", "privacy", childId],
    enabled: !!childId && hasGym,
    queryFn: () => apiGet<{ settings: { showOnGymBoard?: boolean } }>(`/junior/children/${childId}/privacy`),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["junior"] });
  const pause = useMutation({
    mutationFn: (paused: boolean) => apiPost(`/junior/junior-accounts/${childId}/pause`, { paused }),
    onSuccess: refresh,
    onError: (e) => Alert.alert("Could not update", errMsg(e)),
  });
  const reset = useMutation({
    mutationFn: () => apiPost(`/junior/junior-accounts/${childId}/reset-password`, { password: newPw }),
    onSuccess: () => { setNewPw(""); Alert.alert("Password changed", "Tell them the new password."); },
    onError: (e) => Alert.alert("Could not change the password", errMsg(e)),
  });
  const board = useMutation({
    mutationFn: (v: boolean) => apiPut(`/junior/children/${childId}/privacy`, { showOnGymBoard: v }),
    onSuccess: refresh,
    onError: (e) => Alert.alert("Could not save", errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/junior/junior-accounts/${childId}`),
    onSuccess: () => { refresh(); router.replace("/(parent)/juniors" as never); },
    onError: (e) => Alert.alert("Could not delete", errMsg(e)),
  });

  async function exportData() {
    try {
      const data = await apiGet<unknown>(`/junior/junior-accounts/${childId}/export`);
      const text = JSON.stringify(data, null, 2);
      await Share.share({ message: text, title: "Junior account export" });
    } catch (e) {
      if (e instanceof ApiError) Alert.alert("Could not export", errMsg(e));
    }
  }
  function confirmDelete() {
    Alert.alert("Delete this junior account?", "This removes their login, sessions, notes and consent record. It cannot be undone. Export first if you want a copy.", [
      { text: "Keep it", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
    ]);
  }

  if (sum.isError) return <Page title="Junior"><ErrorBox error={sum.error} retry={() => void sum.refetch()} /></Page>;
  const d = sum.data;
  const j = d?.junior;
  return (
    <Page title={d?.child.displayName ?? "Junior"} onRefresh={() => void sum.refetch()} refreshing={sum.isRefetching}>
      <Button title="All juniors" variant="ghost" onPress={() => router.replace("/(parent)/juniors" as never)} />
      {j ? <StatusPill label={juniorStatusLabel(j.status)} tone={juniorStatusTone(j.status)} /> : null}
      <Segmented value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
      {d ? (
        <Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            <Stat value={d.summary.sessions} label="Sessions" />
            <Stat value={minutesLabel(d.summary.trainingMinutes)} label="Training time" />
            <Stat value={d.summary.streakWeeks} label={d.summary.streakWeeks === 1 ? "Week streak" : "Weeks streak"} />
          </View>
          <T dim>Last active: {lastActiveLabel(d.summary.lastActiveAt)}</T>
        </Card>
      ) : null}

      <Section>Coach notes shared with you</Section>
      {d && d.sharedCoachNotes.length === 0 ? <EmptyCard title="No shared notes yet" body="When a coach shares a note about training, it appears here. Private coach notes never do." /> : null}
      {d?.sharedCoachNotes.map((n) => (
        <Card key={n.id}>
          <T>{n.body}</T>
          <T dim>{formatClassWhen(n.createdAt)}</T>
        </Card>
      ))}

      {d?.gym ? (
        <>
          <Section>Gym</Section>
          <Card>
            <H>{d.gym.gymName}</H>
            <StatusPill label={d.gym.status === "approved" ? "Approved" : d.gym.status === "pending" ? "Pending" : "Not a member"} tone={d.gym.status === "approved" ? "ok" : d.gym.status === "pending" ? "wait" : "idle"} />
            {rank.data && rank.data.rank ? (
              <T>
                {ordinal(rank.data.rank)} of {rank.data.outOf} for training time this {period}. Only you see this number.
              </T>
            ) : null}
            {hasGym ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Switch value={!!privacy.data?.settings.showOnGymBoard} onValueChange={(v) => board.mutate(v)} accessibilityLabel="Show on the gym board" />
                <View style={{ flex: 1 }}>
                  <T>Show on the gym board</T>
                  <T dim>Coaches see first name and initial only. Off by default.</T>
                </View>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <Section>Controls</Section>
      <Card>
        {j && j.status === "paused" ? (
          <Button title="Resume account" variant="secondary" loading={pause.isPending} onPress={() => pause.mutate(false)} />
        ) : (
          <Button title="Pause account" variant="secondary" loading={pause.isPending} onPress={() => pause.mutate(true)} />
        )}
        <T dim>A paused junior cannot sign in or use the app until you resume it.</T>
        {j?.hasLogin ? (
          <>
            <Field label="New password (8+ characters)" value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" />
            <Button title="Change password" variant="secondary" disabled={newPw.length < 8} loading={reset.isPending} onPress={() => reset.mutate()} />
          </>
        ) : null}
        <Button title="Export their data" variant="secondary" onPress={() => void exportData()} />
        <Button title="Delete junior account" variant="ghost" onPress={confirmDelete} />
      </Card>
      <T dim>AI coach and chat are off for junior accounts.</T>
    </Page>
  );
}
