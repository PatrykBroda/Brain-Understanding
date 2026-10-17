import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EntryBrand } from "@/components/EntryBrand";
import { Body, Button, Display, FadeIn, AuthPanel, Field, Punch, Screen, VideoBackdrop } from "@/components/ui";
import { fonts, palette, SCREEN_PAD, space } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiPost } from "@/lib/api";
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

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ token: string; userId: string }>("/auth/login", { email, password });
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
              <Punch style={styles.headline}>Your corner team between training sessions.</Punch>
              <Body style={styles.sub}>AI coaching for fighters and athletes.</Body>
              {message ? (
                <Text style={styles.errorText} accessibilityRole="alert">
                  {message}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button
                  title="Sign in"
                  variant="secondary"
                  onPress={() => setShowForm(true)}
                  style={styles.signInBtn}
                />
                <Button
                  title="Get started"
                  onPress={() => router.push("/sign-up")}
                  style={styles.startBtn}
                />
              </View>
            </FadeIn>
          ) : (
            <FadeIn index={1} style={styles.band}>
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
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                  <Field
                    label="Password"
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="password"
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
                    disabled={!email || !password}
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
  band: { width: "100%", maxWidth: 440, alignSelf: "center", marginTop: space.xxl },
  headline: { fontSize: 36, lineHeight: 40, letterSpacing: -1.2 },
  sub: { marginTop: space.md, fontSize: 17, lineHeight: 24, color: palette.textMid },
  actions: { flexDirection: "row", gap: space.md, marginTop: space.xl },
  signInBtn: { flex: 1 },
  startBtn: { flex: 1.35 },
  formTitle: { marginBottom: space.lg },
  form: { gap: space.lg },
  formLinks: { flexDirection: "row", justifyContent: "space-between", marginTop: space.sm },
  errorText: { color: palette.redText, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: space.md },
});
