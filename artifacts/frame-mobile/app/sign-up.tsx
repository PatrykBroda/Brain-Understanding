import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
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

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
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
            <Pressable onPress={() => void Linking.openURL(apiUrl("/terms"))}>
              <Text style={styles.policyLink}>VIEW TERMS</Text>
            </Pressable>
            <Pressable onPress={() => void Linking.openURL(apiUrl("/privacy"))}>
              <Text style={styles.policyLink}>VIEW PRIVACY & AI DATA USE</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.btn,
              pressed && styles.btnPressed,
              (loading ||
                !email ||
                !password ||
                 !acceptedLegal ||
                 password.length < 8) &&
                styles.btnDisabled,
            ]}
            onPress={handleSignUp}
            disabled={
              loading ||
              !email ||
              !password ||
               !acceptedLegal ||
               password.length < 8
            }
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                loading ||
                !email ||
                !password ||
                !acceptedLegal ||
                password.length < 8,
              busy: loading,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#050505" />
            ) : (
              <Text style={styles.btnText}>CREATE ACCOUNT</Text>
            )}
          </Pressable>
        </View>

        <Link href="/sign-in" asChild>
          <Pressable style={styles.linkBtn}>
            <Text style={styles.linkText}>
              Already in —{" "}
              <Text style={styles.linkHighlight}>sign in</Text>
            </Text>
          </Pressable>
        </Link>
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
    paddingHorizontal: 32,
  },
  inner: {
    alignItems: "center",
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: 20,
  },
  wordmarkImg: {
    width: 200,
    height: 64,
    marginBottom: 56,
  },
  form: {
    width: "100%",
    gap: 12,
  },
  input: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    height: 52,
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#8A6A2F",
    borderColor: "#8A6A2F",
  },
  checkmark: {
    color: "#050505",
    fontSize: 14,
    fontWeight: "700",
  },
  legalCopy: {
    flex: 1,
    color: "#aaa",
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 19,
  },
  policyLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  policyLink: {
    color: "#8A6A2F",
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
  },
  errorText: {
    color: "#BF1D1D",
    fontFamily: "Outfit",
    fontSize: 13,
    textAlign: "center",
  },
  btn: {
    backgroundColor: "#8A6A2F",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    marginTop: 8,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    letterSpacing: 3,
    color: "#050505",
  },
  linkBtn: {
    marginTop: 32,
    paddingVertical: 8,
  },
  linkText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#666",
  },
  linkHighlight: {
    color: "#8A6A2F",
  },
});
