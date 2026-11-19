import React from "react";
import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/entry";
import { Card, ErrorBox, H, Notice, Page, T, errMsg } from "@/components/junior/ui";
import { useCoachGym } from "@/hooks/useCoachGym";
import { ageLabel } from "@/lib/junior";

interface Req { id: string; childId: string; displayName: string; birthYearMonth: string }
interface Group { id: string; name: string }
interface Kid { id: string; displayName: string; birthYearMonth: string; groupId: string | null }

export default function CoachChildren() {
  const qc = useQueryClient();
  const { gymId, loading } = useCoachGym();
  const enabled = !!gymId;
  const reqs = useQuery({ queryKey: ["junior", "requests", gymId], queryFn: () => apiGet<{ requests: Req[] }>(`/junior/gyms/${gymId}/membership-requests`), enabled });
  const groups = useQuery({ queryKey: ["junior", "groups", gymId], queryFn: () => apiGet<{ groups: Group[] }>(`/junior/gyms/${gymId}/groups`), enabled });
  const kids = useQuery({ queryKey: ["junior", "gym-children", gymId], queryFn: () => apiGet<{ children: Kid[] }>(`/junior/gyms/${gymId}/children`), enabled });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject"; groupId?: string }) =>
      apiPost(`/junior/gyms/${gymId}/membership-requests/${v.id}/decide`, { decision: v.decision, groupId: v.groupId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior"] }),
    onError: (e) => Alert.alert("Could not update", errMsg(e)),
  });

  if (!loading && !gymId) return <Page title="Children"><Notice>You are not on a gym's staff yet.</Notice></Page>;
  if (kids.isError) return <Page title="Children"><ErrorBox error={kids.error} retry={() => void kids.refetch()} /></Page>;
  const groupName = (id: string | null) => groups.data?.groups.find((g) => g.id === id)?.name ?? "No group";
  return (
    <Page title="Children" onRefresh={() => void qc.invalidateQueries({ queryKey: ["junior"] })}>
      {reqs.data?.requests.map((r) => (
        <Card key={r.id}>
          <H>{r.displayName} wants to join</H>
          <T dim>{ageLabel(r.birthYearMonth)}</T>
          {groups.data?.groups.length ? <T>Approve into a group:</T> : <T>Create a class group first (gym admin), then you can approve.</T>}
          {groups.data?.groups.map((g) => (
            <Button key={g.id} title={`Approve into ${g.name}`} variant="secondary" loading={decide.isPending} onPress={() => decide.mutate({ id: r.id, decision: "approve", groupId: g.id })} />
          ))}
          <Button title="Decline" variant="ghost" onPress={() => decide.mutate({ id: r.id, decision: "reject" })} />
        </Card>
      ))}
      <H>In this gym</H>
      {kids.data && kids.data.children.length === 0 ? <Notice>No approved children yet.</Notice> : null}
      {kids.data?.children.map((k) => (
        <Card key={k.id}>
          <H>{k.displayName}</H>
          <T dim>{ageLabel(k.birthYearMonth)}, {groupName(k.groupId)}</T>
        </Card>
      ))}
    </Page>
  );
}
