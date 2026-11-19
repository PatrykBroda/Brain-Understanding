import React from "react";
import { Alert, Switch, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";
import { Card, ErrorBox, H, Notice, Page, T, errMsg } from "@/components/junior/ui";
import { privacySummary, type JuniorMe, type PrivacySettings } from "@/lib/junior";

interface Resp { settings: PrivacySettings; matrix: { item: string; parent: boolean; coach: boolean | string; note: string }[] }
interface Prefs { timetable: boolean; observations: boolean; recognition: boolean; announcements: boolean }
const PREF_LABELS: [keyof Prefs, string][] = [
  ["timetable", "Timetable changes"],
  ["observations", "New coach notes"],
  ["recognition", "Stars and milestones"],
  ["announcements", "Gym news"],
];

export default function PrivacyScreen() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me") });
  const childId = me.data?.children[0]?.id ?? null;
  const p = useQuery({ queryKey: ["junior", "privacy", childId], enabled: !!childId, queryFn: () => apiGet<Resp>(`/junior/children/${childId}/privacy`) });
  const prefs = useQuery({ queryKey: ["junior", "prefs"], queryFn: () => apiGet<{ prefs: Prefs }>("/junior/notification-prefs") });
  const save = useMutation({
    mutationFn: (b: Partial<PrivacySettings>) => apiPut(`/junior/children/${childId}/privacy`, b),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior", "privacy"] }),
    onError: (e) => Alert.alert("Could not save", errMsg(e)),
  });
  const savePref = useMutation({
    mutationFn: (b: Partial<Prefs>) => apiPut("/junior/notification-prefs", b),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior", "prefs"] }),
    onError: (e) => Alert.alert("Could not save", errMsg(e)),
  });
  if (!childId) return <Page title="Privacy"><Notice>Add a child first.</Notice></Page>;
  if (p.isError) return <Page title="Privacy"><ErrorBox error={p.error} retry={() => void p.refetch()} /></Page>;
  const s = p.data?.settings;
  return (
    <Page title="Privacy">
      {s ? (
        <Card>
          <H>Who sees what</H>
          <T dim>{privacySummary(s)}</T>
          <Row label="Coaches can see wellbeing averages" value={s.coachSeesWellbeing} onChange={(v) => save.mutate({ coachSeesWellbeing: v })} />
          <Row label="Show Star of the Week to the class" value={s.teamSeesRecognition} onChange={(v) => save.mutate({ teamSeesRecognition: v })} />
        </Card>
      ) : null}
      {(p.data?.matrix ?? []).map((m) => (
        <Card key={m.item}>
          <T>{m.item}</T>
          <T dim>You: {m.parent ? "yes" : "no"} / Coach: {m.coach === "setting" ? "only if you allow" : m.coach ? "yes" : "no"}</T>
          {m.note ? <T dim>{m.note}</T> : null}
        </Card>
      ))}
      <Card>
        <H>Notifications</H>
        {PREF_LABELS.map(([k, label]) => (
          <Row key={k} label={label} value={prefs.data?.prefs[k] ?? true} onChange={(v) => savePref.mutate({ [k]: v })} />
        ))}
        <T dim>Notifications never include your child's name or note text.</T>
      </Card>
    </Page>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1 }}><T>{label}</T></View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}
