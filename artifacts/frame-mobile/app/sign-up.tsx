import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
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
import { hasSignUpErrors, validateSignUp } from "@/lib/signUpForm";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { EntryBrand } from "@/components/EntryBrand";
import { Button, Display, FadeIn, AuthPanel, Field, Screen, VideoBackdrop } from "@/components/ui";
import { fonts, MIN_TAP, palette, SCREEN_PAD, space } from "@/constants/theme";

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
  const [attempted, setAttempted] = useState(false);

  const signupConsentStatus: AiConsentStatus = {
    accepted: false,
    version: AI_CONSENT_VERSION,
    acceptedAt: null,
    disclosure: AI_CONSENT_DISCLOSURE,
  };

  function handleSignUp() {
    if (loading) return;
    setAttempted(true);
    setError(null);
    if (hasSignUpErrors(validateSignUp({ email, password, acceptedLegal }))) return;
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
          email: email.trim(),
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

  const formErrors = validateSignUp({ email, password, acceptedLegal });
  // Show a problem once the field was used (password length) or after the first Create account tap.
  const passwordError = password.length > 0 || attempted ? formErrors.password : undefined;
  const emailError = attempted ? formErrors.email : undefined;
  const legalError = attempted ? formErrors.legal : undefined;

  return (
    <Screen light={null}>
      <VideoBackdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FadeIn index={0}>
            <EntryBrand compact />
          </FadeIn>

          <FadeIn index={1} style={styles.cardWrap}>
            <AuthPanel>
              <Display size="title">Create your account</Display>
              <Text style={styles.sub}>AI coaching for fighters and athletes.</Text>
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
                  textContentType="emailAddress"
                  error={emailError}
                />
                <Field
                  label="Password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  error={passwordError}
                />
                <Pressable
                  style={styles.legalRow}
                  onPress={() => setAcceptedLegal((value) => !value)}
                  accessibilityRole="checkbox"
                  accessibilityLabel="Accept the Terms of Service and Privacy Policy"
                  accessibilityState={{ checked: acceptedLegal }}
                >
                  <View style={[styles.checkbox, acceptedLegal && styles.checkboxChecked]}>
                    {acceptedLegal ? <Feather name="check" size={16} color={palette.onGold} /> : null}
                  </View>
                  <Text style={styles.legalCopy}>I accept the Terms of Service and Privacy Policy.</Text>
                </Pressable>
                {legalError ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {legalError}
                  </Text>
                ) : null}
                <View style={styles.policyLinks}>
                  <Pressable
                    style={styles.policyBtn}
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(apiUrl("/terms"))}
                  >
                    <Text style={styles.policyLink}>Terms of Service</Text>
                  </Pressable>
                  <Pressable
                    style={styles.policyBtn}
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(apiUrl("/privacy"))}
                  >
                    <Text style={styles.policyLink}>Privacy and AI data use</Text>
                  </Pressable>
                </View>

                {error ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}

                <Button title="Create account" onPress={handleSignUp} loading={loading} />
              </View>
            </AuthPanel>
            <Button
              title="Have an account? Sign in"
              variant="ghost"
              onPress={() => router.replace("/sign-in")}
              style={{ marginTop: space.sm }}
            />
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
  inner: { paddingHorizontal: SCREEN_PAD + 2, flexGrow: 1, justifyContent: "space-between" },
  cardWrap: { width: "100%", maxWidth: 440, alignSelf: "center", marginTop: space.xl },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: palette.textMid, marginTop: space.xs, marginBottom: space.xl },
  form: { gap: space.lg },
  legalRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: MIN_TAP },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: palette.gold, borderColor: palette.gold },
  legalCopy: { flex: 1, color: palette.textMid, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  policyLinks: { flexDirection: "row", flexWrap: "wrap", columnGap: 20 },
  policyBtn: { minHeight: MIN_TAP, justifyContent: "center" },
  policyLink: { color: palette.goldPale, fontFamily: fonts.medium, fontSize: 14, textDecorationLine: "underline" },
  errorText: { color: palette.redText, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
});
