import React from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/entry";
import { Card, EmptyCard, ErrorBox, H, Page, StatusPill, T, WhatFirst } from "@/components/junior/ui";
import { juniorStatusLabel, juniorStatusTone, type JuniorAccount } from "@/lib/juniorAccounts";

/** Parent layer: junior accounts you manage. Tap one for its summary and controls. */
export default function Juniors() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["junior", "junior-accounts"], queryFn: () => apiGet<{ juniors: JuniorAccount[] }>("/junior/junior-accounts") });
  if (q.isError) return <Page title="Juniors"><ErrorBox error={q.error} retry={() => void q.refetch()} /></Page>;
  const list = q.data?.juniors ?? [];
  return (
    <Page title="Juniors" subtitle="Junior accounts you manage." onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.data && list.length === 0 ? (
        <WhatFirst
          steps={["Create a junior account: name, date of birth and your consent.", "Choose how they sign in, or manage it yourself.", "Ask a gym to add them from Account, Join a gym."]}
          action={{ label: "Create a junior account", onPress: () => router.push("/(parent)/junior-new" as never) }}
        />
      ) : null}
      {list.map((j) => (
        <Pressable key={j.childId} onPress={() => router.push({ pathname: "/(parent)/junior", params: { childId: j.childId } } as never)} accessibilityRole="button" accessibilityLabel={`${j.displayName}, open summary`}>
          <Card>
            <H>{j.displayName}</H>
            <StatusPill label={juniorStatusLabel(j.status)} tone={juniorStatusTone(j.status)} />
            <T dim>{j.hasLogin ? `Signs in as ${j.username}` : j.status === "pending_setup" ? "Setup code not used yet" : "No login. You log their sessions."}</T>
          </Card>
        </Pressable>
      ))}
      {list.length > 0 ? <Button title="Create a junior account" variant="secondary" onPress={() => router.push("/(parent)/junior-new" as never)} /> : null}
      {list.length === 0 && q.data ? <EmptyCard title="No junior accounts yet" body="Junior accounts are linked to your account. You can pause, export or delete them any time." /> : null}
    </Page>
  );
}
