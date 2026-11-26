import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Button, Field } from "@/components/entry";
import { palette } from "@/constants/entryTheme";
import { Card, H, Notice, Page, Section, T, errMsg } from "@/components/junior/ui";
import { ageOnDate, isBirthDate, loginBlockedReason, type JuniorRules } from "@/lib/juniorAccounts";

type Mode = "none" | "password" | "invite";
interface Created { child: { id: string; displayName: string }; junior: { status: string; username: string | null }; inviteCode: string | null }

/** Parent creates a junior account: name, date of birth, consent, then how they sign in. */
export default function JuniorNew() {
  const router = useRouter();
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["junior", "junior-rules"], queryFn: () => apiGet<JuniorRules>("/junior/junior-accounts/rules") });
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [mode, setMode] = useState<Mode>("none");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState<Created | null>(null);

  const validDob = isBirthDate(dob.trim());
  const age = validDob ? ageOnDate(dob.trim()) : null;
  const blocked = age != null && rules.data ? loginBlockedReason(age, rules.data.loginMinAge) : null;
  const effMode: Mode = blocked ? "none" : mode;
  const ready = !!name.trim() && validDob && consent && (effMode !== "password" || (username.trim().length >= 3 && password.length >= 8));

  const create = useMutation({
    mutationFn: () =>
      apiPost<Created>("/junior/junior-accounts", {
        displayName: name.trim(),
        birthDate: dob.trim(),
        consent: { accepted: true, version: rules.data!.consentVersion },
        ...(effMode === "password" ? { login: { mode: "password", username: username.trim().toLowerCase(), password } } : effMode === "invite" ? { login: { mode: "invite" } } : {}),
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["junior"] });
      setDone(r);
    },
    onError: (e) => Alert.alert("Could not create the junior account", errMsg(e)),
  });

  if (done) {
    return (
      <Page title="Junior account created" roleBar={false}>
        <Card>
          <H>{done.child.displayName}</H>
          {done.inviteCode ? (
            <>
              <T>Give {done.child.displayName} this setup code. They choose their own username and password with it. It works once and expires in 7 days.</T>
              <Text selectable style={s.code} testID="invite-code">{done.inviteCode}</Text>
            </>
          ) : done.junior.username ? (
            <T>They can sign in with the username {done.junior.username} and the password you set. You can reset it any time.</T>
          ) : (
            <T>You manage this account. They do not sign in, and you log their sessions.</T>
          )}
        </Card>
        <Button title="Open summary" onPress={() => router.replace({ pathname: "/(parent)/junior", params: { childId: done.child.id } } as never)} />
        <Button title="Back to juniors" variant="ghost" onPress={() => router.replace("/(parent)/juniors" as never)} />
      </Page>
    );
  }

  const r = rules.data;
  return (
    <Page title="New junior account" subtitle="You stay in charge: pause, export or delete any time." roleBar={false}>
      <Card>
        <Field label="First name or nickname" value={name} onChangeText={setName} />
        <Field label="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
        {dob.length >= 10 && !validDob ? <T dim>Use the format 2014-03-21.</T> : null}
        {r && age != null && age < r.minAge ? <Notice>Junior accounts start at age {r.minAge}.</Notice> : null}
        {r && age != null && age > r.maxAge ? <Notice>Over-18s need their own FRAME account.</Notice> : null}
      </Card>

      <Section>How do they sign in?</Section>
      <Card>
        {blocked ? <T dim>{blocked}</T> : null}
        <Choice on={effMode === "none"} title="I manage it for them" line="No login. You see and log everything." onPress={() => setMode("none")} />
        <Choice on={effMode === "password"} disabled={!!blocked} title="Username and password" line="You set them. They can sign in right away." onPress={() => setMode("password")} />
        <Choice on={effMode === "invite"} disabled={!!blocked} title="Invite code" line="They finish setup themselves with a one-time code." onPress={() => setMode("invite")} />
        {effMode === "password" ? (
          <>
            <Field label="Username (letters, numbers, _ and .)" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
            <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
          </>
        ) : null}
      </Card>

      <Section>Parent consent</Section>
      <Card>
        <T dim>{r?.consentStatement ?? "Loading..."}</T>
        <View style={s.row}>
          <Switch value={consent} onValueChange={setConsent} accessibilityLabel="I give this consent" />
          <T>I give this consent</T>
        </View>
        <T dim>AI coach and chat stay off for junior accounts. Nothing is shared with a gym until you ask.</T>
      </Card>
      <Button title="Create junior account" loading={create.isPending} disabled={!ready || !r} onPress={() => create.mutate()} />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </Page>
  );
}

function Choice({ on, title, line, onPress, disabled }: { on: boolean; title: string; line: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.choice, on && s.choiceOn, disabled && { opacity: 0.4 }]} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !!disabled }}>
      <Text style={s.choiceTitle}>{title}</Text>
      <Text style={s.choiceLine}>{line}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  choice: { borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, gap: 2 },
  choiceOn: { borderColor: palette.gold, backgroundColor: palette.goldWash },
  choiceTitle: { color: palette.text, fontSize: 15, fontWeight: "600" },
  choiceLine: { color: palette.textMid, fontSize: 13 },
  code: { color: palette.gold, fontSize: 18, fontWeight: "700", letterSpacing: 0.5 },
});
