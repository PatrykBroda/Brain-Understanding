import React, { useEffect, useState } from "react";
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
import { NAME_MAX, nameError } from "@/lib/fighterName";
import { dismissProps } from "@/components/FormScroll";
import { useAuth } from "@/context/AuthContext";
import { commitFighterProfile } from "@/lib/fighterProfileCache";
import { NAME_TEXT } from "@/lib/textInputProps";
import { sectionTitle } from "@/constants/typography";

/**
 * Edit profile: the name. Sport, belt / level, frequency, goals and weaknesses are the ONBOARDING
 * QUESTIONS section on the Profile tab (pre-filled, one Save), so they are not duplicated here.
 */
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
  const { userId } = useAuth();
  const [name, setName] = useState(fighter.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const nameErr = nameError(name);

  // Reopening after a cancel (or a save) starts from the current saved name, not stale edits.
  useEffect(() => {
    if (!visible) return;
    setName(fighter.name ?? "");
    setNameTouched(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function handleSave() {
    if (saving) return;
    if (nameErr) {
      setNameTouched(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resp = await apiPatch<{ fighter?: Fighter }>("/fighter", { name: name.trim() });
      if (resp?.fighter && userId) await commitFighterProfile(qc, userId, resp.fighter);
      else await qc.invalidateQueries({ queryKey: ["fighter"] });
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message || "Save failed");
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
          <Text style={styles.sheetTitle}>Edit profile</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          {...dismissProps}
        >
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              {...NAME_TEXT}
              style={[styles.input, nameTouched && nameErr ? styles.inputError : null]}
              value={name}
              onChangeText={setName}
              onBlur={() => setNameTouched(true)}
              placeholder="Your name"
              placeholderTextColor="#333"
              maxLength={NAME_MAX}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
            />
            {nameTouched && nameErr ? <Text style={styles.errorText}>{nameErr}</Text> : null}
            <Text style={styles.note}>Your sport, belt, training frequency, goals and weaknesses are under Onboarding questions on your profile.</Text>
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
              <Text style={styles.saveBtnText}>Save</Text>
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
    ...sectionTitle,
    color: "#e0e0e0",
  },
  cancelText: {
    ...sectionTitle,
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
    ...sectionTitle,
  },
  input: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputError: { borderColor: "#c0392b" },
  note: { fontFamily: "Outfit", fontSize: 12, lineHeight: 18, color: "#a8a8a8" },
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
    ...sectionTitle,
    color: "#050505",
  },
});
