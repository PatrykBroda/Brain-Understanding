import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { layerTabOptions } from "@/components/junior/tabOptions";

const icon = (name: React.ComponentProps<typeof Feather>["name"]) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Feather name={name} size={size} color={color} />;
  };

export default function ParentLayout() {
  return (
    <Tabs screenOptions={layerTabOptions}>
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="journey" options={{ title: "Journey", tabBarIcon: icon("map") }} />
      <Tabs.Screen name="timeline" options={{ title: "Timeline", tabBarIcon: icon("clock") }} />
      <Tabs.Screen name="juniors" options={{ title: "Juniors", tabBarIcon: icon("users") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("user") }} />
      <Tabs.Screen name="junior" options={{ href: null, title: "Junior" }} />
      <Tabs.Screen name="junior-new" options={{ href: null, title: "New junior account" }} />
      <Tabs.Screen name="invites" options={{ href: null, title: "Invitations" }} />
      <Tabs.Screen name="privacy" options={{ href: null, title: "Privacy" }} />
    </Tabs>
  );
}
