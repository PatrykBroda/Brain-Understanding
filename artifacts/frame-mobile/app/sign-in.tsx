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

export default function SignInScreen() {
  const { signIn } = useAuth();
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
      signIn(data.token);
      router.replace("/(tabs)/home");
    } catch (e: unknown) {
      const msg =
        (e as Error)?.message ?? "Sign-in failed. Check your credentials.";
      setError(
        msg.includes("401") || msg.includes("Incorrect")
          ? "Incorrect email or password."
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
      {/* Amber radial hint */}
      <View style={styles.amberHint} />

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
                <Text style={styles.cardTitle}>SIGN IN TO FRAME</Text>
                <Text style={styles.cardSub}>WELCOME BACK</Text>
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
                    autoComplete="current-password"
                    returnKeyType="go"
                    onSubmitEditing={handleSignIn}
                  />
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
                  onPress={handleSignIn}
                  disabled={loading || !email || !password}
                >
                  {loading ? (
                    <ActivityIndicator color="#050505" />
                  ) : (
                    <Text style={styles.btnText}>SIGN IN</Text>
                  )}
                </Pressable>
              </View>

              {/* Card footer */}
              <View style={styles.cardFooter}>
                <Link href="/sign-up" asChild>
                  <Pressable>
                    <Text style={styles.cardFooterText}>
                      No account?{" "}
                      <Text style={styles.cardFooterLink}>Create one</Text>
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </View>
          </ScrollView>

          {/* Page footer */}
          <View style={styles.pageFooter}>
            <Text style={styles.pageFooterText}>
              SIGN IN WITH YOUR FRAME EMAIL AND PASSWORD.
            </Text>
          </View>
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
  amberHint: {
    ...StyleSheet.absoluteFillObject,
    // Faint amber glow at top-centre
    backgroundColor: "transparent",
    // Not possible to do radial in RN directly; handled by the image + wash combo
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
    fontSize: 13,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "300",
    marginBottom: 6,
  },
  cardSub: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.55)",
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
  pageFooter: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: "center",
  },
  pageFooterText: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.40)",
    textAlign: "center",
  },
});
