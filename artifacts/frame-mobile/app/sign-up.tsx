import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AI_CONSENT_DISCLOSURE,
  AI_CONSENT_VERSION,
} from "@workspace/ai-consent";
import { useAuth } from "@/context/AuthContext";
import { apiPost, apiUrl } from "@/lib/api";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { Button, Display, Eyebrow, FadeIn, Field, GlassCard, Screen } from "@/components/ui";
import { fonts, palette, space } from "@/constants/theme";

export default function SignUpScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);

  const signupConsentStatus: AiConsentStatus = {
    accepted: false,
    version: AI_CONSENT_VERSION,
    acceptedAt: null,
    disclosure: AI_CONSENT_DISCLOSURE,
  };

  function handleSignUp() {
    if (loading || !email || password.length < 8 || !acceptedLegal) return;
    setError(null);
    setShowAiConsent(true);
  }

  async function createAccount() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ token: string; userId: string }>(
        "/auth/register",
        {
          email,
          password,
          acceptedTerms: acceptedLegal,
          acceptedPrivacy: acceptedLegal,
          acceptedAiConsent: true,
          aiConsentVersion: AI_CONSENT_VERSION,
        },
      );
      await signIn(data.token);
      router.replace("/onboarding");
    } catch (e: unknown) {
      setError(getAuthErrorMessage(e, "sign-up"));
    } finally {
      setLoading(false);
    }
  }

  const submitDisabled = loading || !email || !password || !acceptedLegal || password.length < 8;

  return (
    <Screen>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
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
            <Eyebrow style={{ color: palette.goldLight }}>New athlete</Eyebrow>
            <Display size="heading" style={styles.heading}>
              Build your frame.
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
                placeholder="Password (min 8 characters)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
              />
              <Pressable
                style={styles.legalRow}
                onPress={() => setAcceptedLegal((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityLabel="Accept the Terms of Service and Privacy Policy"
                accessibilityState={{ checked: acceptedLegal }}
              >
                <View style={[styles.checkbox, acceptedLegal && styles.checkboxChecked]}>
                  <Text style={styles.checkmark}>{acceptedLegal ? "✓" : ""}</Text>
                </View>
                <Text style={styles.legalCopy}>
                  I accept the Terms of Service and Privacy Policy.
                </Text>
              </Pressable>
              <View style={styles.policyLinks}>
                <Pressable
                  style={styles.policyBtn}
                  onPress={() => void Linking.openURL(apiUrl("/terms"))}
                >
                  <Text style={styles.policyLink}>VIEW TERMS</Text>
                </Pressable>
                <Pressable
                  style={styles.policyBtn}
                  onPress={() => void Linking.openURL(apiUrl("/privacy"))}
                >
                  <Text style={styles.policyLink}>VIEW PRIVACY & AI DATA USE</Text>
                </Pressable>
              </View>

              {error ? (
                <Text style={styles.errorText} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}

              <Button
                title="CREATE ACCOUNT"
                onPress={handleSignUp}
                loading={loading}
                disabled={submitDisabled}
              />
            </View>
          </GlassCard>
        </FadeIn>

        <FadeIn index={2}>
          <Link href="/sign-in" asChild>
            <Pressable style={styles.linkBtn} accessibilityRole="link">
              <Text style={styles.linkText}>
                Already in —{" "}
                <Text style={styles.linkHighlight}>sign in</Text>
              </Text>
            </Pressable>
          </Link>
        </FadeIn>
      </ScrollView>
      <AiConsentModal
        visible={showAiConsent}
        status={signupConsentStatus}
        disclosure={AI_CONSENT_DISCLOSURE}
        signup
        busy={loading}
        onAccept={() => void createAccount()}
        onDecline={() => {
          if (!loading) setShowAiConsent(false);
        }}
        onPrivacy={() => void Linking.openURL(apiUrl("/privacy"))}
        onTerms={() => void Linking.openURL(apiUrl("/terms"))}
      />
    </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { alignItems: "center", paddingHorizontal: 24 },
  brand: { alignItems: "center" },
  logo: { width: 64, height: 64, marginBottom: 10 },
  wordmarkImg: { width: 170, height: 52, marginBottom: 24 },
  cardWrap: { width: "100%", maxWidth: 440 },
  heading: { marginTop: 6, marginBottom: space.xl },
  form: { gap: 16 },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.glassEdgeHi,
    backgroundColor: palette.glass,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.goldLight,
  },
  checkmark: { color: "#050505", fontSize: 14, fontWeight: "700" },
  legalCopy: {
    flex: 1,
    color: palette.textMid,
    fontFamily: fonts.text,
    fontSize: 13,
    lineHeight: 19,
  },
  policyLinks: { flexDirection: "row", flexWrap: "wrap", columnGap: 16 },
  policyBtn: { minHeight: 44, justifyContent: "center" },
  policyLink: {
    color: palette.goldLight,
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.4,
  },
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
