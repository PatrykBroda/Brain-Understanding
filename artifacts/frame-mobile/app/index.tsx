import { Redirect } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { reportStartup } from "@/lib/crashReporter";
import { BootLoader } from "@/components/BootLoader";
import { INTRO_SEEN_KEY } from "@/app/splash";
import { Button, Display, Eyebrow, GlassCard, Screen } from "@/components/ui";
import { fonts, palette } from "@/constants/theme";

function LoadingScreen({ label }: { label: string }) {
  return <BootLoader label={label} />;
}

export default function IndexScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { fighter, isLoading: fighterLoading, error, refetch } = useFighter();

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
    return <LoadingScreen label="CONNECTING · SLOW NETWORK" />;
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  if (fighterLoading) {
    return <LoadingScreen label="LOADING YOUR FRAME" />;
  }

  if (error) {
    return (
      <Screen tone="red">
        <View style={styles.loading}>
          <GlassCard tone="red" radius={32} padding={28} style={styles.card}>
            <Eyebrow style={styles.errorKicker}>CONNECTION LOST</Eyebrow>
            <Display size="heading" style={styles.errorTitle}>
              We can't reach your frame.
            </Display>
            <Text style={styles.errorBody}>
              Could not reach the frame. Check your connection.
            </Text>
            <Button title="RETRY" onPress={refetch} />
          </GlassCard>
        </View>
      </Screen>
    );
  }

  if (!fighter) {
    return <Redirect href="/onboarding" />;
  }

  if (introSeen === null) {
    return <LoadingScreen label="LOADING YOUR FRAME" />;
  }
  if (!introSeen) {
    return <Redirect href="/splash" />;
  }

  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: { width: "100%", maxWidth: 420 },
  errorKicker: { color: palette.redLight, textAlign: "center" },
  errorTitle: { textAlign: "center", marginTop: 8, marginBottom: 12 },
  errorBody: {
    color: palette.textMid,
    fontFamily: fonts.text,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 28,
  },
});
