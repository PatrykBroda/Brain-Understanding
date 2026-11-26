import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { WhatFirst } from "@/components/junior/ui";

/** Kept for the "add a role" flow; the card itself is now driven by real account state, not a one-time flag. */
export async function markFirstSteps(role: "parent" | "coach"): Promise<void> {
  await AsyncStorage.removeItem(`junior.firstSteps.${role}`);
}

export interface FirstStepsState {
  /** parent: number of children / junior accounts. */
  children?: number;
  /** parent: any child with an approved gym. */
  anyGym?: boolean;
  /** coach: on a gym's staff. */
  onStaff?: boolean;
  /** coach: approved children in the gym. */
  gymKids?: number;
}

/**
 * "What to do first", one per role. Shown only while the role is still empty, and it goes away on its own
 * as soon as the first real thing exists. Each step has a button that goes to the right place.
 */
export function FirstSteps({ role, state }: { role: "parent" | "coach"; state: FirstStepsState }) {
  const router = useRouter();
  if (role === "parent") {
    if ((state.children ?? 0) > 0 && state.anyGym) return null;
    const noKids = (state.children ?? 0) === 0;
    return (
      <WhatFirst
        steps={[
          noKids ? "Create a junior account for your child, or add them without a login." : "Your child is added.",
          "Join a gym for them. Nothing is shared until the gym approves.",
          "Come back here to log sessions and read the coach's shared notes.",
        ]}
        action={noKids ? { label: "Create a junior account", onPress: () => router.push("/(parent)/junior-new" as never) } : { label: "Join a gym", onPress: () => router.push("/join-gym" as never) }}
      />
    );
  }
  if (state.onStaff && (state.gymKids ?? 0) > 0) return null;
  if (!state.onStaff) {
    return (
      <WhatFirst
        steps={["Ask your gym admin for a staff invite code.", "Enter the code in Account to join the gym team.", "Choosing Coach gives no gym access by itself. Only an invite from your gym does."]}
        action={{ label: "Enter a gym invite code", onPress: () => router.push("/(coach)/account" as never) }}
      />
    );
  }
  return (
    <WhatFirst
      steps={["Open Children to approve join requests into a class group.", "Open Today to see classes and leave coach notes.", "Check the Board to see top performers once members have trained."]}
      action={{ label: "Open Children", onPress: () => router.push("/(coach)/children" as never) }}
    />
  );
}
