import { Redirect } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { reportStartup } from "@/lib/crashReporter";
import { BootLoader } from "@/components/BootLoader";
import { INTRO_SEEN_KEY } from "@/app/splash";

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
      <View style={styles.loading}>
        <Text style={styles.errorTitle}>CONNECTION LOST</Text>
        <Text style={styles.errorBody}>
          Could not reach the frame. Check your connection.
        </Text>
        <Pressable
          onPress={refetch}
          style={styles.retryBtn}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>RETRY</Text>
        </Pressable>
      </View>
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
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
  },
  slowHint: {
    marginTop: 16,
    color: "#8A8A8A",
    fontSize: 10,
    letterSpacing: 3,
    fontFamily: "SpaceMono_400Regular",
  },
  errorTitle: {
    color: "#8A6A2F",
    fontSize: 14,
    letterSpacing: 3,
    fontFamily: "SpaceMono_400Regular",
  },
  errorBody: {
    color: "#8A8A8A",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop: 20,
    borderColor: "#8A6A2F",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 28,
  },
  retryText: {
    color: "#8A6A2F",
    fontSize: 12,
    letterSpacing: 2,
  },
});
