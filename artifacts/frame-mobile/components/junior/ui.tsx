import React from "react";
import { ScrollView, StyleSheet, Text, View, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, Button } from "@/components/entry";
import { palette, radius } from "@/constants/entryTheme";
import { ApiError } from "@/lib/api";
import { juniorErrorCopy } from "@/lib/junior";

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return juniorErrorCopy(e.code, e.message);
  return e instanceof Error ? e.message : "Something went wrong";
}

export function Page({ title, children, onRefresh, refreshing }: { title: string; children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen light={null}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 120, gap: 14 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.gold} /> : undefined}
      >
        <Text style={s.title}>{title}</Text>
        {children}
      </ScrollView>
    </Screen>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
export function H({ children }: { children: React.ReactNode }) {
  return <Text style={s.h}>{children}</Text>;
}
export function T({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <Text style={[s.t, dim && { color: palette.textMid }]}>{children}</Text>;
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.notice}>
      <Text style={s.t}>{children}</Text>
    </View>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Card>
      <T>{errMsg(error)}</T>
      {retry ? <Button title="Try again" variant="secondary" onPress={retry} /> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  title: { color: palette.text, fontSize: 28, fontWeight: "700" },
  card: { backgroundColor: "#121316", borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 16, gap: 10 },
  h: { color: palette.text, fontSize: 17, fontWeight: "600" },
  t: { color: palette.text, fontSize: 15, lineHeight: 21 },
  notice: { backgroundColor: palette.goldWash, borderColor: palette.goldHair, borderWidth: 1, borderRadius: 14, padding: 12 },
});
