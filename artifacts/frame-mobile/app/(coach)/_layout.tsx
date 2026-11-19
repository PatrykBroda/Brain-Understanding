import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { palette } from "@/constants/entryTheme";

export default function CoachLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.gold,
        tabBarInactiveTintColor: palette.textLow,
        tabBarStyle: { backgroundColor: "#0B0C0E", borderTopColor: "rgba(255,255,255,0.08)" },
      }}
    >
      <Tabs.Screen name="today" options={{ title: "Today", tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="children" options={{ title: "Children", tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }} />
      <Tabs.Screen name="roster" options={{ href: null }} />
    </Tabs>
  );
}
