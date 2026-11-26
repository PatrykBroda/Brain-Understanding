import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Button, Field } from "@/components/entry";
import { palette } from "@/constants/entryTheme";
import { Card, EmptyCard, ErrorBox, H, Page, Section, StatusPill, T, errMsg } from "@/components/junior/ui";
import {
  joinStatusLabel,
  joinStatusLine,
  joinStatusTone,
  type GymHit,
  type JoinRequest,
} from "@/lib/juniorAccounts";
import type { JuniorMe } from "@/lib/junior";

/**
 * Settings > Join a gym. Open to any account. Search the public gym list (name and city only), send a
 * request as yourself (adult member) or, as a parent, for one of your junior accounts. The gym's coach or
 * admin approves or declines; you see the status here and can cancel while it is pending.
 */
export default function JoinGymScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [who, setWho] = useState<string | null>(null); // null = me
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const me = useQuery({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me"), retry: false });
  const hits = useQuery({
    queryKey: ["junior", "gym-search", term],
    queryFn: () => apiGet<{ gyms: GymHit[] }>(`/junior/gym-search?q=${encodeURIComponent(term)}`),
  });
  const reqs = useQuery({ queryKey: ["junior", "join-requests"], queryFn: () => apiGet<{ requests: JoinRequest[] }>("/junior/gym-join-requests") });

  const send = useMutation({
    mutationFn: (gymId: string) => apiPost("/junior/gym-join-requests", { gymId, ...(who ? { childId: who } : {}) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior"] }),
    onError: (e) => Alert.alert("Could not send request", errMsg(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiPost(`/junior/gym-join-requests/${id}/cancel`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["junior"] }),
    onError: (e) => Alert.alert("Could not cancel", errMsg(e)),
  });

  const kids = me.data?.children ?? [];
  const open = (gymId: string) => (reqs.data?.requests ?? []).find((r) => r.gymId === gymId && (r.status === "pending" || r.status === "approved") && (who ? r.childId === who : r.kind === "member"));
  const mine = reqs.data?.requests ?? [];

  return (
    <Page title="Join a gym" subtitle="Find your gym and send a request. The gym decides." roleBar={false}>
      {kids.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Section>Who is joining</Section>
          <View style={s.chips}>
            <Chip label="Me" on={who === null} onPress={() => setWho(null)} />
            {kids.map((k) => (
              <Chip key={k.id} label={k.displayName} on={who === k.id} onPress={() => setWho(k.id)} />
            ))}
          </View>
        </View>
      ) : null}

      <Field label="Search by gym name or city" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />

      {hits.isError ? <ErrorBox error={hits.error} retry={() => void hits.refetch()} /> : null}
      {hits.data && hits.data.gyms.length === 0 ? (
        <EmptyCard title="No gyms found" body={term ? `Nothing matches "${term}". Check the spelling, or try the city.` : "No gyms are listed yet."} />
      ) : null}
      {hits.data?.gyms.map((g) => {
        const o = open(g.id);
        return (
          <Card key={g.id}>
            <H>{g.name}</H>
            {g.city ? <T dim>{g.city}</T> : null}
            {o ? (
              <StatusPill label={joinStatusLabel(o.status)} tone={joinStatusTone(o.status)} />
            ) : (
              <Button
                title={who ? `Request for ${kids.find((k) => k.id === who)?.displayName ?? "junior"}` : "Request to join"}
                variant="secondary"
                loading={send.isPending && send.variables === g.id}
                onPress={() => send.mutate(g.id)}
              />
            )}
          </Card>
        );
      })}

      <Section>Your requests</Section>
      {reqs.data && mine.length === 0 ? <EmptyCard title="No requests yet" body="When you ask a gym to join, it shows up here with its status." /> : null}
      {mine.map((r) => (
        <Card key={r.id}>
          <H>{r.gymName}</H>
          <T dim>{r.kind === "junior" && r.childName ? `For ${r.childName}` : "For you"}{r.city ? `, ${r.city}` : ""}</T>
          <StatusPill label={joinStatusLabel(r.status)} tone={joinStatusTone(r.status)} />
          <T dim>{joinStatusLine(r)}</T>
          {r.status === "pending" ? <Button title="Cancel request" variant="ghost" loading={cancel.isPending && cancel.variables === r.id} onPress={() => cancel.mutate(r.id)} /> : null}
        </Card>
      ))}
      <Button title="Done" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
    </Page>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && { color: "#0B0C0E" }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", paddingHorizontal: 14, paddingVertical: 8, maxWidth: 200 },
  chipOn: { backgroundColor: palette.gold, borderColor: palette.gold },
  chipText: { color: palette.text, fontSize: 13, fontWeight: "600" },
});
