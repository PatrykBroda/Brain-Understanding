import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from "@expo-google-fonts/outfit";
import { SpaceMono_400Regular } from "@expo-google-fonts/space-mono";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoginUpsellGate } from "@/components/LoginUpsellGate";
import { AiConsentGate } from "@/components/AiConsentGate";
import { FighterProvider } from "@/context/FighterContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { setApiBase, setTokenGetter } from "@/lib/api";
import { APP_DOMAIN, resolveApiBase } from "@/lib/appDomain";
import { configurePurchases, syncPurchasesUser } from "@/lib/purchases";
import { reportStartup } from "@/lib/crashReporter";

SplashScreen.preventAutoHideAsync();

SystemUI.setBackgroundColorAsync("#050505").catch(() => null);

const domain = APP_DOMAIN;
const apiBase = resolveApiBase({
  domain,
  windowOrigin: typeof window !== "undefined" ? window.location?.origin : null,
});
if (apiBase) {
  setApiBase(apiBase);
}

/**
 * A native build with no resolvable API base is unusable and, worse, is
 * unusable *quietly*: every request falls back to a relative path, so the
 * paywall renders with no price (the Guideline 3.1.2(c) rejection) and the
 * required Privacy / Terms links do nothing. Fail loudly and visibly instead.
 * On web the origin is always available, so this can only trip on native.
 */
const CONFIG_ERROR = apiBase ? null : "EXPO_PUBLIC_DOMAIN was not provisioned to this build.";

// Probe 1: module-level code ran — JS bundle loaded and env vars are visible.
reportStartup(`module-init | domain=${domain || "EMPTY"} | apiBase=${apiBase ?? "UNRESOLVED"}`);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ApiSetup() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);
  return null;
}

/**
 * Configures the RevenueCat SDK and keeps its app-user identity aligned with
 * the signed-in user, so Apple IAP purchases attach to the right account and
 * webhook events map back correctly. Native-only; no-ops on web.
 */
function PurchasesSetup() {
  const { userId } = useAuth();
  useEffect(() => {
    configurePurchases(userId);
    void syncPurchasesUser(userId);
  }, [userId]);
  return null;
}

/**
 * Clears the React Query cache whenever the signed-in identity changes —
 * including sign-out (userId: string → null) and sign-in as a different user.
 * Without this, a second athlete briefly sees the prior user's cached facts,
 * plan, competition, Google status, and profile data until refetch completes.
 *
 * Must be inside both AuthProvider (for useAuth) and QueryClientProvider (for
 * useQueryClient).
 */
function UserScopedQueryReset() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const prevRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevRef.current !== undefined && prevRef.current !== userId) {
      // Identity changed — wipe all cached queries so the next user never
      // sees the prior user's data on first render.
      qc.clear();
    }
    prevRef.current = userId;
  }, [userId, qc]);
  return null;
}

function SessionPersistenceNotice() {
  const {
    sessionPersistenceWarning,
    dismissSessionPersistenceWarning,
  } = useAuth();
  const insets = useSafeAreaInsets();

  if (!sessionPersistenceWarning) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[noticeStyles.root, { top: insets.top + 8 }]}
    >
      <Text style={noticeStyles.text}>{sessionPersistenceWarning}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss login warning"
        hitSlop={12}
        onPress={dismissSessionPersistenceWarning}
      >
        <Text style={noticeStyles.dismiss}>CLOSE</Text>
      </Pressable>
    </View>
  );
}

const noticeStyles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 100,
    elevation: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#17130C",
    borderWidth: 1,
    borderColor: "#8A6A2F",
  },
  text: {
    flex: 1,
    color: "#E0D5BF",
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 18,
  },
  dismiss: {
    color: "#C8A96A",
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 1.5,
  },
});

/**
 * Branded loading surface shown while fonts / the initial JS bundle resolve.
 * Kept intentionally simple and dependency-free so it can render before the
 * custom fonts finish loading (letter-spaced system text is an acceptable
 * pre-load fallback for the wordmark). Same dark base as the native splash and
 * SystemUI background (#050505), so there is no white flash on either side.
 */
function LoadingScreen() {
  return (
    <View style={loadingStyles.root}>
      <Text style={loadingStyles.wordmark}>FRAME</Text>
      <ActivityIndicator
        style={loadingStyles.indicator}
        size="small"
        color="#8A6A2F"
      />
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050505",
  },
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 18,
    letterSpacing: 10,
    color: "#e0e0e0",
  },
  indicator: {
    marginTop: 28,
  },
});

