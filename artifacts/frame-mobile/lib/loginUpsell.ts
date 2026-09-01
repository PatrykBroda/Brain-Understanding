export interface LoginUpsellState {
  routeSegments: readonly string[];
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  hasFighter: boolean;
  plan: string | undefined;
  purchasesSupported: boolean;
  promptedForUser: string | null;
}

export function shouldPresentLoginUpsell({
  routeSegments,
  isLoaded,
  isSignedIn,
  userId,
  hasFighter,
  plan,
  purchasesSupported,
  promptedForUser,
}: LoginUpsellState): boolean {
  return (
    isLoaded &&
    isSignedIn &&
    !!userId &&
    routeSegments[0] === "(tabs)" &&
    purchasesSupported &&
    hasFighter &&
    plan === "free" &&
    promptedForUser !== userId
  );
}