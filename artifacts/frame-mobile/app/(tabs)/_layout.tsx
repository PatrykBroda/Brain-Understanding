import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Image, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFighter } from "@/context/FighterContext";
import { LinearGradient } from "expo-linear-gradient";
import { fonts, gradients, palette } from "@/constants/theme";

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
        tabBarActiveTintColor: palette.goldLight,
        tabBarInactiveTintColor: palette.textLow,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : palette.graphite0,
          borderTopWidth: 1,
          borderTopColor: palette.glassEdge,
          elevation: 0,
          paddingBottom: isWeb ? 0 : insets.bottom,
          height: isWeb ? 84 : 56 + insets.bottom,
        },
        tabBarBackground: () => (
          <>
            {isIOS ? (
              <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
            ) : null}
            <LinearGradient
              colors={gradients.tabBar}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        ),
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: fonts.textMedium,
          fontSize: 10,
          letterSpacing: 1.2,
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
          title: "HOME",
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="state"
        options={{
          title: "STATE",
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
          title: "CHAT",
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analyse"
        options={{
          title: "ANALYSE",
          tabBarIcon: ({ color }) => <Feather name="film" size={20} color={color} />,
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
