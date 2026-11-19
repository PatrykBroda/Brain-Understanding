import React from "react";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/entry";
import { Card, ErrorBox, H, Notice, Page, T } from "@/components/junior/ui";
import { useCoachGym } from "@/hooks/useCoachGym";
import { formatClassWhen } from "@/lib/junior";

interface Today {
  date: string;
  classes: { id: string; title: string; groupName: string; startsAt: string; status: string }[];
  pendingRequests: number;
}

export default function CoachToday() {
  const router = useRouter();
  const { gymId, gymName, loading } = useCoachGym();
  const q = useQuery({ queryKey: ["junior", "today", gymId], queryFn: () => apiGet<Today>(`/junior/gyms/${gymId}/today`), enabled: !!gymId });

  if (!loading && !gymId) {
    return (
      <Page title="Today">
        <Notice>You are not on a gym's staff yet. Ask your gym admin for an invite code, then enter it in Account.</Notice>
      </Page>
    );
  }
  if (q.isError) return <Page title="Today"><ErrorBox error={q.error} retry={() => void q.refetch()} /></Page>;
  return (
    <Page title="Today" onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {gymName ? <T dim>{gymName}</T> : null}
      {q.data && q.data.pendingRequests > 0 ? <Notice>{q.data.pendingRequests} child request(s) waiting. Open the Children tab.</Notice> : null}
      {q.data && q.data.classes.length === 0 ? <Notice>No classes today.</Notice> : null}
      {q.data?.classes.map((c) => (
        <Card key={c.id}>
          <H>{c.title}</H>
          <T dim>{c.groupName}, {formatClassWhen(c.startsAt)}{c.status === "cancelled" ? " (cancelled)" : ""}</T>
          <Button title="Open roster" variant="secondary" onPress={() => router.push({ pathname: "/(coach)/roster", params: { occId: c.id } })} />
        </Card>
      ))}
    </Page>
  );
}
