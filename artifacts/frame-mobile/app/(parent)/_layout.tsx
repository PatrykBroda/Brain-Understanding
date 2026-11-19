import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { palette } from "@/constants/entryTheme";

export default function ParentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.gold,
        tabBarInactiveTintColor: palette.textLow,
        tabBarStyle: { backgroundColor: "#0B0C0E", borderTopColor: "rgba(255,255,255,0.08)" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="journey" options={{ title: "Journey", tabBarIcon: ({ color, size }) => <Feather name="map" size={size} color={color} /> }} />
      <Tabs.Screen name="timeline" options={{ title: "Timeline", tabBarIcon: ({ color, size }) => <Feather name="clock" size={size} color={color} /> }} />
      <Tabs.Screen name="invites" options={{ href: null, title: "Invitations" }} />
      <Tabs.Screen name="privacy" options={{ href: null, title: "Privacy" }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }} />
    </Tabs>
  );
}
