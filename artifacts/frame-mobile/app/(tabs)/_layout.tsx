import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { AppState, Image, Platform, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { refreshModel } from "@/lib/modelRefresh";
import { meta } from "@/constants/typography";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  // Tabs stay mounted, so a cached model never refetches by itself. Refresh it
  // whenever a tab comes into focus and whenever the app returns to the
  // foreground (the coach/analysis may have updated it meanwhile).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshModel(qc);
    });
    return () => sub.remove();
  }, [qc]);

  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenListeners={{
        focus: () => refreshModel(qc),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#8A6A2F",
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
          ...meta,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="state"
        options={{
          title: "State",
          tabBarIcon: ({ color }) => (
            <Image
              source={require("@/assets/images/frame-logo.png")}
              style={{ width: 20, height: 20, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analyse"
        options={{
          title: "Analyse",
          tabBarIcon: ({ color }) => <Feather name="film" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: "Camp",
          tabBarIcon: ({ color }) => <Feather name="calendar" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
