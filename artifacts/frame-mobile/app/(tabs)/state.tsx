import { useRouter } from "expo-router";
import React from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StateOrb } from "@/components/StateOrb";
import { Body, Button, EmptyState, FadeIn, Punch, Screen } from "@/components/ui";
import { fonts, palette, SCREEN_PAD } from "@/constants/theme";
import { useToday } from "@/hooks/useToday";
import { STATE_CALIBRATION_SENTENCE, STATE_ENTER_LABEL, STATE_LABEL } from "@/lib/stateCopy";
import { stateHeadline } from "@/lib/today";
import { FrameLogo } from "@/components/FrameLogo";

export default function StateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const todayQuery = useToday();
  const state = todayQuery.data?.state ?? null;
  const current = !!state?.current && !!state.name;

  const { width } = useWindowDimensions();
  const orbSize = Math.round(Math.min(width * 0.6, 260));
  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 96;

  const loading = todayQuery.isLoading;
  const failed = todayQuery.isError && !todayQuery.data;

  return (
    <Screen light="silver" focus="center" intensity={0.9}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <FrameLogo height={16} />
        </View>

        {failed ? (
          <View style={styles.pad}>
            <EmptyState
              kind="error"
              title="Couldn't load your state"
              body="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => void todayQuery.refetch()}
            />
          </View>
        ) : (
          <View style={styles.center}>
            <StateOrb size={orbSize} stateLabel={state?.name ?? "Dormant"} />

            <FadeIn style={styles.stateBlock}>
              <Text style={styles.label}>{STATE_LABEL}</Text>
              <Punch style={[styles.stateName, (loading || !current) && { color: palette.textLow }]}>
                {loading ? "Reading…" : state ? stateHeadline(state) : "No read yet"}
              </Punch>
              <Body style={styles.sentence}>{STATE_CALIBRATION_SENTENCE}</Body>
              {/* Enter is the old primary button under the orb: it opens the coach chat (the app's main surface). */}
              <Button title={STATE_ENTER_LABEL} onPress={() => router.push("/(tabs)/chat")} style={styles.enter} />
            </FadeIn>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 8,
  },
  wordmarkImg: { width: 92, height: 26, tintColor: palette.text },
  pad: { paddingHorizontal: SCREEN_PAD, marginTop: 16 },
  center: { alignItems: "center", paddingTop: 8 },
  stateBlock: { alignItems: "center", gap: 8, paddingHorizontal: SCREEN_PAD + 4, marginTop: 8, alignSelf: "stretch" },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: palette.textMid, textAlign: "center" },
  stateName: { textAlign: "center" },
  sentence: { textAlign: "center", fontSize: 16, lineHeight: 23, color: palette.textMid },
  enter: { alignSelf: "stretch", marginTop: 12 },
});
