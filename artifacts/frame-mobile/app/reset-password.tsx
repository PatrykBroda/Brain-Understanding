import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPost } from "@/lib/api";
import { getAuthErrorMessage } from "@/lib/authErrors";
import {
  RESET_CODE_LENGTH,
  sanitizeResetCode,
  validateForgotEmail,
  validateResetForm,
} from "@/lib/resetPasswordForm";
import { EntryBrand } from "@/components/EntryBrand";
import { FormScroll } from "@/components/FormScroll";
import { Button, Display, FadeIn, AuthPanel, Field, Screen, VideoBackdrop } from "@/components/entry";
import { fonts, palette, SCREEN_PAD, space } from "@/constants/entryTheme";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState(false);

  const fieldErrors = validateResetForm({ code, password, confirm });
  const emailError = attempted ? validateForgotEmail(email) : null;

  async function handleReset() {
    if (loading) return;
    setAttempted(true);
    setError(null);
    if (validateForgotEmail(email) || Object.keys(fieldErrors).length > 0) return;
    setLoading(true);
    try {
      await apiPost("/auth/reset-password", {
        email: email.trim(),
        code: sanitizeResetCode(code),
        newPassword: password,
      });
      setDone(true);
    } catch (e: unknown) {
      setError(getAuthErrorMessage(e, "reset-password"));
    } finally {
      setLoading(false);
    }
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
              {done ? (
                <>
                  <Display size="title">Password updated</Display>
                  <Text style={styles.sub} accessibilityRole="alert">
                    Your password has been changed. Sign in with your new password.
                  </Text>
                  <Button title="Back to sign in" onPress={() => router.replace("/sign-in")} />
                </>
              ) : (
                <>
                  <Display size="title">Enter your code</Display>
                  <Text style={styles.sub}>Enter the 6-digit code we emailed you and choose a new password.</Text>
                  <View style={styles.form}>
                    {params.email ? null : (
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
                        error={emailError}
                      />
                    )}
                    <Field
                      label="Code"
                      placeholder="123456"
                      value={code}
                      onChangeText={(v) => setCode(sanitizeResetCode(v))}
                      keyboardType="number-pad"
                      maxLength={RESET_CODE_LENGTH + 1}
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      error={attempted ? fieldErrors.code : undefined}
                    />
                    <Field
                      label="New password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete="new-password"
                      textContentType="newPassword"
                      error={password.length > 0 || attempted ? fieldErrors.password : undefined}
                    />
                    <Field
                      label="Confirm new password"
                      placeholder="Re-enter your password"
                      value={confirm}
                      onChangeText={setConfirm}
                      secureTextEntry
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="go"
                      onSubmitEditing={() => void handleReset()}
                      error={confirm.length > 0 || attempted ? fieldErrors.confirm : undefined}
                    />
                    {error ? (
                      <Text style={styles.errorText} accessibilityRole="alert">
                        {error}
                      </Text>
                    ) : null}
                    <Button title="Reset password" onPress={() => void handleReset()} loading={loading} />
                    <Button
                      title="Send a new code"
                      variant="ghost"
                      onPress={() =>
                        router.replace({
                          pathname: "/forgot-password",
                          params: email.trim() ? { email: email.trim() } : {},
                        })
                      }
                    />
                  </View>
                </>
              )}
            </AuthPanel>
            {done ? null : (
              <Button
                title="Back to sign in"
                variant="ghost"
                onPress={() => router.replace("/sign-in")}
                style={{ marginTop: space.sm }}
              />
            )}
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
