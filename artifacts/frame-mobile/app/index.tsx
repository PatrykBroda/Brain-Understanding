import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFighter } from "@/context/FighterContext";

export default function IndexScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { fighter, isLoading: fighterLoading, error, refetch } = useFighter();

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#C9883A" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  if (fighterLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#C9883A" />
      </View>
    );
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
