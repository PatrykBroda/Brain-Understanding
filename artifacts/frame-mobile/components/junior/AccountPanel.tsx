import React, { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPost } from "@/lib/api";
import { Button, Field } from "@/components/entry";
import { Card, H, Page, Section, T, errMsg } from "@/components/junior/ui";
import type { JuniorMe } from "@/lib/junior";

/**
 * Shared Account tab for the parent and coach layers. Same layout in both: your layers (the switcher is at
 * the top of the page), things for this layer, Join a gym, invite code, sign out.
 */
export function AccountPanel({ role }: { role: "parent" | "coach" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const me = useQuery({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me") });
  const [token, setToken] = useState("");

  const accept = useMutation({
    mutationFn: () => apiPost(role === "parent" ? "/junior/guardian-invites/accept" : "/junior/staff-invites/accept", { token: token.trim() }),
    onSuccess: () => {
      setToken("");
      void qc.invalidateQueries({ queryKey: ["junior"] });
      Alert.alert("Done", role === "parent" ? "You now have access to this junior." : "You have joined the gym staff.");
    },
    onError: (e) => Alert.alert("Could not use this invite", errMsg(e)),
  });

  const isAdmin = !!me.data?.staff?.some((s) => s.role === "admin");
  const isStaff = !!me.data?.staff?.length;
  const single = (me.data?.roles.length ?? 0) <= 1;
  return (
    <Page title="Account">
      <Section>{role === "parent" ? "Parent" : "Coach"}</Section>
      {role === "parent" ? (
        <Card>
          <H>Junior accounts</H>
          <T dim>Create, pause or export the accounts you manage.</T>
          <Button title="Junior accounts" variant="secondary" onPress={() => router.push("/(parent)/juniors" as never)} />
          <Button title="My invitations" variant="secondary" onPress={() => router.push("/(parent)/invites" as never)} />
          <Button title="Privacy and notifications" variant="secondary" onPress={() => router.push("/(parent)/privacy" as never)} />
        </Card>
      ) : null}
      {role === "coach" && isStaff ? (
        <Card>
          <H>Your gym</H>
          <Button title="Gym board" variant="secondary" onPress={() => router.push("/(coach)/board" as never)} />
          {isAdmin ? <Button title="Team and groups" variant="secondary" onPress={() => router.push("/(coach)/team" as never)} /> : null}
        </Card>
      ) : null}

      <Section>Everyone</Section>
      <Card>
        <H>Join a gym</H>
        <T dim>{role === "parent" ? "Ask a gym to add you or one of your juniors." : "Ask a gym to add you as a member."}</T>
        <Button title="Join a gym" variant="secondary" onPress={() => router.push("/join-gym" as never)} />
      </Card>
      <Card>
        <H>{role === "parent" ? "Co-parent invite" : "Gym staff invite"}</H>
        <Field label="Invite code" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} />
        <Button title="Use invite" variant="secondary" disabled={token.trim().length < 10} loading={accept.isPending} onPress={() => accept.mutate()} />
      </Card>
      {single ? <T dim>You have one view. Add Parent, Coach or Athlete from the Profile in the athlete view to switch between them here.</T> : null}
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
