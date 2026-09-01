import { useRouter, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import { shouldPresentLoginUpsell } from "@/lib/loginUpsell";
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
  const routeSegments = useSegments();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { fighter } = useFighter();
  const { data: entitlement } = useEntitlement();

  // Which user we've already prompted this app session. Reset on sign-out so a
  // subsequent re-login prompts again.
  const promptedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      promptedForRef.current = null;
      return;
    }

    if (
      !shouldPresentLoginUpsell({
        routeSegments,
        isLoaded,
        isSignedIn,
        userId,
        hasFighter: !!fighter,
        plan: entitlement?.plan,
        purchasesSupported: isPurchasesSupported(),
        promptedForUser: promptedForRef.current,
      })
    ) {
      return;
    }

    promptedForRef.current = userId;
    router.push("/paywall");
  }, [
    routeSegments,
    isLoaded,
    isSignedIn,
    userId,
    fighter,
    entitlement?.plan,
    router,
  ]);

  return null;
}
