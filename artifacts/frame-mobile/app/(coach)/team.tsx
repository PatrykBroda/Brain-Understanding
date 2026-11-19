import React from "react";
import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/entry";
import { Card, ErrorBox, H, Notice, Page, T, errMsg } from "@/components/junior/ui";
import { useCoachGym } from "@/hooks/useCoachGym";
import { juniorErrorCopy } from "@/lib/junior";

interface Team {
  staff: { userId: string; role: string; status: string; email: string; name: string | null }[];
  pendingInvites: { id: string; email: string; role: string }[];
  groups: { id: string; name: string; childCount: number }[];
  unassigned: { id: string; displayName: string }[];
  emptyState: { code: string; message: string } | null;
}

/** Gym admin only. Non-admins get a 403 from the server and see the error. */
export default function TeamScreen() {
  const qc = useQueryClient();
  const { gymId } = useCoachGym();
  const q = useQuery({ queryKey: ["junior", "team", gymId], enabled: !!gymId, queryFn: () => apiGet<Team>(`/junior/gyms/${gymId}/team`) });
  const cancel = useMutation({
    mutationFn: (id: string) => apiPost(`/junior/gyms/${gymId}/staff-invites/${id}/cancel`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior", "team"] }),
    onError: (e) => Alert.alert("Could not cancel", juniorErrorCopy(undefined, errMsg(e))),
  });
  const assign = useMutation({
    mutationFn: (v: { groupId: string; childIds: string[] }) => apiPost(`/junior/gyms/${gymId}/groups/${v.groupId}/assign`, { childIds: v.childIds }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior"] }),
    onError: (e) => Alert.alert("Could not assign", juniorErrorCopy(undefined, errMsg(e))),
  });
  if (q.isError) return <Page title="Team"><ErrorBox error={q.error} retry={() => void q.refetch()} /></Page>;
  const d = q.data;
  const firstGroup = d?.groups[0];
  return (
    <Page title="Team" onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {d?.emptyState ? <Notice>{d.emptyState.message}</Notice> : null}
      <H>Staff</H>
      {d?.staff.map((s) => (
        <Card key={s.userId}>
          <T>{s.name ?? s.email}</T>
          <T dim>{s.role}{s.status === "active" ? "" : ` (${s.status})`}</T>
        </Card>
      ))}
      {d && d.pendingInvites.length > 0 ? <H>Pending invitations</H> : null}
      {d?.pendingInvites.map((i) => (
        <Card key={i.id}>
          <T>{i.email}</T>
          <T dim>{i.role}</T>
          <Button title="Cancel invite" variant="ghost" onPress={() => cancel.mutate(i.id)} />
        </Card>
      ))}
      <H>Groups</H>
      {d?.groups.map((g) => (
        <Card key={g.id}>
          <T>{g.name}</T>
          <T dim>{g.childCount} children</T>
        </Card>
      ))}
      {d && d.unassigned.length > 0 && firstGroup ? (
        <Card>
          <H>Not in a group yet</H>
          {d.unassigned.map((c) => <T key={c.id}>{c.displayName}</T>)}
          <Button title={`Add all to ${firstGroup.name}`} variant="secondary" onPress={() => assign.mutate({ groupId: firstGroup.id, childIds: d.unassigned.map((c) => c.id) })} />
        </Card>
      ) : null}
    </Page>
  );
}
