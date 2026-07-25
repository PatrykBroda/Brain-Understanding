import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from "@expo-google-fonts/outfit";
import { SpaceMono_400Regular } from "@expo-google-fonts/space-mono";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FighterProvider } from "@/context/FighterContext";
import { setApiBase, setTokenGetter } from "@/lib/api";
import { reportStartup } from "@/lib/crashReporter";

SplashScreen.preventAutoHideAsync();

SystemUI.setBackgroundColorAsync("#050505").catch(() => null);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
if (typeof window !== "undefined" && window.location?.origin) {
  setApiBase(`${window.location.origin}/api`);
} else if (domain) {
  setApiBase(`https://${domain}/api`);
}

// Probe 1: module-level code ran — JS bundle loaded and env vars are visible.
reportStartup(`module-init | key=${publishableKey ? "set" : "EMPTY"} | domain=${domain || "EMPTY"}`);

const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // ignore
    }
  },
  async clearToken(key: string) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  },
};

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

function RootLayoutNav() {
  // Probe 4: inside Clerk + QueryClient + SafeArea — navigation tree is mounting.
  useEffect(() => {
    reportStartup("RootLayoutNav-mounted");
  }, []);

  return (
    <ErrorBoundary context="FighterProvider">
      <FighterProvider>
        <ApiSetup />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#050505" } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
          <Stack.Screen name="sign-up" options={{ animation: "fade" }} />
          <Stack.Screen name="onboarding" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="analyse"
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
        </Stack>
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Probe 3: fonts resolved — splash screen about to hide.
      reportStartup(`fonts-resolved | error=${fontError ? String(fontError) : "none"}`);
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary context="root">
      <ErrorBoundary context="ClerkProvider">
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
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
        </ClerkProvider>
      </ErrorBoundary>
    </ErrorBoundary>
  );
}
