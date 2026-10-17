import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "@/lib/api";
import { Button, Display, Field, Label, haptic } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import type { Fighter } from "@/context/FighterContext";
import {
  SPORTS,
  LEGACY_SPORTS,
  defaultLevelForSport,
  levelLabelForSport,
  levelsForSport,
} from "@/lib/fighterOptions";

const PROFILE_SPORTS = [...SPORTS, ...LEGACY_SPORTS];

const FREQS = [
  { key: "1-2x / week", label: "1-2x" },
  { key: "3-4x / week", label: "3-4x" },
  { key: "5-6x / week", label: "5-6x" },
  { key: "Daily / pro", label: "Daily / pro" },
];

function ChipSelector({
  options,
  value,
  onSelect,
}: {
  options: { key: string; label: string }[];
  value: string;
  onSelect: (k: string) => void;
}) {
  return (
    <View style={chip.row}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          style={[chip.item, value === o.key && chip.selected]}
          onPress={() => {
            if (value !== o.key) haptic.select();
            onSelect(o.key);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.key }}
        >
          <Text style={[chip.text, value === o.key && chip.selectedText]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const chip = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  item: {
    minHeight: MIN_TAP,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 18,
  },
  selected: { borderColor: palette.goldHair, backgroundColor: palette.raised },
  text: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  selectedText: { color: palette.textHi },
});

interface FormState {
  primarySport: string;
  art: string;
  level: string;
  trainingFrequency: string;
  goals: string;
  weaknesses: string;
}

function toForm(f: Fighter): FormState {
  return {
    primarySport: f.primarySport ?? "bjj",
    art: f.art ?? f.primarySport ?? "bjj",
    level: f.level ?? defaultLevelForSport(f.primarySport),
    trainingFrequency: f.trainingFrequency ?? "3-4x / week",
    goals: f.goals ?? "",
    weaknesses: f.weaknesses ?? "",
  };
}

export function ProfileEditModal({
  fighter,
  visible,
  onClose,
}: {
  fighter: Fighter;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(fighter));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch("/fighter", {
        primarySport: form.primarySport,
        art: form.art || form.primarySport,
        level: form.level,
        trainingFrequency: form.trainingFrequency,
        goals: form.goals.trim() || null,
        weaknesses: form.weaknesses.trim() || null,
      });
      qc.invalidateQueries({ queryKey: ["fighter"] });
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.kav} pointerEvents="box-none">
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Display size="heading">Edit profile</Display>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.cancelBtn, pressed && { backgroundColor: palette.raised }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.field}>
                <Label>Combat sport</Label>
                <ChipSelector
                  options={PROFILE_SPORTS}
                  value={form.primarySport}
                  onSelect={(k) => {
                    setForm((current) => ({
                      ...current,
                      primarySport: k,
                      art: k,
                      level: defaultLevelForSport(k),
                    }));
                  }}
                />
              </View>

              <View style={styles.field}>
                <Label>{levelLabelForSport(form.primarySport).charAt(0) + levelLabelForSport(form.primarySport).slice(1).toLowerCase().replace(/bjj/, "BJJ")}</Label>
                <ChipSelector
                  options={levelsForSport(form.primarySport)}
                  value={form.level}
                  onSelect={(k) => set("level", k)}
                />
              </View>

              <View style={styles.field}>
                <Label>Training frequency</Label>
                <ChipSelector options={FREQS} value={form.trainingFrequency} onSelect={(k) => set("trainingFrequency", k)} />
              </View>

              <Field
                label="Goals"
                style={styles.textArea}
                value={form.goals}
                onChangeText={(t) => set("goals", t)}
                placeholder="What are you working toward?"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Field
                label="Acknowledged weaknesses"
                style={styles.textArea}
                value={form.weaknesses}
                onChangeText={(t) => set("weaknesses", t)}
                placeholder="What do you know needs work?"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {error && <Text style={styles.errorText}>{error}</Text>}

              <Button title="Save changes" onPress={handleSave} loading={saving} style={styles.saveBtn} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: palette.scrim, justifyContent: "flex-end" },
  kav: { width: "100%", maxHeight: "92%", alignItems: "center" },
  sheet: {
    width: "100%",
    maxWidth: 560,
    flexShrink: 1,
    backgroundColor: palette.raised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.borderStrong,
  },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, marginTop: 10 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
  },
  cancelBtn: {
    minHeight: MIN_TAP,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.sm,
  },
  cancelText: { fontFamily: fonts.medium, fontSize: 15, color: palette.textMid },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, gap: 24 },
  field: { gap: 10 },
  textArea: { minHeight: 96, paddingTop: 14, paddingBottom: 14, lineHeight: 22 },
  errorText: { fontFamily: fonts.regular, fontSize: 14, color: palette.redText },
  saveBtn: { marginTop: 4 },
});
