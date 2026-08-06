import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { apiPost } from "@/lib/api";

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
      setError(msg.includes("401") || msg.includes("Incorrect")
        ? "Incorrect email or password."
        : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 60 }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
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
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={handleSignIn}
            disabled={loading || !email || !password}
          >
            {loading ? (
              <ActivityIndicator color="#050505" />
            ) : (
              <Text style={styles.btnText}>ENTER</Text>
            )}
          </Pressable>
        </View>

        <Link href="/sign-up" asChild>
          <Pressable style={styles.linkBtn}>
            <Text style={styles.linkText}>
              No account —{" "}
              <Text style={styles.linkHighlight}>create one</Text>
            </Text>
          </Pressable>
        </Link>
      </View>
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
    flex: 1,
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
    fontSize: 13,
    letterSpacing: 4,
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
