import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/entry";
import { palette } from "@/constants/entryTheme";
import { Card, ErrorBox, H, Notice, Page, T, errMsg } from "@/components/junior/ui";
import { formatClassWhen, sessionsLabel, type JuniorMe } from "@/lib/junior";

interface Journey {
  child: { id: string; displayName: string };
  sessionCount: number;
  milestones: { label: string; threshold: number; reachedAt: string | null }[];
  sessions: { id: string; loggedAt: string; class: { title?: string; startsAt?: string }; focus: { title: string | null; practiceDetails: string | null } | null }[];
  observations: { id: string; body: string; createdAt: string }[];
  canAddRecords: boolean;
}

export default function JourneyScreen() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me") });
  const kids = me.data?.children ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const childId = picked ?? kids[0]?.id ?? null;
  const j = useQuery({ queryKey: ["junior", "journey", childId], queryFn: () => apiGet<Journey>(`/junior/children/${childId}/journey`), enabled: !!childId });
  const undo = useMutation({
    mutationFn: (logId: string) => apiPost(`/junior/children/${childId}/logs/${logId}/undo`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior"] }),
    onError: (e) => Alert.alert("Could not undo", errMsg(e)),
  });

  if (!childId) return <Page title="Journey"><Notice>Add a child on the Home tab to see their journey.</Notice></Page>;
  if (j.isError) return <Page title="Journey"><ErrorBox error={j.error} retry={() => void j.refetch()} /></Page>;
  const d = j.data;
  return (
    <Page title="Journey" onRefresh={() => void j.refetch()} refreshing={j.isRefetching}>
      {kids.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          {kids.map((k) => (
            <Pressable key={k.id} onPress={() => setPicked(k.id)} accessibilityRole="button">
              <Text style={{ color: k.id === childId ? palette.gold : palette.textMid, fontSize: 16 }}>{k.displayName}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {d ? (
        <>
          <Card>
            <H>{d.child.displayName}</H>
            <T>{sessionsLabel(d.sessionCount)} logged</T>
            {d.milestones.map((m) => <T key={m.threshold}>{m.label}</T>)}
          </Card>
          {d.observations.length > 0 ? (
            <Card>
              <H>Notes from the coach</H>
              {d.observations.map((o) => <T key={o.id}>{o.body}</T>)}
            </Card>
          ) : null}
          <H>Sessions</H>
          {d.sessions.length === 0 ? <Notice>No sessions yet. They appear here when you add them from Home.</Notice> : null}
          {d.sessions.map((s) => (
            <Card key={s.id}>
              <T>{s.class.title ?? "Class"}{s.class.startsAt ? `, ${formatClassWhen(s.class.startsAt)}` : ""}</T>
              {s.focus?.title ? <T dim>Weekly focus: {s.focus.title}</T> : null}
              {s.focus?.practiceDetails ? <T dim>{s.focus.practiceDetails}</T> : null}
              <Button title="Undo this session" variant="ghost" onPress={() => undo.mutate(s.id)} />
            </Card>
          ))}
        </>
      ) : null}
    </Page>
  );
}
