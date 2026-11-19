import React, { useState } from "react";
import { Alert, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Button, Field } from "@/components/entry";
import { Card, ErrorBox, H, Notice, Page, T, errMsg } from "@/components/junior/ui";
import { formatClassWhen, newClientLogId, sessionsLabel } from "@/lib/junior";

interface HomeChild {
  id: string;
  displayName: string;
  membershipStatus: "pending" | "approved" | null;
  sessionCount: number;
  nextClass: { id: string; title: string; startsAt: string } | null;
  needsLog: { id: string; title: string; startsAt: string } | null;
}
interface Home { children: HomeChild[]; canAddRecords: boolean }

export default function ParentHome() {
  const qc = useQueryClient();
  const home = useQuery({ queryKey: ["junior", "parent-home"], queryFn: () => apiGet<Home>("/junior/parent/home") });
  const [pendingLogIds] = useState(() => new Map<string, string>());

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["junior"] });
  };

  const logIt = useMutation({
    mutationFn: ({ childId, occurrenceId }: { childId: string; occurrenceId: string }) => {
      // The same id is re-sent if the request is retried, so a double tap or flaky network never double counts.
      const key = `${childId}:${occurrenceId}`;
      const clientLogId = pendingLogIds.get(key) ?? newClientLogId();
      pendingLogIds.set(key, clientLogId);
      return apiPost(`/junior/children/${childId}/logs`, { occurrenceId, clientLogId });
    },
    onSuccess: refresh,
    onError: (e) => Alert.alert("Could not add this session", errMsg(e)),
  });

  if (home.isError) return <Page title="Home"><ErrorBox error={home.error} retry={() => void home.refetch()} /></Page>;
  const data = home.data;
  return (
    <Page title="Home" onRefresh={() => void home.refetch()} refreshing={home.isRefetching}>
      {data && data.children.length === 0 ? <Notice>Add your child to get started.</Notice> : null}
      {data && !data.canAddRecords && data.children.length > 0 ? (
        <Notice>You are in view-only mode: adding new records needs a FRAME Family plan. Everything already saved stays available.</Notice>
      ) : null}
      {data?.children.map((c) => (
        <Card key={c.id}>
          <H>{c.displayName}</H>
          <T dim>{sessionsLabel(c.sessionCount)}</T>
          {c.membershipStatus === null ? <T>Not linked to a gym yet. Open Account to request a gym.</T> : null}
          {c.membershipStatus === "pending" ? <T>Waiting for the gym to approve.</T> : null}
          {c.nextClass ? <T dim>Next class: {c.nextClass.title}, {formatClassWhen(c.nextClass.startsAt)}</T> : null}
          {c.needsLog ? (
            <View style={{ gap: 8 }}>
              <T>Did {c.displayName} attend {c.needsLog.title} ({formatClassWhen(c.needsLog.startsAt)})?</T>
              <Button
                title="Yes, add this session"
                loading={logIt.isPending}
                onPress={() => logIt.mutate({ childId: c.id, occurrenceId: c.needsLog!.id })}
              />
            </View>
          ) : null}
        </Card>
      ))}
      <AddChild onDone={refresh} />
    </Page>
  );
}

function AddChild({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [ym, setYm] = useState("");
  const add = useMutation({
    mutationFn: () => apiPost("/junior/children", { displayName: name.trim(), birthYearMonth: ym.trim() }),
    onSuccess: () => { setName(""); setYm(""); onDone(); },
    onError: (e) => Alert.alert("Could not add child", errMsg(e)),
  });
  return (
    <Card>
      <H>Add a child</H>
      <Field label="First name or nickname" value={name} onChangeText={setName} />
      <Field label="Birth month (YYYY-MM)" value={ym} onChangeText={setYm} autoCapitalize="none" />
      <Button title="Add child" variant="secondary" loading={add.isPending} disabled={!name.trim() || !/^\d{4}-\d{2}$/.test(ym.trim())} onPress={() => add.mutate()} />
    </Card>
  );
}
