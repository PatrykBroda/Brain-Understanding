import React, { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Button } from "@/components/entry";
import { Card, H, T } from "@/components/junior/ui";

const key = (role: string) => `junior.firstSteps.${role}`;

/** Remember that this device should show the "what to do first" card for a freshly added role. */
export async function markFirstSteps(role: "parent" | "coach"): Promise<void> {
  await AsyncStorage.setItem(key(role), "1");
}

/** "What to do first" card shown once, right after a role is added from inside the app. */
export function FirstSteps({ role }: { role: "parent" | "coach" }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(key(role)).then((v) => setShow(v === "1"));
  }, [role]);
  const dismiss = useCallback(() => {
    setShow(false);
    void AsyncStorage.removeItem(key(role));
  }, [role]);
  if (!show) return null;
  const account = role === "parent" ? "/(parent)/account" : "/(coach)/account";
  return (
    <Card>
      <H>Welcome. What to do first</H>
      {role === "parent" ? (
        <>
          <T>1. Add your child below (first name and birth month).</T>
          <T>2. Got a co-parent or gym invite code? Enter it in Account.</T>
          <T dim>Your gym is linked later. Nothing is shared with a gym until you ask.</T>
          <Button title="Enter an invite code" variant="secondary" onPress={() => router.push(account as never)} />
        </>
      ) : (
        <>
          <T>1. Ask your gym admin for a staff invite code.</T>
          <T>2. Enter the code in Account to join the gym team.</T>
          <T dim>Choosing Coach does not give gym access by itself. Only an invite from your gym does.</T>
          <Button title="Enter gym invite code" variant="secondary" onPress={() => router.push(account as never)} />
        </>
      )}
      <Button title="Got it" variant="ghost" onPress={dismiss} />
    </Card>
  );
}
