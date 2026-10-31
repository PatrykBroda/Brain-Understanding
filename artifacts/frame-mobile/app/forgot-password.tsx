import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPost } from "@/lib/api";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { validateForgotEmail } from "@/lib/resetPasswordForm";
import { EntryBrand } from "@/components/EntryBrand";
import { FormScroll } from "@/components/FormScroll";
import { Button, Display, FadeIn, AuthPanel, Field, Screen, VideoBackdrop } from "@/components/entry";
import { fonts, palette, SCREEN_PAD, space } from "@/constants/entryTheme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (loading) return;
    const problem = validateForgotEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiPost("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (e: unknown) {
      setError(getAuthErrorMessage(e, "forgot-password"));
    } finally {
      setLoading(false);
    }
  }

  function goToReset() {
    router.replace({ pathname: "/reset-password", params: email.trim() ? { email: email.trim() } : {} });
  }

  return (
    <Screen light={null}>
      <VideoBackdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <FormScroll
          contentContainerStyle={[styles.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        >
          <FadeIn index={0}>
            <EntryBrand compact />
          </FadeIn>

          <FadeIn index={1} style={styles.cardWrap}>
            <AuthPanel>
              <Display size="title">Reset your password</Display>
              {sent ? (
                <>
                  <Text style={styles.sub} accessibilityRole="alert">
                    If that email is registered, we've sent a 6-digit code to it. It expires in 30 minutes.
                  </Text>
                  <Button title="Enter code" onPress={goToReset} />
                </>
              ) : (
                <>
                  <Text style={styles.sub}>Enter your email and we'll send you a 6-digit code.</Text>
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
                      returnKeyType="go"
                      onSubmitEditing={() => void handleSend()}
                    />
                    {error ? (
                      <Text style={styles.errorText} accessibilityRole="alert">
                        {error}
                      </Text>
                    ) : null}
                    <Button title="Send code" onPress={() => void handleSend()} loading={loading} />
                    <Button title="I already have a code" variant="ghost" onPress={goToReset} />
                  </View>
                </>
              )}
            </AuthPanel>
            <Button
              title="Back to sign in"
              variant="ghost"
              onPress={() => router.replace("/sign-in")}
              style={{ marginTop: space.sm }}
            />
          </FadeIn>
        </FormScroll>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { paddingHorizontal: SCREEN_PAD + 2, flexGrow: 1, justifyContent: "space-between" },
  cardWrap: { width: "100%", maxWidth: 440, alignSelf: "center", marginTop: space.xl },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: palette.textMid, marginTop: space.xs, marginBottom: space.xl },
  form: { gap: space.lg },
  errorText: { color: palette.redText, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
});
