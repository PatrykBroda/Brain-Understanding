import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { apiPost } from "@/lib/api";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { Button, Display, Eyebrow, FadeIn, Field, GlassCard, Screen } from "@/components/ui";
import { fonts, palette, space } from "@/constants/theme";

export default function SignInScreen() {
  const { signIn, sessionRestoreError } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ token: string; userId: string }>(
        "/auth/login",
        { email, password },
      );
      await signIn(data.token);
      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      setError(getAuthErrorMessage(e, "sign-in"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.inner,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FadeIn index={0} style={styles.brand}>
            <Image
              source={require("../assets/images/frame-logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Image
              source={require("../assets/images/frame-wordmark.png")}
              style={styles.wordmarkImg}
              resizeMode="contain"
            />
          </FadeIn>

          <FadeIn index={1} style={styles.cardWrap}>
            <GlassCard radius={32} padding={space.xl} blur>
              <Eyebrow style={{ color: palette.goldLight }}>Welcome back</Eyebrow>
              <Display size="heading" style={styles.heading}>
                Step back into your frame.
              </Display>
              <View style={styles.form}>
                <Field
                  label="Email"
                  placeholder="Email"
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

                {error || sessionRestoreError ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {error ?? sessionRestoreError}
                  </Text>
                ) : null}

                <Button
                  title="ENTER"
                  onPress={handleSignIn}
                  loading={loading}
                  disabled={!email || !password}
                  style={{ marginTop: space.sm }}
                />
              </View>
            </GlassCard>
          </FadeIn>

          <FadeIn index={2}>
            <Link href="/sign-up" asChild>
              <Pressable style={styles.linkBtn} accessibilityRole="link">
                <Text style={styles.linkText}>
                  No account —{" "}
                  <Text style={styles.linkHighlight}>create one</Text>
                </Text>
              </Pressable>
            </Link>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { alignItems: "center", paddingHorizontal: 24 },
  brand: { alignItems: "center" },
  logo: { width: 72, height: 72, marginBottom: 12 },
  wordmarkImg: { width: 180, height: 56, marginBottom: 32 },
  cardWrap: { width: "100%", maxWidth: 440 },
  heading: { marginTop: 6, marginBottom: space.xl },
  form: { gap: 16 },
  errorText: {
    color: palette.redLight,
    fontFamily: fonts.text,
    fontSize: 13,
    textAlign: "center",
  },
  linkBtn: { marginTop: 28, minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  linkText: { fontFamily: fonts.text, fontSize: 14, color: palette.textMid },
  linkHighlight: { color: palette.goldLight, fontFamily: fonts.textMedium },
});
