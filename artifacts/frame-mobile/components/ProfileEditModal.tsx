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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "@/lib/api";
import type { Fighter } from "@/context/FighterContext";

const SPORTS = [
  { key: "bjj", label: "BJJ" },
  { key: "mma", label: "MMA" },
  { key: "boxing", label: "Boxing" },
  { key: "muay_thai", label: "Muay Thai" },
  { key: "kickboxing", label: "Kickboxing" },
  { key: "wrestling", label: "Wrestling" },
  { key: "judo", label: "Judo" },
  { key: "karate", label: "Karate" },
  { key: "mixed", label: "Mixed" },
];

const LEVELS = [
  { key: "White", label: "White" },
  { key: "Blue", label: "Blue" },
  { key: "Purple", label: "Purple" },
  { key: "Brown", label: "Brown" },
  { key: "Black", label: "Black" },
  { key: "No belt / other", label: "No belt / other" },
];

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
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  selected: {
    borderColor: "#8A6A2F",
    backgroundColor: "rgba(138,106,47,0.1)",
  },
  text: { fontFamily: "Outfit", fontSize: 13, color: "#666" },
  selectedText: { color: "#8A6A2F" },
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
    level: f.level ?? "White",
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
        style={{ flex: 1, backgroundColor: "#050505" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.sheetHeader,
            { paddingTop: Platform.OS === "ios" ? insets.top + 12 : 16 },
          ]}
        >
          <Text style={styles.sheetTitle}>EDIT PROFILE</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.cancelText}>CANCEL</Text>
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
            <Text style={styles.label}>COMBAT SPORT</Text>
            <ChipSelector
              options={SPORTS}
              value={form.primarySport}
              onSelect={(k) => {
                set("primarySport", k);
                set("art", k);
              }}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>BELT / LEVEL</Text>
            <ChipSelector
              options={LEVELS}
              value={form.level}
              onSelect={(k) => set("level", k)}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>TRAINING FREQUENCY</Text>
            <ChipSelector
              options={FREQS}
              value={form.trainingFrequency}
              onSelect={(k) => set("trainingFrequency", k)}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>GOALS</Text>
            <TextInput
              style={styles.textArea}
              value={form.goals}
              onChangeText={(t) => set("goals", t)}
              placeholder="What are you working toward?"
              placeholderTextColor="#333"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>ACKNOWLEDGED WEAKNESSES</Text>
            <TextInput
              style={styles.textArea}
              value={form.weaknesses}
              onChangeText={(t) => set("weaknesses", t)}
              placeholder="What do you know needs work?"
              placeholderTextColor="#333"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.8 },
              saving && { opacity: 0.5 },
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#050505" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>SAVE CHANGES</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    backgroundColor: "#050505",
  },
  sheetTitle: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 5,
    color: "#e0e0e0",
  },
  cancelText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#666",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 28,
  },
  field: {
    gap: 12,
  },
  label: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 4,
    color: "#444",
  },
  textArea: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    padding: 12,
    minHeight: 80,
    lineHeight: 20,
  },
  errorText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#c0392b",
  },
  saveBtn: {
    backgroundColor: "#8A6A2F",
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 4,
    color: "#050505",
  },
});
