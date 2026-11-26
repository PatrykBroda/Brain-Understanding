import React, { useState } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Button, Field } from "@/components/entry";
import { Card, ErrorBox, H, Notice, Page, T, errMsg } from "@/components/junior/ui";
import { useCoachGym } from "@/hooks/useCoachGym";
import { ageLabel, formatClassWhen } from "@/lib/junior";

interface Roster {
  occurrence: { id: string; title: string; startsAt: string };
  children: { id: string; displayName: string; birthYearMonth: string; parentLogged: boolean }[];
}

export default function RosterScreen() {
  const { occId } = useLocalSearchParams<{ occId: string }>();
  const { gymId } = useCoachGym();
  const q = useQuery({ queryKey: ["junior", "roster", occId], queryFn: () => apiGet<Roster>(`/junior/gyms/${gymId}/occurrences/${occId}/roster`), enabled: !!gymId && !!occId });
  if (q.isError) return <Page title="Roster"><ErrorBox error={q.error} retry={() => void q.refetch()} /></Page>;
  return (
    <Page title={q.data?.occurrence.title ?? "Roster"}>
      {q.data ? <T dim>{formatClassWhen(q.data.occurrence.startsAt)}</T> : null}
      {q.data && q.data.children.length === 0 ? <Notice>No children in this group yet.</Notice> : null}
      {q.data?.children.map((c) => (
        <NoteCard key={c.id} gymId={gymId!} occId={occId!} child={c} />
      ))}
    </Page>
  );
}

function NoteCard({ gymId, occId, child }: { gymId: string; occId: string; child: Roster["children"][number] }) {
  const [text, setText] = useState("");
  const [shared, setShared] = useState(true);
  const save = useMutation({
    mutationFn: () => apiPost(`/junior/gyms/${gymId}/children/${child.id}/observations`, { visibility: shared ? "shared" : "private", body: text.trim(), occurrenceId: occId }),
    onSuccess: () => { setText(""); Alert.alert("Saved", shared ? "The parent can see this note." : "Only coaches can see this note."); },
    onError: (e) => Alert.alert("Could not save", errMsg(e)),
  });
  return (
    <Card>
      <H>{child.displayName}</H>
      <T dim>{ageLabel(child.birthYearMonth)}{child.parentLogged ? ", parent logged this class" : ""}</T>
      <Field label="Coach note" value={text} onChangeText={setText} multiline />
      <Button title={shared ? "Visible to parent (tap to make private)" : "Private to coaches (tap to share)"} variant="ghost" onPress={() => setShared(!shared)} />
      <Button title="Save note" variant="secondary" disabled={!text.trim()} loading={save.isPending} onPress={() => save.mutate()} />
    </Card>
  );
}
