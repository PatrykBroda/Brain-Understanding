import React from "react";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/entry";
import { Card, EmptyCard, ErrorBox, H, Notice, Page, T } from "@/components/junior/ui";
import { FirstSteps } from "@/components/junior/FirstSteps";
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

  const kids = useQuery({ queryKey: ["junior", "gym-children", gymId], queryFn: () => apiGet<{ children: unknown[] }>(`/junior/gyms/${gymId}/children`), enabled: !!gymId });

  if (!loading && !gymId) {
    return (
      <Page title="Today">
        <FirstSteps role="coach" state={{ onStaff: false }} />
      </Page>
    );
  }
  if (q.isError) return <Page title="Today"><ErrorBox error={q.error} retry={() => void q.refetch()} /></Page>;
  return (
    <Page title="Today" onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {gymName ? <T dim>{gymName}</T> : null}
      {q.data && kids.data ? <FirstSteps role="coach" state={{ onStaff: true, gymKids: kids.data?.children.length ?? 0 }} /> : null}
      {q.data && q.data.pendingRequests > 0 ? <Notice>{q.data.pendingRequests} child request(s) waiting. Open the Children tab.</Notice> : null}
      {q.data && q.data.classes.length === 0 ? <EmptyCard title="No classes today" body="Classes from your timetable show up here on the day. Admins set the timetable in Team." /> : null}
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
