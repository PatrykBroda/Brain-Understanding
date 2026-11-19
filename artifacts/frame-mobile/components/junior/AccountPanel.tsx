import React, { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPost } from "@/lib/api";
import { Button, Field } from "@/components/entry";
import { Card, H, Page, T, errMsg } from "@/components/junior/ui";
import type { JuniorMe } from "@/lib/junior";

/** Shared Account tab for parent and coach: role switch, invite code, and (parents) gym request. */
export function AccountPanel({ role }: { role: "parent" | "coach" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const me = useQuery({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me") });
  const [token, setToken] = useState("");

  const switchTo = useMutation({
    mutationFn: (r: "athlete" | "parent" | "coach") => apiPost("/junior/roles", { role: r }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["junior"] });
      router.replace("/");
    },
    onError: (e) => Alert.alert("Could not switch", errMsg(e)),
  });

  const accept = useMutation({
    mutationFn: () => apiPost(role === "parent" ? "/junior/guardian-invites/accept" : "/junior/staff-invites/accept", { token: token.trim() }),
    onSuccess: () => {
      setToken("");
      void qc.invalidateQueries({ queryKey: ["junior"] });
      Alert.alert("Done", role === "parent" ? "You now have access to this child." : "You have joined the gym staff.");
    },
    onError: (e) => Alert.alert("Could not use this invite", errMsg(e)),
  });

  const roles = me.data?.roles ?? [];
  return (
    <Page title="Account">
      {role === "parent" ? <GymRequest me={me.data} /> : null}
      {role === "coach" && me.data?.staff?.some((s) => s.role === "admin") ? (
        <Card>
          <H>Gym admin</H>
          <Button title="Team and groups" variant="secondary" onPress={() => router.push("/(coach)/team")} />
        </Card>
      ) : null}
      {role === "parent" ? (
        <Card>
          <H>Invitations and privacy</H>
          <Button title="My invitations" variant="secondary" onPress={() => router.push("/(parent)/invites")} />
          <Button title="Privacy and notifications" variant="secondary" onPress={() => router.push("/(parent)/privacy")} />
        </Card>
      ) : null}
      <Card>
        <H>{role === "parent" ? "Co-parent invite" : "Gym staff invite"}</H>
        <Field label="Invite code" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} />
        <Button title="Use invite" variant="secondary" disabled={token.trim().length < 10} loading={accept.isPending} onPress={() => accept.mutate()} />
      </Card>
      <Card>
        <H>Switch view</H>
        {role === "parent" && roles.includes("coach") ? <Button title="Coach view" variant="secondary" onPress={() => switchTo.mutate("coach")} /> : null}
        {role === "coach" && roles.includes("parent") ? <Button title="Parent view" variant="secondary" onPress={() => switchTo.mutate("parent")} /> : null}
        {roles.includes("athlete") ? <Button title="Athlete view" variant="secondary" onPress={() => switchTo.mutate("athlete")} /> : null}
        {roles.length <= 1 ? <T dim>This is your only view.</T> : null}
      </Card>
      <Button
        title="Sign out"
        variant="ghost"
        onPress={async () => {
          await signOut();
          router.replace("/sign-in");
        }}
      />
    </Page>
  );
}

function GymRequest({ me }: { me: JuniorMe | undefined }) {
  const qc = useQueryClient();
  const gyms = useQuery({ queryKey: ["junior", "gyms"], queryFn: () => apiGet<{ gyms: { id: string; name: string }[] }>("/junior/gyms") });
  const req = useMutation({
    mutationFn: ({ childId, gymId }: { childId: string; gymId: string }) => apiPost(`/junior/children/${childId}/membership-requests`, { gymId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["junior"] });
      Alert.alert("Request sent", "The gym will review it.");
    },
    onError: (e) => Alert.alert("Could not send request", errMsg(e)),
  });
  const kids = (me?.children ?? []).filter((k) => !k.membership || k.membership.status === "rejected");
  if (kids.length === 0 || !gyms.data?.gyms.length) return null;
  return (
    <Card>
      <H>Request a gym</H>
      {kids.map((k) => (
        <React.Fragment key={k.id}>
          <T dim>{k.displayName}</T>
          {gyms.data!.gyms.map((g) => (
            <Button key={g.id} title={`Request ${g.name}`} variant="secondary" loading={req.isPending} onPress={() => req.mutate({ childId: k.id, gymId: g.id })} />
          ))}
        </React.Fragment>
      ))}
    </Card>
  );
}
