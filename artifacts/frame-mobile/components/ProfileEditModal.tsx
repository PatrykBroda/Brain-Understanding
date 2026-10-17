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
import { Button, Display, Eyebrow, Field, Screen } from "@/components/ui";
import { fonts, palette, radius } from "@/constants/theme";
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
          onPress={() => onSelect(o.key)}
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
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.glass,
    paddingHorizontal: 18,
  },
  selected: {
    borderColor: palette.goldHair,
    backgroundColor: palette.goldWash,
  },
  text: { fontFamily: fonts.textMedium, fontSize: 13, color: palette.textMid },
  selectedText: { color: palette.goldPale },
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#08090B" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Screen>
        <View
          style={[
            styles.sheetHeader,
            { paddingTop: Platform.OS === "ios" ? insets.top + 12 : 16 },
          ]}
        >
          <Display size="heading" style={styles.sheetTitle}>
            Edit profile
          </Display>
          <Pressable onPress={onClose} hitSlop={12} style={styles.cancelBtn} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.field}>
            <Eyebrow style={styles.label}>Combat sport</Eyebrow>
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
            <Eyebrow style={styles.label}>{levelLabelForSport(form.primarySport)}</Eyebrow>
            <ChipSelector
              options={levelsForSport(form.primarySport)}
              value={form.level}
              onSelect={(k) => set("level", k)}
            />
          </View>

          <View style={styles.field}>
            <Eyebrow style={styles.label}>Training frequency</Eyebrow>
            <ChipSelector
              options={FREQS}
              value={form.trainingFrequency}
              onSelect={(k) => set("trainingFrequency", k)}
            />
          </View>

          <View style={styles.field}>
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
          </View>

          <View style={styles.field}>
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
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            title="Save changes"
            onPress={handleSave}
            loading={saving}
            style={styles.saveBtn}
          />
        </ScrollView>
        </Screen>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  sheetTitle: {},
  cancelBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassEdge,
  },
  cancelText: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 0.6,
    color: palette.text,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 26,
  },
  field: {
    gap: 12,
  },
  label: {
    color: palette.goldLight,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 14,
    paddingBottom: 14,
    lineHeight: 22,
    fontSize: 15,
  },
  errorText: {
    fontFamily: fonts.text,
    fontSize: 13.5,
    color: palette.redLight,
  },
  saveBtn: {
    marginTop: 8,
  },
});
