import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { layerTabOptions } from "@/components/junior/tabOptions";

const icon = (name: React.ComponentProps<typeof Feather>["name"]) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Feather name={name} size={size} color={color} />;
  };

export default function CoachLayout() {
  return (
    <Tabs screenOptions={layerTabOptions}>
      <Tabs.Screen name="today" options={{ title: "Today", tabBarIcon: icon("calendar") }} />
      <Tabs.Screen name="children" options={{ title: "Children", tabBarIcon: icon("users") }} />
      <Tabs.Screen name="board" options={{ title: "Board", tabBarIcon: icon("award") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("user") }} />
      <Tabs.Screen name="roster" options={{ href: null }} />
      <Tabs.Screen name="team" options={{ href: null, title: "Team" }} />
    </Tabs>
  );
}
