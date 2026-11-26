import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { apiPost } from "@/lib/api";
import { Button, Field, Screen } from "@/components/entry";
import { palette } from "@/constants/entryTheme";
import { errMsg } from "@/components/junior/ui";
import { markFirstSteps } from "@/components/junior/FirstSteps";

/**
 * Old-link sign-up for parents and coaches (new users sign up as a normal FRAME account and add a role in Profile). Reachable by link/deep link only (frame://junior-start), so the
 * athlete sign-in and sign-up screens are untouched. The server only honours `role` while the pilot flag is on.
 */
export default function JuniorStart() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [role, setRole] = useState<"parent" | "coach">("parent");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiPost<{ token: string }>("/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
        acceptedTerms: agree,
        acceptedPrivacy: agree,
        role,
        app: "mobile",
      });
      await signIn(data.token);
      // Same code path as "Add a role" inside the app (idempotent; the server already recorded the role at sign-up).
      await markFirstSteps(role);
      await apiPost("/junior/roles", { role }).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ["junior"] });
      router.replace("/");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen light={null}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 60, gap: 14 }}>
        <Text style={s.title}>FRAME for families and gyms</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Button title="I'm a parent" variant={role === "parent" ? "primary" : "secondary"} onPress={() => setRole("parent")} /></View>
          <View style={{ flex: 1 }}><Button title="I'm a coach" variant={role === "coach" ? "primary" : "secondary"} onPress={() => setRole("coach")} /></View>
        </View>
        <Field label="Your name" value={name} onChangeText={setName} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        <Button title={agree ? "Terms and Privacy accepted" : "Accept Terms and Privacy"} variant={agree ? "secondary" : "ghost"} onPress={() => setAgree(!agree)} />
        {error ? <Text style={s.err}>{error}</Text> : null}
        <Button title="Create account" loading={busy} disabled={!agree || !name.trim() || !email.trim() || password.length < 8} onPress={() => void submit()} />
        <Button title="I already have an account" variant="ghost" onPress={() => router.replace("/sign-in")} />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { color: palette.text, fontSize: 26, fontWeight: "700" },
  err: { color: "#E5877F", fontSize: 14 },
});
