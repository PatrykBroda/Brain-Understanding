import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { apiPost } from "@/lib/api";

const heroImage = require("../assets/images/login-hero.jpg");

export default function SignUpScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignUp() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ token: string; userId: string }>(
        "/auth/register",
        { email, password },
      );
      signIn(data.token);
      router.replace("/onboarding");
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "Sign-up failed.";
      setError(
        msg.includes("409") || msg.includes("already exists")
          ? "An account with that email already exists."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ImageBackground source={heroImage} style={styles.bg} resizeMode="cover">
      {/* Dark wash */}
      <View style={styles.wash} />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.shell,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerCenter}>
              <Text style={styles.wordmark}>FRAME</Text>
              <Text style={styles.tagline}>The coach that remembers.</Text>
            </View>
          </View>

          {/* Scrollable body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Card */}
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>CREATE YOUR FRAME ACCOUNT</Text>
                <Text style={styles.cardSub}>The coach that remembers.</Text>
              </View>

              <View style={styles.cardBody}>
                {/* Email field */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>EMAIL</Text>
                  <TextInput
                    style={styles.input}
                    placeholder=""
                    placeholderTextColor="#555"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    returnKeyType="next"
                  />
                </View>

                {/* Password field */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>PASSWORD</Text>
                  <TextInput
                    style={styles.input}
                    placeholder=""
                    placeholderTextColor="#555"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="new-password"
                    returnKeyType="go"
                    onSubmitEditing={handleSignUp}
                  />
                  <Text style={styles.hint}>Minimum 8 characters</Text>
                </View>

                {error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    pressed && styles.btnPressed,
                    (loading || !email || !password) && styles.btnDisabled,
                  ]}
                  onPress={handleSignUp}
                  disabled={loading || !email || !password}
                >
                  {loading ? (
                    <ActivityIndicator color="#050505" />
                  ) : (
                    <Text style={styles.btnText}>CREATE ACCOUNT</Text>
                  )}
                </Pressable>
              </View>

              {/* Card footer */}
              <View style={styles.cardFooter}>
                <Link href="/sign-in" asChild>
                  <Pressable>
                    <Text style={styles.cardFooterText}>
                      Already have an account?{" "}
                      <Text style={styles.cardFooterLink}>Sign in</Text>
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: "#000",
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  kav: {
    flex: 1,
  },
  shell: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  headerCenter: {
    alignItems: "center",
  },
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 14,
    letterSpacing: 8,
    color: "rgba(255,255,255,0.95)",
    marginBottom: 4,
  },
  tagline: {
    fontFamily: "Outfit",
    fontSize: 10,
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.45)",
    fontStyle: "italic",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  card: {
    backgroundColor: "rgba(15,15,15,0.92)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  cardTop: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: "center",
  },
  cardTitle: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "300",
    marginBottom: 6,
    textAlign: "center",
  },
  cardSub: {
    fontFamily: "Outfit",
    fontSize: 10,
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.55)",
    fontStyle: "italic",
  },
  cardBody: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.70)",
  },
  input: {
    backgroundColor: "rgba(24,24,24,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 48,
  },
  hint: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.40)",
    marginTop: 2,
  },
  errorText: {
    color: "#BF1D1D",
    fontFamily: "Outfit",
    fontSize: 12,
  },
  btn: {
    backgroundColor: "#C9883A",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    marginTop: 4,
    shadowColor: "rgba(201,136,58,0.4)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 4,
    color: "#050505",
  },
  cardFooter: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  cardFooterText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 0.5,
    color: "rgba(255,255,255,0.55)",
  },
  cardFooterLink: {
    color: "#C9883A",
  },
});
