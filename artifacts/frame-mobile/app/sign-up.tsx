import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
      const msg =
        (e as Error)?.message ?? "Sign-up failed.";
      setError(msg.includes("409") || msg.includes("already exists")
        ? "An account with that email already exists."
        : msg);
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
        <Text style={styles.wordmark}>FRAME</Text>
        <Text style={styles.sub}>CALIBRATION SYSTEM</Text>

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
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
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

        <Link href="/sign-in" asChild>
          <Pressable style={styles.linkBtn}>
            <Text style={styles.linkText}>
              Already in —{" "}
              <Text style={styles.linkHighlight}>sign in</Text>
            </Text>
          </Pressable>
        </Link>
      </ScrollView>
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
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 28,
    letterSpacing: 10,
    color: "#e0e0e0",
    marginBottom: 4,
  },
  sub: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 4,
    color: "#444",
    marginBottom: 64,
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
  errorText: {
    color: "#BF1D1D",
    fontFamily: "Outfit",
    fontSize: 13,
    textAlign: "center",
  },
  btn: {
    backgroundColor: "#C9883A",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    marginTop: 8,
  },
  btnPressed: {
    opacity: 0.85,
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
    color: "#C9883A",
  },
});
