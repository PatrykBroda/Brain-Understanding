import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useFighter } from "@/context/FighterContext";

export default function IndexScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { fighter, isLoading: fighterLoading } = useFighter();

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
});
