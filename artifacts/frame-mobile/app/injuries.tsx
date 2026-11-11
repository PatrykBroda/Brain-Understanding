import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  injuryErrorMessage,
  useInjuries,
  useLogInjury,
  useRemoveInjury,
  useResolveInjury,
  useUpdateInjury,
} from "@/hooks/useInjuries";
import {
  INJURY_AREAS,
  KINDS,
  SEVERITIES,
  areaLabel,
  dateProblem,
  isRecovered,
  kindLabel,
  severityLabel,
  splitByStatus,
  type InjuryKind,
  type InjuryRow,
  type InjurySeverity,
} from "@/lib/injuryLogic";
import { FREE_TEXT, RAW_TEXT } from "@/lib/textInputProps";
import { FONT, TEXT_PRIMARY, TEXT_SECONDARY, caption } from "@/constants/typography";

const ACCENT = "#8A6A2F";
const ERR = "#b5523b";
const day = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

type Draft = { id?: number; area: string; kind: InjuryKind; severity: InjurySeverity; date: string; note: string };

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[s.chip, on && { borderColor: ACCENT }]}
    >
      <Text style={[s.chipText, on && { color: TEXT_PRIMARY }]}>{label}</Text>
    </Pressable>
  );
}

export default function InjuriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useInjuries();
  const log = useLogInjury();
  const update = useUpdateInjury();
  const resolve = useResolveInjury();
  const remove = useRemoveInjury();
  const today = q.data?.today;
  const { active, recovered } = splitByStatus(q.data?.injuries ?? []);
  const top = Platform.OS === "web" ? 20 : insets.top;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const mutationError = [log, update, resolve, remove].find((m) => m.isError)?.error;
  const busy = log.isPending || update.isPending || resolve.isPending || remove.isPending;

  const startNew = () => {
    setFormError(null);
    setDraft({ area: "knee", kind: "other", severity: 2, date: today ?? "", note: "" });
  };
  const startEdit = (r: InjuryRow) => {
    setFormError(null);
    setDraft({
      id: r.id,
      area: r.area,
      kind: (KINDS.find((k) => k.value === r.kind)?.value ?? "other") as InjuryKind,
      severity: (r.severity as InjurySeverity) ?? 2,
      date: r.date,
      note: r.note,
    });
  };
  const close = () => {
    setDraft(null);
    setFormError(null);
  };

  const save = async () => {
    if (!draft || busy) return;
    const problem = dateProblem(draft.date.trim(), today);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    const body = { area: draft.area, kind: draft.kind, severity: draft.severity, date: draft.date.trim(), note: draft.note.trim() };
    try {
      if (draft.id != null) await update.mutateAsync({ id: draft.id, ...body });
      else await log.mutateAsync(body);
      close();
    } catch (err) {
      // Keep the form open with what was typed, and say exactly what failed.
      setFormError(injuryErrorMessage(err));
    }
  };

  const act = (fn: () => Promise<unknown>) => {
    fn().then(close, (err) => setFormError(injuryErrorMessage(err)));
  };

  const row = (r: InjuryRow) => (
    <Pressable
      key={r.id}
      onPress={() => startEdit(r)}
      style={s.row}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${areaLabel(r.area)} entry`}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.rowText, isRecovered(r) && { color: TEXT_SECONDARY }]}>
          {areaLabel(r.area)} · {severityLabel(r.severity).toLowerCase()} · {kindLabel(r.kind).toLowerCase()}
        </Text>
        <Text style={s.rowMeta}>
          {day(r.date)}
          {isRecovered(r) && r.resolvedAt ? ` · recovered ${day(r.resolvedAt)}` : ""}
        </Text>
        {r.note ? <Text style={s.rowMeta}>{r.note}</Text> : null}
      </View>
      <Feather name="edit-2" size={16} color={TEXT_SECONDARY} />
    </Pressable>
  );

  return (
    <ScrollView
      style={s.root}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: top + 12, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 16 }}
    >
      <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}>
        <Feather name="chevron-left" size={22} color={TEXT_PRIMARY} />
      </Pressable>
      <Text style={s.title}>Injury log</Text>
      <Text style={s.caption}>
        Log what is sore or injured, edit it as it changes, and mark it recovered. FRAME uses active injuries in chat and your Camp plan.
      </Text>

      {!draft ? (
        <Pressable onPress={startNew} style={s.primary} accessibilityRole="button" accessibilityLabel="Log an injury">
          <Text style={s.primaryText}>Log an injury</Text>
        </Pressable>
      ) : (
        <View style={s.panel}>
          <Text style={s.caption}>{draft.id != null ? "Edit injury" : "New injury"}</Text>
          <Text style={s.label}>Area</Text>
          <View style={s.chips}>
            {INJURY_AREAS.map((a) => (
              <Chip key={a.key} label={a.label} on={draft.area === a.key} onPress={() => setDraft({ ...draft, area: a.key })} />
            ))}
          </View>
          <Text style={s.label}>Type</Text>
          <View style={s.chips}>
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} on={draft.kind === k.value} onPress={() => setDraft({ ...draft, kind: k.value })} />
            ))}
          </View>
          <Text style={s.label}>Severity</Text>
          <View style={s.chips}>
            {SEVERITIES.map((v) => (
              <Chip key={v.value} label={v.label} on={draft.severity === v.value} onPress={() => setDraft({ ...draft, severity: v.value })} />
            ))}
          </View>
          <Text style={s.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            value={draft.date}
            onChangeText={(t) => setDraft({ ...draft, date: t })}
            placeholder={today ?? "2026-11-11"}
            placeholderTextColor={TEXT_SECONDARY}
            keyboardType="numbers-and-punctuation"
            {...RAW_TEXT}
            style={s.input}
            accessibilityLabel="Injury date"
          />
          <Text style={s.label}>Notes</Text>
          <TextInput
            value={draft.note}
            onChangeText={(t) => setDraft({ ...draft, note: t })}
            placeholder="What happened, what hurts, what to avoid"
            placeholderTextColor={TEXT_SECONDARY}
            {...FREE_TEXT}
            multiline
            maxLength={500}
            style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
            accessibilityLabel="Injury notes"
          />
          {formError ? <Text style={s.err}>{formError}</Text> : null}
          <View style={s.actions}>
            <Pressable onPress={save} disabled={busy} style={[s.primary, busy && { opacity: 0.6 }]} accessibilityRole="button">
              <Text style={s.primaryText}>{busy ? "Saving…" : "Save"}</Text>
            </Pressable>
            <Pressable onPress={close} style={s.secondary} accessibilityRole="button">
              <Text style={s.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
          {draft.id != null ? (
            <View style={s.actions}>
              {active.some((r) => r.id === draft.id) ? (
                <Pressable onPress={() => act(() => resolve.mutateAsync(draft.id!))} style={s.secondary} accessibilityRole="button">
                  <Text style={s.secondaryText}>Mark recovered</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => act(() => update.mutateAsync({ id: draft.id!, status: "active" }))}
                  style={s.secondary}
                  accessibilityRole="button"
                >
                  <Text style={s.secondaryText}>Reopen</Text>
                </Pressable>
              )}
              <Pressable onPress={() => act(() => remove.mutateAsync(draft.id!))} style={s.secondary} accessibilityRole="button">
                <Text style={[s.secondaryText, { color: ERR }]}>Delete</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}

      {!draft && mutationError ? <Text style={s.err}>{injuryErrorMessage(mutationError)}</Text> : null}

      {q.isLoading ? (
        <ActivityIndicator color={ACCENT} />
      ) : q.isError ? (
        <Text style={s.err}>{injuryErrorMessage(q.error)}</Text>
      ) : active.length + recovered.length === 0 ? (
        <Text style={s.body}>Nothing logged yet. Tap "Log an injury" to add one.</Text>
      ) : (
        <>
          {active.length > 0 ? (
            <View style={s.panel}>
              <Text style={s.caption}>Active</Text>
              {active.map(row)}
            </View>
          ) : null}
          {recovered.length > 0 ? (
            <View style={s.panel}>
              <Text style={s.caption}>Recovered</Text>
              {recovered.map(row)}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  title: { fontFamily: FONT.medium, fontSize: 22, color: TEXT_PRIMARY },
  caption: { ...caption },
  body: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23, color: TEXT_SECONDARY },
  label: { fontFamily: FONT.medium, fontSize: 13, color: TEXT_PRIMARY },
  panel: { borderColor: "#222", borderWidth: 1, padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  rowText: { fontFamily: FONT.regular, fontSize: 15, color: TEXT_PRIMARY },
  rowMeta: { fontFamily: FONT.regular, fontSize: 13, color: TEXT_SECONDARY },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: "#222", borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
  chipText: { fontFamily: FONT.regular, fontSize: 13, color: TEXT_SECONDARY },
  input: { borderColor: "#222", borderWidth: 1, padding: 12, fontFamily: FONT.regular, fontSize: 15, color: TEXT_PRIMARY },
  err: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 19, color: ERR },
  actions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  primary: { backgroundColor: ACCENT, paddingVertical: 12, paddingHorizontal: 20, minHeight: 44, justifyContent: "center", alignItems: "center" },
  primaryText: { fontFamily: FONT.medium, fontSize: 14, color: "#fff" },
  secondary: { borderColor: "#333", borderWidth: 1, paddingVertical: 12, paddingHorizontal: 20, minHeight: 44, justifyContent: "center", alignItems: "center" },
  secondaryText: { fontFamily: FONT.regular, fontSize: 14, color: TEXT_PRIMARY },
});
