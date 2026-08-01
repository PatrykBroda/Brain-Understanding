import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFighter } from "@/context/FighterContext";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { fighter, isLoading, error } = useFighter();

  // Guard: if we entered tabs on a cached profile and the server has since
  // confirmed there is no fighter, route to onboarding instead of leaving the
  // athlete inside an app with no profile. (Errors keep the current screen —
  // a flaky network must not eject a signed-in athlete.)
  if (!isLoading && !error && !fighter) {
    return <Redirect href="/onboarding" />;
  }
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#C9883A",
        tabBarInactiveTintColor: "#444",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#050505",
          borderTopWidth: 1,
          borderTopColor: "#1a1a1a",
          elevation: 0,
          paddingBottom: isWeb ? 0 : insets.bottom,
          height: isWeb ? 84 : 50 + insets.bottom,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={90}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: "SpaceMono",
          fontSize: 8,
          letterSpacing: 1.5,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "HOME",
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "CHAT",
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "PROFILE",
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: "CAMP",
          tabBarIcon: ({ color }) => <Feather name="calendar" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
