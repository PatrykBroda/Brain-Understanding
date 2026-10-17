import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toIso } from "@/lib/dateUtils";
import { competitionApi, type Competition } from "@/lib/competition";
import { useActiveCompetition, useCompetitionList } from "@/hooks/useCompetition";
import {
  Button,
  Display,
  EmptyState,
  FadeIn,
  Field,
  GlassCard,
  IconButton,
  Numeral,
  Screen,
  Status,
  haptic,
} from "@/components/ui";
import { fonts, palette, SCREEN_PAD, type as T } from "@/constants/theme";

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(hasTime ? { hour: "numeric", minute: "2-digit" } : null),
    });
  } catch {
    return iso;
  }
}

// ISO timestamp -> YYYY-MM-DD for the date TextInputs when prefilling an edit.
function isoToInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export default function CompetitionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const { data: activeData, isLoading: activeLoading, isError: activeError, refetch: refetchActive } = useActiveCompetition();
  const { data: listData } = useCompetitionList();

  const pressure = activeData?.pressure ?? null;
  const competitions = listData?.competitions ?? [];

  const [showForm, setShowForm] = useState(false);
  const [eventName, setEventName] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [weighInDate, setWeighInDate] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setEventName("");
    setDiscipline("");
    setEventDate("");
    setWeighInDate("");
    setCurrentWeight("");
    setTargetWeight("");
    setNotes("");
    setError(null);
  }

  function buildInput() {
    const iso = toIso(eventDate);
    if (!iso) throw new Error("Enter a valid event date (YYYY-MM-DD)");
    const weighIso = weighInDate.trim() ? toIso(weighInDate) : null;
    if (weighInDate.trim() && !weighIso) throw new Error("Weigh-in date is invalid");
    return {
      eventName: eventName.trim(),
      discipline: discipline.trim(),
      eventDate: iso,
      weighInDate: weighIso,
      currentWeight: currentWeight.trim(),
      targetWeight: targetWeight.trim(),
      notes: notes.trim(),
    };
  }

  const createMut = useMutation({
    mutationFn: () => competitionApi.create(buildInput()),
    onSuccess: () => {
      haptic.success();
      qc.invalidateQueries({ queryKey: ["competition"] });
      resetForm();
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not schedule competition");
    },
  });

  const updateMut = useMutation({
    mutationFn: (id: number) => competitionApi.update(id, buildInput()),
    onSuccess: () => {
      haptic.success();
      qc.invalidateQueries({ queryKey: ["competition"] });
      resetForm();
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not update competition");
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => competitionApi.cancel(id),
    onSuccess: (_data, id) => {
      haptic.press();
      qc.invalidateQueries({ queryKey: ["competition"] });
      if (editingId === id) resetForm();
    },
  });

  function beginEdit(c: Competition) {
    haptic.select();
    setEditingId(c.id);
    setEventName(c.eventName ?? "");
    setDiscipline(c.discipline ?? "");
    setEventDate(isoToInput(c.eventDate));
    setWeighInDate(isoToInput(c.weighInDate));
    setCurrentWeight(c.currentWeight ?? "");
    setTargetWeight(c.targetWeight ?? "");
    setNotes(c.notes ?? "");
    setError(null);
    setShowForm(true);
  }

  const saving = createMut.isPending || updateMut.isPending;

  function submit() {
    if (!eventName.trim()) {
      setError("Event name is required");
      return;
    }
    setError(null);
    if (editingId != null) {
      updateMut.mutate(editingId);
    } else {
      createMut.mutate();
    }
  }

  const activeComps = competitions.filter((c) => c.status === "active");
  const pastComps = competitions.filter((c) => c.status !== "active");

  return (
    <Screen light="silver" focus="topRight">
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Back" onPress={() => router.back()} />
          <Display size="title" style={{ flex: 1 }}>
            Competition
          </Display>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + bottomPad + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FadeIn index={0}>
            {activeLoading ? (
              <EmptyState kind="loading" title="Loading competition" />
            ) : activeError && !activeData ? (
              <EmptyState
                kind="error"
                title="Couldn't load your competition"
                body="Check your connection and try again."
                actionLabel="Retry"
                onAction={() => void refetchActive()}
              />
            ) : pressure ? (
              <ActiveCard
                pressure={pressure}
                onCancel={() => cancelMut.mutate(pressure.competition.id)}
                onEdit={() => beginEdit(pressure.competition)}
                cancelling={cancelMut.isPending}
              />
            ) : !showForm ? (
              <EmptyState
                kind="empty"
                icon="flag"
                title="No competition scheduled"
                body="Schedule a fight or comp and FRAME ramps the standard it holds you to as the date nears. Pressure lives in the standard, not in noise."
                actionLabel="Schedule competition"
                onAction={() => {
                  haptic.press();
                  setShowForm(true);
                }}
              />
            ) : null}
          </FadeIn>

          {!showForm && pressure && (
            <Button
              title="Schedule another competition"
              variant="secondary"
              onPress={() => setShowForm(true)}
              style={{ marginTop: 20 }}
            />
          )}

          {showForm && (
            <View style={styles.formWrap}>
              <GlassCard padding={20}>
                <Display size="heading" style={styles.formTitle}>
                  {editingId != null ? "Edit competition" : "New competition"}
                </Display>

                <View style={styles.fields}>
                  <Field label="Event name" value={eventName} onChangeText={setEventName} placeholder="Regional Open" />
                  <Field label="Discipline" value={discipline} onChangeText={setDiscipline} placeholder="BJJ / MMA / Muay Thai" />
                  <Field label="Event date (YYYY-MM-DD)" value={eventDate} onChangeText={setEventDate} placeholder="2026-07-01" autoCapitalize="none" />
                  <Field label="Weigh-in date (optional)" value={weighInDate} onChangeText={setWeighInDate} placeholder="2026-06-30" autoCapitalize="none" />

                  <View style={styles.row2}>
                    <View style={styles.col}>
                      <Field label="Current weight" value={currentWeight} onChangeText={setCurrentWeight} placeholder="78kg" />
                    </View>
                    <View style={styles.col}>
                      <Field label="Target weight" value={targetWeight} onChangeText={setTargetWeight} placeholder="74kg" />
                    </View>
                  </View>

                  <Field
                    label="Notes (optional)"
                    style={styles.inputMultiline}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Anything FRAME should hold in mind"
                    multiline
                  />
                </View>

                {error ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}

                <View style={styles.formActions}>
                  <Button title="Cancel" variant="secondary" onPress={resetForm} style={styles.actionBtn} />
                  <Button title={editingId != null ? "Update" : "Schedule"} onPress={submit} loading={saving} style={styles.actionBtn} />
                </View>
              </GlassCard>
            </View>
          )}

          {activeComps.filter((c) => c.id !== pressure?.competition.id).length > 0 && (
            <View style={styles.listSection}>
              <Display size="heading" style={styles.listHeader}>
                Also scheduled
              </Display>
              <GlassCard padding={0}>
                {activeComps
                  .filter((c) => c.id !== pressure?.competition.id)
                  .map((c, i) => (
                    <CompRow
                      key={c.id}
                      comp={c}
                      first={i === 0}
                      onCancel={() => cancelMut.mutate(c.id)}
                      onEdit={() => beginEdit(c)}
                      cancelling={cancelMut.isPending}
                    />
                  ))}
              </GlassCard>
            </View>
          )}

          {pastComps.length > 0 && (
            <View style={styles.listSection}>
              <Display size="heading" style={styles.listHeader}>
                Past
              </Display>
              <GlassCard padding={0}>
                {pastComps.map((c, i) => (
                  <CompRow key={c.id} comp={c} first={i === 0} past />
                ))}
              </GlassCard>
            </View>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

/** Pressure window the countdown bar sweeps over: the last 12 weeks before the event. */
const DIAL_WINDOW_DAYS = 84;

function ActiveCard({
  pressure,
  onCancel,
  onEdit,
  cancelling,
}: {
  pressure: NonNullable<ReturnType<typeof useActiveCompetition>["data"]>["pressure"];
  onCancel: () => void;
  onEdit: () => void;
  cancelling: boolean;
}) {
  if (!pressure) return null;
  const hot = pressure.tier === "sharpen" || pressure.tier === "peak" || pressure.tier === "fight_week";
  const c = pressure.competition;
  const days = pressure.daysToEvent;
  const progress = Math.max(0, Math.min(1, (DIAL_WINDOW_DAYS - Math.max(0, days)) / DIAL_WINDOW_DAYS));

  return (
    <GlassCard raised padding={20}>
      <Status label={pressure.tierLabel} tone={hot ? "red" : "gold"} />

      <Display size="heading" style={styles.activeName}>
        {c.eventName}
      </Display>
      {c.discipline ? <Text style={styles.activeDiscipline}>{c.discipline}</Text> : null}

      <View style={styles.countRow} accessible accessibilityLabel={days <= 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"} out`}>
        <Numeral size="hero">{days <= 0 ? "Today" : days}</Numeral>
        {days > 0 ? <Text style={styles.countUnit}>{days === 1 ? "day out" : "days out"}</Text> : null}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }, hot && { backgroundColor: palette.redText }]} />
      </View>

      <View style={styles.metaList}>
        <Meta first label="Event" value={fmtDate(c.eventDate)} />
        {c.weighInDate ? <Meta label="Weigh-in" value={fmtDate(c.weighInDate)} /> : null}
        {pressure.daysToWeighIn != null ? (
          <Meta label="To weigh-in" value={pressure.daysToWeighIn <= 0 ? "now" : `${pressure.daysToWeighIn} days`} />
        ) : null}
        {c.currentWeight || c.targetWeight ? (
          <Meta label="Weight" value={`${c.currentWeight || "—"} → ${c.targetWeight || "—"}`} />
        ) : null}
      </View>

      {c.notes ? <Text style={styles.notes}>{c.notes}</Text> : null}

      <View style={styles.activeActions}>
        <Button title="Edit" variant="secondary" onPress={onEdit} style={styles.actionBtn} />
        <Button title="Cancel competition" variant="danger" onPress={onCancel} loading={cancelling} style={styles.actionBtn} />
      </View>
    </GlassCard>
  );
}

function Meta({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.metaItem, !first && styles.rule]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function CompRow({
  comp,
  first,
  onCancel,
  onEdit,
  cancelling,
  past,
}: {
  comp: Competition;
  first?: boolean;
  onCancel?: () => void;
  onEdit?: () => void;
  cancelling?: boolean;
  past?: boolean;
}) {
  return (
    <View style={[styles.compRow, !first && styles.rule]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.compRowName, past && { color: palette.textMid }]}>{comp.eventName}</Text>
        <Text style={styles.compRowDate}>{fmtDate(comp.eventDate)}</Text>
      </View>
      {!past ? (
        <View style={styles.compRowActions}>
          {onEdit ? <IconButton icon="edit-2" label="Edit competition" onPress={onEdit} /> : null}
          {onCancel && !cancelling ? <IconButton icon="x" label="Cancel competition" onPress={onCancel} /> : null}
        </View>
      ) : (
        <Status label={sentence(comp.status)} />
      )}
    </View>
  );
}

function sentence(s: string): string {
  const v = (s ?? "").toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: SCREEN_PAD, paddingTop: 4, paddingBottom: 8 },
  scroll: { flex: 1 },
  inner: { paddingHorizontal: SCREEN_PAD, paddingTop: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  activeName: { marginTop: 14 },
  activeDiscipline: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid, marginTop: 2 },
  countRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 16 },
  countUnit: { fontFamily: fonts.medium, fontSize: 16, color: palette.textMid },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, marginTop: 16, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.gold },
  metaList: { marginTop: 20, marginHorizontal: -20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  metaItem: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingHorizontal: 20, paddingVertical: 14 },
  metaLabel: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  metaValue: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: palette.textHi, textAlign: "right", flexShrink: 1, fontVariant: ["tabular-nums"] },
  notes: { ...T.bodySm, color: palette.textMid, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  activeActions: { gap: 12, marginTop: 20 },
  actionBtn: { alignSelf: "stretch" },
  compRowActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  formWrap: { marginTop: 20 },
  formTitle: { marginBottom: 16 },
  fields: { gap: 16 },
  inputMultiline: { minHeight: 88, textAlignVertical: "top", paddingTop: 16 },
  row2: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  error: { fontFamily: fonts.regular, fontSize: 14, color: palette.redText, marginTop: 14 },
  formActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  listSection: { marginTop: 32 },
  listHeader: { marginBottom: 12 },
  compRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  compRowName: { fontFamily: fonts.semi, fontSize: 16, color: palette.textHi },
  compRowDate: { fontFamily: fonts.regular, fontSize: 14, color: palette.textMid, marginTop: 2, fontVariant: ["tabular-nums"] },
});