/**
 * Shown instead of the app when the build has no API host. Deliberately blunt
 * and self-contained: crash reporting cannot reach the server either in this
 * state, so a screenshot of this screen has to be enough to diagnose it. The
 * alternative — booting into an app whose paywall shows no price — is what got
 * version 1.0 (72) rejected, so this must never be a soft warning.
 */
function ConfigErrorScreen({ message }: { message: string }) {
  const version = Constants.expoConfig?.version ?? "unknown";
  const build = Constants.expoConfig?.ios?.buildNumber ?? "unknown";
  return (
    <View style={configErrorStyles.root}>
      <Text style={configErrorStyles.wordmark}>FRAME</Text>
      <Text accessibilityRole="alert" style={configErrorStyles.heading}>
        BUILD MISCONFIGURED
      </Text>
      <Text style={configErrorStyles.body}>{message}</Text>
      <Text style={configErrorStyles.body}>
        This build cannot reach the FRAME API, so prices, subscriptions and
        sign-in will not work. It must not be submitted or distributed. Set the
        EXPO_PUBLIC_DOMAIN secret for the EAS build profile and rebuild.
      </Text>
      <Text style={configErrorStyles.meta}>{`v${version} (${build})`}</Text>
    </View>
  );
}

const configErrorStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
    backgroundColor: "#050505",
  },
  wordmark: {
    fontSize: 18,
    letterSpacing: 10,
    color: "#e0e0e0",
  },
  heading: {
    fontSize: 12,
    letterSpacing: 2,
    color: "#C8A96A",
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: "#E0D5BF",
  },
  meta: {
    marginTop: 8,
    fontSize: 11,
    letterSpacing: 1.5,
    color: "#6d6d6d",
  },
});

function RootLayoutNav() {
  // Probe 4: inside AuthProvider + QueryClient + SafeArea — navigation tree is mounting.
  useEffect(() => {
    reportStartup("RootLayoutNav-mounted");
  }, []);

  return (
    <ErrorBoundary context="FighterProvider">
      <FighterProvider>
        <ApiSetup />
        <PurchasesSetup />
        <UserScopedQueryReset />
        <LoginUpsellGate />
        <AiConsentGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#050505" } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="splash" options={{ animation: "fade" }} />
            <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
            <Stack.Screen name="sign-up" options={{ animation: "fade" }} />
            <Stack.Screen name="onboarding" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="paywall"
              options={{
                animation: "slide_from_bottom",
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="competition"
              options={{
                animation: "slide_from_bottom",
                presentation: "modal",
              }}
            />
            <Stack.Screen name="history" options={{ animation: "slide_from_right" }} />
          </Stack>
        </AiConsentGate>
        <SessionPersistenceNotice />
      </FighterProvider>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit: Outfit_400Regular,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    SpaceMono: SpaceMono_400Regular,
    SpaceMono_400Regular,
  });

  // Probe 2: RootLayout rendered — hooks running, fonts loading.
  useEffect(() => {
    reportStartup("RootLayout-mounted");
  }, []);

  // Hide the native splash as soon as our own dark loading screen can paint.
  // Because that screen shares the splash/system background (#050505), there is
  // no white flash between the native splash and the branded loading screen.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => null);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Probe 3: fonts resolved — app tree about to mount.
      reportStartup(`fonts-resolved | error=${fontError ? String(fontError) : "none"}`);
    }
  }, [fontsLoaded, fontError]);

  // No API host means nothing below this point can work. Checked before the
  // font gate so the failure is visible immediately rather than after a load.
  if (CONFIG_ERROR) {
    return <ConfigErrorScreen message={CONFIG_ERROR} />;
  }

  // While fonts / the initial bundle load, show the branded loading screen
  // instead of a blank frame.
  if (!fontsLoaded && !fontError) {
    return (
      <ErrorBoundary context="loading">
        <LoadingScreen />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary context="root">
      <ErrorBoundary context="AuthProvider">
        <AuthProvider>
          <ErrorBoundary context="SafeAreaProvider+QueryClient">
            <SafeAreaProvider>
              <QueryClientProvider client={queryClient}>
                <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#050505" }}>
                  <ErrorBoundary context="KeyboardProvider">
                    <KeyboardProvider>
                      <RootLayoutNav />
                    </KeyboardProvider>
                  </ErrorBoundary>
                </GestureHandlerRootView>
              </QueryClientProvider>
            </SafeAreaProvider>
          </ErrorBoundary>
        </AuthProvider>
      </ErrorBoundary>
    </ErrorBoundary>
  );
}
