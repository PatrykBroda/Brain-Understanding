import { Redirect } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { reportStartup } from "@/lib/crashReporter";
import { BootLoader } from "@/components/BootLoader";
import { INTRO_SEEN_KEY } from "@/app/splash";
import { EmptyState, Screen } from "@/components/entry";

function LoadingScreen({ label }: { label: string }) {
  return <BootLoader label={label} />;
}

export default function IndexScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoading: fighterLoading, error, refetch } = useFighter();

  // Whether the first-launch cinematic intro has already played. null until
  // AsyncStorage resolves; gates the final redirect to /splash vs /home.
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((v) => setIntroSeen(v === "1"))
      .catch(() => setIntroSeen(true));
  }, []);

  // Timing probes for diagnostics.
  const authReported = useRef(false);
  useEffect(() => {
    if (isLoaded && !authReported.current) {
      authReported.current = true;
      reportStartup(`auth-loaded | signedIn=${String(isSignedIn)}`);
    }
  }, [isLoaded, isSignedIn]);

  const readyReported = useRef(false);
  const ready = isLoaded && (!isSignedIn || (!fighterLoading && !error));
  useEffect(() => {
    if (ready && !readyReported.current) {
      readyReported.current = true;
      reportStartup("first-screen-ready");
    }
  }, [ready]);

  if (!isLoaded) {
    return <LoadingScreen label="Connecting. This can take a moment on a slow network." />;
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  if (fighterLoading) {
    return <LoadingScreen label="Loading your Frame" />;
  }

  if (error) {
    return (
      <Screen light={null}>
        <View style={styles.loading}>
          <View style={styles.card}>
            <EmptyState
              kind="error"
              title="We can't reach your Frame"
              body="Check your connection and try again."
              actionLabel="Try again"
              onAction={refetch}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (introSeen === null) {
    return <LoadingScreen label="Loading your Frame" />;
  }
  if (!introSeen) {
    return <Redirect href="/splash" />;
  }

  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420 },
});
