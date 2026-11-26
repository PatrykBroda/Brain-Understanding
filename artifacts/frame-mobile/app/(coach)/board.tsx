import React, { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card, EmptyCard, ErrorBox, H, Notice, Page, Section, Segmented, StatusPill, T } from "@/components/junior/ui";
import { useCoachGym } from "@/hooks/useCoachGym";
import {
  PERIOD_OPTIONS,
  deltaLabel,
  minutesLabel,
  pctLabel,
  type BoardPeriod,
  type BoardRow,
  type Leaderboard,
} from "@/lib/juniorAccounts";

/**
 * Gym performance: coaches and the gym admin of THIS gym. Approved members only. Juniors show as
 * first name + initial and only when a parent switched the gym board on for them.
 */
export default function GymBoard() {
  const { gymId, gymName, loading } = useCoachGym();
  const [period, setPeriod] = useState<BoardPeriod>("week");
  const q = useQuery({ queryKey: ["junior", "leaderboard", gymId, period], enabled: !!gymId, queryFn: () => apiGet<Leaderboard>(`/junior/gyms/${gymId}/leaderboard?period=${period}`) });

  if (!loading && !gymId) return <Page title="Gym board"><Notice>You are not on a gym's staff yet.</Notice></Page>;
  if (q.isError) return <Page title="Gym board"><ErrorBox error={q.error} retry={() => void q.refetch()} /></Page>;
  const d = q.data;
  const empty = !!d && d.counts.shown === 0;
  return (
    <Page title="Gym board" subtitle={gymName ?? undefined} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Segmented value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
      {d ? (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T dim>{d.counts.members} approved members</T>
            <T dim>Attendance {pctLabel(d.gymAttendanceRate)}</T>
          </View>
          {d.counts.hidden > 0 ? <T dim>{d.counts.hidden} not shown (their parent or they have not turned the board on).</T> : null}
        </Card>
      ) : null}
      {empty ? (
        <EmptyCard
          title={d!.counts.members === 0 ? "No approved members yet" : "Nobody is on the board yet"}
          body={d!.counts.members === 0 ? "Approve join requests in the Children tab. Members appear here once they train." : "Parents choose whether a junior shows here, and it is off until they do. Adult members can opt in from their profile."}
        />
      ) : null}
      {d && !empty ? (
        <>
          <Section>Top performers: training time</Section>
          <Rows rows={d.top.minutes} value={(r) => minutesLabel(r.trainingMinutes)} sub={(r) => `${r.sessions} sessions`} />
          <Section>Top performers: sessions</Section>
          <Rows rows={d.top.sessions} value={(r) => String(r.sessions)} sub={(r) => minutesLabel(r.trainingMinutes)} />
          <Section>Longest streak</Section>
          <Rows rows={d.top.streak} value={(r) => `${r.streakWeeks} wk`} sub={() => "in a row"} />
          <Section>Most improved vs last {period}</Section>
          {d.mostImproved.length === 0 ? <T dim>Nobody trained more than the {period} before.</T> : null}
          {d.mostImproved.map((r, i) => (
            <Card key={r.id}>
              <Line rank={i + 1} name={r.name} value={deltaLabel(r)} sub={`${minutesLabel(r.trainingMinutes)} now, ${minutesLabel(r.priorMinutes)} before`} />
            </Card>
          ))}
          <Section>Attendance rate</Section>
          <Rows rows={d.attendance} value={(r) => pctLabel(r.attendanceRate)} sub={(r) => `${r.sessions} sessions`} />
          <Section>Star of the Week candidates</Section>
          {d.starCandidates.length === 0 ? <T dim>Needs 2 or more sessions this week.</T> : null}
          {d.starCandidates.map((c) => (
            <Card key={c.childId}>
              <H>{c.name}</H>
              <T dim>{c.reason}</T>
              {c.alreadyAwarded ? <StatusPill label="Already awarded" tone="ok" /> : null}
            </Card>
          ))}
          <T dim>Candidates only. You choose and award the star yourself.</T>
        </>
      ) : null}
    </Page>
  );
}

function Rows({ rows, value, sub }: { rows: BoardRow[]; value: (r: BoardRow) => string; sub: (r: BoardRow) => string }) {
  if (rows.length === 0) return <T dim>Nothing yet for this period.</T>;
  return (
    <Card>
      {rows.map((r, i) => (
        <Line key={r.id} rank={i + 1} name={r.name} value={value(r)} sub={sub(r)} />
      ))}
    </Card>
  );
}

function Line({ rank, name, value, sub }: { rank: number; name: string; value: string; sub: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <T dim>{rank}</T>
      <View style={{ flex: 1 }}>
        <T>{name}</T>
        <T dim>{sub}</T>
      </View>
      <H>{value}</H>
    </View>
  );
}
