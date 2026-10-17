import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFighter } from "@/context/FighterContext";
import { LinearGradient } from "expo-linear-gradient";
import { fonts, gradients, palette } from "@/constants/theme";
import { haptic } from "@/components/ui/haptics";
import { refreshModel } from "@/lib/modelRefresh";

/** One icon family (Feather, 1.75 stroke feel at 22pt). Active tab = off-white + a short gold bar above. */
function TabIcon({ name, color, focused }: { name: React.ComponentProps<typeof Feather>["name"]; color: string; focused: boolean }) {
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: 18,
          height: 2,
          borderRadius: 1,
          marginBottom: 5,
          backgroundColor: focused ? palette.gold : "transparent",
        }}
      />
      <Feather name={name} size={22} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { fighter, isLoading, error } = useFighter();
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
      screenListeners={{
        tabPress: () => haptic.select(),
        focus: () => refreshModel(qc),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.textHi,
        tabBarInactiveTintColor: palette.textMid,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : palette.bg,
          borderTopWidth: 1,
          borderTopColor: palette.border,
          elevation: 0,
          paddingBottom: isWeb ? 0 : insets.bottom,
          height: isWeb ? 84 : 60 + insets.bottom,
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
          fontSize: 12.5,
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
          tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="state"
        options={{
          title: "State",
          tabBarIcon: ({ color, focused }) => <TabIcon name="disc" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, focused }) => <TabIcon name="message-circle" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analyse"
        options={{
          title: "Analyse",
          tabBarIcon: ({ color, focused }) => <TabIcon name="film" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: "Camp",
          tabBarIcon: ({ color, focused }) => <TabIcon name="calendar" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
