import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { fonts, palette } from "@/constants/theme";
import { Button } from "./Button";
import { GlassCard } from "./GlassCard";

/**
 * One component for the three non-happy states so every screen looks
 * considered with little data: empty (nothing yet + next action), loading
 * (skeleton-quiet spinner + label), error (what failed + retry).
 */
export function EmptyState({
  kind = "empty",
  title,
  body,
  actionLabel,
  onAction,
  icon,
}: {
  kind?: "empty" | "loading" | "error";
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof Feather>["name"];
}) {
  const tone = kind === "error" ? "red" : "neutral";
  return (
    <GlassCard tone={tone} padding={24}>
      <View style={styles.col} accessibilityRole={kind === "error" ? "alert" : undefined}>
        {kind === "loading" ? (
          <ActivityIndicator color={palette.textMid} />
        ) : (
          <View style={[styles.icon, kind === "error" && { borderColor: palette.redHair }]}>
            <Feather
              name={icon ?? (kind === "error" ? "alert-circle" : "circle")}
              size={20}
              color={kind === "error" ? palette.redText : palette.textMid}
            />
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {actionLabel && onAction ? (
          <Button
            title={actionLabel}
            onPress={onAction}
            variant={kind === "error" ? "secondary" : "primary"}
            style={{ alignSelf: "stretch", marginTop: 8 }}
          />
        ) : null}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: "center", gap: 8 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.raised,
    marginBottom: 4,
  },
  title: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi, textAlign: "center" },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, textAlign: "center" },
});
