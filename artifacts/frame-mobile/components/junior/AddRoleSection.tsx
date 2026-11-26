import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/entry";
import { markFirstSteps } from "@/components/junior/FirstSteps";
import { useRoleSwitch } from "@/components/junior/useRoleSwitch";
import type { JuniorMe } from "@/lib/junior";

const OPTIONS = [
  { role: "parent" as const, title: "I'm a parent", line: "Follow your child's training and keep their record.", confirm: "Add Parent view" },
  { role: "coach" as const, title: "I'm a coach or work at a gym", line: "Join your gym's team with a code from your gym. No gym access until then.", confirm: "Add Coach view" },
];

/** Profile section on the athlete app: add a Parent and/or Coach role to this same account. Pilot flag only. */
export function AddRoleSection() {
  const config = useQuery<{ enabled: boolean }>({
    queryKey: ["junior", "config"],
    queryFn: () => apiGet<{ enabled: boolean }>("/junior/config"),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const me = useQuery<JuniorMe>({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me"), enabled: config.data?.enabled === true, retry: false });
  const [picked, setPicked] = useState<"parent" | "coach" | null>(null);
  const { switchTo, busy, consentModal } = useRoleSwitch();

  if (config.data?.enabled !== true || !me.data) return null;
  const options = OPTIONS.filter((o) => !me.data!.roles.includes(o.role));
  if (options.length === 0) return null;

  return (
    <View style={s.wrap} testID="add-role-section">
      <Text style={s.kicker}>Your roles</Text>
      <Text style={s.title}>Add a role</Text>
      <Text style={s.sub}>Same account, same login. You can switch any time from Account.</Text>
      {options.map((o) => (
        <View key={o.role} style={[s.card, picked === o.role && s.cardOn]}>
          <Pressable onPress={() => setPicked(picked === o.role ? null : o.role)} accessibilityRole="button" accessibilityLabel={o.title}>
            <Text style={s.cardTitle}>{o.title}</Text>
            <Text style={s.cardLine}>{o.line}</Text>
          </Pressable>
          {picked === o.role ? (
            <View style={{ gap: 8, marginTop: 10 }}>
              <Button
                title={o.confirm}
                loading={busy}
                onPress={() => {
                  void markFirstSteps(o.role).then(() => switchTo(o.role));
                }}
              />
              <Button title="Cancel" variant="ghost" onPress={() => setPicked(null)} />
            </View>
          ) : null}
        </View>
      ))}
      {consentModal}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 32, gap: 10 },
  kicker: { color: "#8a8a8a", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  title: { color: "#f2f2f2", fontSize: 22, fontWeight: "700" },
  sub: { color: "#9a9a9a", fontSize: 14 },
  card: { backgroundColor: "#121316", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 16 },
  cardOn: { borderColor: "rgba(201,168,76,0.6)" },
  cardTitle: { color: "#f2f2f2", fontSize: 17, fontWeight: "600" },
  cardLine: { color: "#a0a0a0", fontSize: 14, marginTop: 4, lineHeight: 20 },
});
