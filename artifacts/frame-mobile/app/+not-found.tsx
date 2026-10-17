import { Link, Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Display, Eyebrow, GlassCard, Screen } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <Screen>
        <View style={styles.container}>
          <GlassCard radius={32} padding={28} style={styles.card}>
            <Eyebrow style={styles.eyebrow}>404</Eyebrow>
            <Display size="heading" style={styles.title}>
              This screen doesn&apos;t exist.
            </Display>

            <Link href="/" asChild>
              <Pressable accessibilityRole="link" style={styles.link}>
                <Text style={styles.linkText}>Go to home screen!</Text>
              </Pressable>
            </Link>
          </GlassCard>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: { width: "100%", maxWidth: 420, alignItems: "stretch" },
  eyebrow: { color: palette.goldLight, textAlign: "center" },
  title: { textAlign: "center", marginTop: 8 },
  link: {
    marginTop: 24,
    minHeight: MIN_TAP,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.goldWash,
    borderWidth: 1,
    borderColor: palette.goldHair,
  },
  linkText: {
    fontFamily: fonts.textMedium,
    fontSize: 14,
    letterSpacing: 0.6,
    color: palette.goldPale,
  },
});
