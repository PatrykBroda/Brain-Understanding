import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntrySequence } from "@/components/EntrySequence";
import { useFighter } from "@/context/FighterContext";

export const INTRO_SEEN_KEY = "frame:intro-seen";

/**
 * First-launch cinematic splash. Mirrors the web /splash route: shows the
 * fixed "MOST MISTAKES / ARE NERVOUS SYSTEM / MISTAKES" hero, marks the intro
 * as seen, then replaces into the hub. Reached only when INTRO_SEEN_KEY is
 * unset (gated from index.tsx).
 */
export default function SplashScreen() {
  const router = useRouter();
  const { fighter } = useFighter();

  const handleDismiss = useCallback(() => {
    AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {});
    router.replace("/(tabs)/home");
  }, [router]);

  return (
    <EntrySequence
      hero={["MOST MISTAKES", "ARE NERVOUS SYSTEM", "MISTAKES"]}
      callsign={fighter?.name ?? null}
      minMs={2500}
      onDismiss={handleDismiss}
    />
  );
}
