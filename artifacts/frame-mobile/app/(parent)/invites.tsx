import React from "react";
import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/entry";
import { Card, ErrorBox, H, Notice, Page, T, errMsg } from "@/components/junior/ui";
import { emptyStateCopy, inviteActionPath, juniorErrorCopy, type EmptyState, type InviteRow } from "@/lib/junior";

export default function InvitesScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["junior", "invites"], queryFn: () => apiGet<{ invites: InviteRow[]; emptyState: EmptyState | null }>("/junior/my/invites") });
  const act = useMutation({
    mutationFn: (v: { i: InviteRow; d: "accept" | "decline" }) => apiPost(inviteActionPath(v.i, v.d), {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior"] }),
    onError: (e) => Alert.alert("Could not update invitation", juniorErrorCopy(undefined, errMsg(e))),
  });
  if (q.isError) return <Page title="Invitations"><ErrorBox error={q.error} retry={() => void q.refetch()} /></Page>;
  const empty = emptyStateCopy(q.data?.emptyState);
  return (
    <Page title="Invitations" onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {empty ? <Notice>{empty}</Notice> : null}
      {(q.data?.invites ?? []).map((i) => (
        <Card key={`${i.kind}-${i.id}`}>
          <H>{i.title}</H>
          {i.from ? <T dim>From {i.from}</T> : null}
          <Button title="Accept" onPress={() => act.mutate({ i, d: "accept" })} />
          <Button title="Decline" variant="ghost" onPress={() => act.mutate({ i, d: "decline" })} />
        </Card>
      ))}
    </Page>
  );
}
