import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EntryBrand } from "@/components/EntryBrand";
import { SUBLINE, TrainWithFrame } from "@/components/TrainWithFrame";
import { Body, Button, Display, FadeIn, AuthPanel, Field, Punch, Screen, VideoBackdrop } from "@/components/entry";
import { fonts, palette, SCREEN_PAD, space } from "@/constants/entryTheme";
import { useAuth } from "@/context/AuthContext";
import { apiPost, apiUrl } from "@/lib/api";
import { getAuthErrorMessage } from "@/lib/authErrors";

/**
 * Entry screen. Two states of one screen so returning users are never more than
 * one tap from their account: the welcome (headline, sub-line, "Get started"
 * primary + "Sign in" ghost) and the sign-in form. Monochrome loop behind a
 * dark scrim; the form sits on a dark translucent panel so it reads over any frame.
 */
export default function SignInScreen() {
  const { signIn, sessionRestoreError } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (loading) return;
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ token: string; userId: string }>("/auth/login", { email: email.trim(), password });
      await signIn(data.token);
      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      setError(getAuthErrorMessage(e, "sign-in"));
    } finally {
      setLoading(false);
    }
  }

  const message = error ?? sessionRestoreError;

  return (
    <Screen light={null}>
      <VideoBackdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.inner,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FadeIn index={0}>
            <EntryBrand />
          </FadeIn>

          {!showForm ? (
            <FadeIn index={1} style={styles.band}>
              <TrainWithFrame width={Math.min(400, screenW - 2 * (SCREEN_PAD + 2))} />
              <Body style={styles.sub}>{SUBLINE}</Body>
              {message ? (
                <Text style={styles.errorText} accessibilityRole="alert">
                  {message}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button
                  title="Sign up"
                  onPress={() => router.push("/sign-up")}
                  style={styles.startBtn}
                />
                <Button
                  title="Log in"
                  variant="secondary"
                  onPress={() => setShowForm(true)}
                  style={styles.signInBtn}
                />
              </View>
              <View style={styles.legalRow}>
                <Pressable accessibilityRole="link" hitSlop={8} onPress={() => void Linking.openURL(apiUrl("/terms"))} style={styles.legalBtn}>
                  <Text style={styles.legalLink}>Terms</Text>
                </Pressable>
                <Text style={styles.legalDot}>·</Text>
                <Pressable accessibilityRole="link" hitSlop={8} onPress={() => void Linking.openURL(apiUrl("/privacy"))} style={styles.legalBtn}>
                  <Text style={styles.legalLink}>Privacy</Text>
                </Pressable>
              </View>
            </FadeIn>
          ) : (
            <FadeIn index={1} style={[styles.band, styles.formBand]}>
              <AuthPanel>
                <Display size="title" style={styles.formTitle}>
                  Welcome back
                </Display>
                <View style={styles.form}>
                  <Field
                    label="Email"
                    placeholder="you@example.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="username"
                  />
                  <Field
                    label="Password"
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="current-password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={handleSignIn}
                  />
                  {message ? (
                    <Text style={styles.errorText} accessibilityRole="alert">
                      {message}
                    </Text>
                  ) : null}
                  <Button
                    title="Sign in"
                    onPress={handleSignIn}
                    loading={loading}
                    style={{ marginTop: space.sm }}
                  />
                </View>
              </AuthPanel>
              <View style={styles.formLinks}>
                <Button title="Back" variant="ghost" onPress={() => setShowForm(false)} />
                <Button title="Create account" variant="ghost" onPress={() => router.push("/sign-up")} />
              </View>
            </FadeIn>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { paddingHorizontal: SCREEN_PAD + 2, flexGrow: 1, justifyContent: "space-between" },
  band: { width: "100%", maxWidth: 440, alignSelf: "center", marginTop: space.xxl, alignItems: "stretch" },
  // Sign-in form sits in the vertical middle of the screen (Patryk, 19 Oct);
  // the bottom pad offsets the brand row so it centres on the screen, not the leftover space.
  formBand: { flex: 1, justifyContent: "center", marginTop: 0, paddingBottom: 56 },
  headline: { fontSize: 36, lineHeight: 40, letterSpacing: -1.2 },
  sub: { marginTop: space.lg, fontSize: 17, lineHeight: 24, color: palette.textHi, textAlign: "center" },
  actions: { flexDirection: "row", gap: space.md, marginTop: space.xl },
  signInBtn: { flex: 1 },
  startBtn: { flex: 1.35 },
  formTitle: { marginBottom: space.lg },
  form: { gap: space.lg },
  formLinks: { flexDirection: "row", justifyContent: "space-between", marginTop: space.sm },
  legalRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: space.lg },
  legalBtn: { minHeight: 44, minWidth: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  legalLink: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid, textDecorationLine: "underline" },
  legalDot: { color: palette.textLow },
  errorText: { color: palette.redText, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: space.md },
});
