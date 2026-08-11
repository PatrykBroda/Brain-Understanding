import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import { isPurchasesSupported } from "@/lib/purchases";

/**
 * Presents the FRAME+ paywall once on each login for athletes who aren't
 * subscribed yet. "Each login" = every fresh sign-in and every cold start while
 * signed in — but only once per session so it never loops or interrupts twice.
 *
 * Only fires after onboarding (a fighter exists) so a brand-new athlete isn't
 * hit with the upsell mid-setup, and only where purchases are possible (native).
 */
export function LoginUpsellGate() {
  const router = useRouter();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { fighter } = useFighter();
  const { data: entitlement } = useEntitlement();

  // Which user we've already prompted this app session. Reset on sign-out so a
  // subsequent re-login prompts again.
  const promptedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !userId) {
      promptedForRef.current = null;
      return;
    }

    if (!isPurchasesSupported()) return;
    if (!fighter) return; // still onboarding
    if (entitlement?.plan !== "free") return; // subscribed or not resolved yet
    if (promptedForRef.current === userId) return;

    promptedForRef.current = userId;
    router.push("/paywall");
  }, [isLoaded, isSignedIn, userId, fighter, entitlement?.plan, router]);

  return null;
}
