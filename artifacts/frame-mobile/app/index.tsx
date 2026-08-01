import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFighter } from "@/context/FighterContext";
import { reportStartup } from "@/lib/crashReporter";

const SLOW_HINT_MS = 6_000;

function LoadingScreen({ label }: { label: string }) {
  // After a few seconds of waiting, tell the athlete what's happening
  // instead of showing an anonymous spinner.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_HINT_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#C9883A" />
      {slow ? <Text style={styles.slowHint}>{label}</Text> : null}
    </View>
  );
}

export default function IndexScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { fighter, isLoading: fighterLoading, error, refetch } = useFighter();

  // Timing probes: when auth restore finishes and when the first screen is
  // actually ready — the two phases the earlier probes couldn't see.
  const clerkReported = useRef(false);
  useEffect(() => {
    if (isLoaded && !clerkReported.current) {
      clerkReported.current = true;
      reportStartup(`clerk-loaded | signedIn=${String(isSignedIn)}`);
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
    color: "#C9883A",
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
    borderColor: "#C9883A",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 28,
  },
  retryText: {
    color: "#C9883A",
    fontSize: 12,
    letterSpacing: 2,
  },
});
