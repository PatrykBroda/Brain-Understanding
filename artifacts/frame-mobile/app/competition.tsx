import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { toIso } from "@/lib/dateUtils";
import { competitionApi, type Competition, type PressureTier } from "@/lib/competition";
import { useActiveCompetition, useCompetitionList } from "@/hooks/useCompetition";
import {
  ArcGauge,
  Button,
  Display,
  Eyebrow,
  FadeIn,
  Field,
  GlassCard,
  IconButton,
  Screen,
} from "@/components/ui";
import { fonts, palette, radius } from "@/constants/theme";

const TIER_ACCENT: Record<PressureTier, string> = {
  base: palette.goldLight,
  build: palette.goldLight,
  sharpen: palette.redLight,
  peak: palette.redLight,
  fight_week: palette.redLight,
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
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

  const { data: activeData, isLoading: activeLoading } = useActiveCompetition();
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      qc.invalidateQueries({ queryKey: ["competition"] });
      if (editingId === id) resetForm();
    },
  });

  function beginEdit(c: Competition) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
    <Screen>
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Back" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Eyebrow style={{ color: palette.goldLight }}>PRESSURE</Eyebrow>
            <Display size="heading" style={{ marginTop: 2 }}>
              COMPETITION MODE
            </Display>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.inner,
            { paddingBottom: insets.bottom + bottomPad + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FadeIn index={0}>
            {activeLoading ? (
              <ActivityIndicator color={palette.goldLight} style={{ marginTop: 40 }} />
            ) : pressure ? (
              <ActiveCard
                pressure={pressure}
                onCancel={() => cancelMut.mutate(pressure.competition.id)}
                onEdit={() => beginEdit(pressure.competition)}
                cancelling={cancelMut.isPending}
              />
            ) : (
              <GlassCard radius={28} padding={24}>
                <Display size="sub" style={{ marginBottom: 10 }}>
                  No competition scheduled
                </Display>
                <Text style={styles.emptyBody}>
                  Schedule a fight or comp and FRAME ramps the standard it holds you to as the
                  date nears. Pressure lives in the standard, not in noise.
                </Text>
              </GlassCard>
            )}
          </FadeIn>

          {!showForm && (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.scheduleBtn, pressed && styles.scheduleBtnPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowForm(true);
              }}
            >
              <Feather name="plus" size={16} color={palette.goldLight} />
              <Text style={styles.scheduleText}>SCHEDULE COMPETITION</Text>
            </Pressable>
          )}

          {showForm && (
            <View style={styles.formWrap}>
              <GlassCard radius={28} padding={22}>
                <Eyebrow style={styles.formTitle}>
                  {editingId != null ? "EDIT COMPETITION" : "NEW COMPETITION"}
                </Eyebrow>

                <View style={styles.fields}>
                  <Field
                    label="EVENT NAME"
                    value={eventName}
                    onChangeText={setEventName}
                    placeholder="Regional Open"
                  />

                  <Field
                    label="DISCIPLINE"
                    value={discipline}
                    onChangeText={setDiscipline}
                    placeholder="BJJ / MMA / Muay Thai"
                  />

                  <Field
                    label="EVENT DATE (YYYY-MM-DD)"
                    value={eventDate}
                    onChangeText={setEventDate}
                    placeholder="2026-07-01"
                    autoCapitalize="none"
                  />

                  <Field
                    label="WEIGH-IN DATE (OPTIONAL)"
                    value={weighInDate}
                    onChangeText={setWeighInDate}
                    placeholder="2026-06-30"
                    autoCapitalize="none"
                  />

                  <View style={styles.row2}>
                    <View style={styles.col}>
                      <Field
                        label="CURRENT WEIGHT"
                        value={currentWeight}
                        onChangeText={setCurrentWeight}
                        placeholder="78kg"
                      />
                    </View>
                    <View style={styles.col}>
                      <Field
                        label="TARGET WEIGHT"
                        value={targetWeight}
                        onChangeText={setTargetWeight}
                        placeholder="74kg"
                      />
                    </View>
                  </View>

                  <Field
                    label="NOTES (OPTIONAL)"
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
                  <Button
                    title="CANCEL"
                    variant="glass"
                    onPress={resetForm}
                    style={styles.actionBtn}
                  />
                  <Button
                    title={editingId != null ? "UPDATE" : "SCHEDULE"}
                    onPress={submit}
                    loading={saving}
                    style={styles.actionBtn}
                  />
                </View>
              </GlassCard>
            </View>
          )}

          {activeComps.length > 1 && (
            <View style={styles.listSection}>
              <Eyebrow style={styles.listHeader}>ALSO SCHEDULED</Eyebrow>
              {activeComps
                .filter((c) => c.id !== pressure?.competition.id)
                .map((c) => (
                  <CompRow
                    key={c.id}
                    comp={c}
                    onCancel={() => cancelMut.mutate(c.id)}
                    onEdit={() => beginEdit(c)}
                    cancelling={cancelMut.isPending}
                  />
                ))}
            </View>
          )}

          {pastComps.length > 0 && (
            <View style={styles.listSection}>
              <Eyebrow style={styles.listHeader}>PAST</Eyebrow>
              {pastComps.map((c) => (
                <CompRow key={c.id} comp={c} past />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

/** Pressure window the dial sweeps over: the last 12 weeks before the event. */
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
  const accent = TIER_ACCENT[pressure.tier] ?? palette.goldLight;
  const hot = accent === palette.redLight;
  const c = pressure.competition;
  const days = pressure.daysToEvent;

  return (
    <GlassCard tone={hot ? "red" : "gold"} radius={32} padding={24}>
      <Text style={[styles.tierLabel, { color: accent }]}>
        {pressure.tierLabel.toUpperCase()}
      </Text>

      <View style={styles.dial}>
        <ArcGauge
          value={Math.max(0, DIAL_WINDOW_DAYS - Math.max(0, days))}
          max={DIAL_WINDOW_DAYS}
          size={210}
          tone={hot ? "red" : "gold"}
          display={days <= 0 ? "TODAY" : `${days}`}
          unit={days > 0 ? (days === 1 ? "DAY OUT" : "DAYS OUT") : undefined}
        />
      </View>

      <Text style={styles.activeName}>{c.eventName}</Text>
      {c.discipline ? <Text style={styles.activeDiscipline}>{c.discipline}</Text> : null}

      <View style={styles.metaGrid}>
        <Meta label="EVENT" value={fmtDate(c.eventDate)} />
        {c.weighInDate ? <Meta label="WEIGH-IN" value={fmtDate(c.weighInDate)} /> : null}
        {pressure.daysToWeighIn != null ? (
          <Meta
            label="TO WEIGH-IN"
            value={pressure.daysToWeighIn <= 0 ? "now" : `${pressure.daysToWeighIn} days`}
          />
        ) : null}
        {c.currentWeight || c.targetWeight ? (
          <Meta
            label="WEIGHT"
            value={`${c.currentWeight || "—"} → ${c.targetWeight || "—"}`}
          />
        ) : null}
      </View>

      {c.notes ? <Text style={styles.notes}>{c.notes}</Text> : null}

      <View style={styles.activeActions}>
        <Button
          title="EDIT"
          variant="glass"
          onPress={onEdit}
          style={styles.actionBtn}
        />
        <Button
          title={cancelling ? "CANCELLING…" : "CANCEL COMPETITION"}
          variant="danger"
          onPress={onCancel}
          disabled={cancelling}
          style={styles.actionBtn}
        />
      </View>
    </GlassCard>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function CompRow({
  comp,
  onCancel,
  onEdit,
  cancelling,
  past,
}: {
  comp: Competition;
  onCancel?: () => void;
  onEdit?: () => void;
  cancelling?: boolean;
  past?: boolean;
}) {
  return (
    <View style={styles.compRowWrap}>
      <GlassCard radius={22} padding={16}>
        <View style={styles.compRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.compRowName, past && { color: palette.textMid }]}>
              {comp.eventName}
            </Text>
            <Text style={styles.compRowDate}>{fmtDate(comp.eventDate)}</Text>
          </View>
          {!past ? (
            <View style={styles.compRowActions}>
              {onEdit ? <IconButton icon="edit-2" label="Edit competition" onPress={onEdit} /> : null}
              {onCancel && !cancelling ? (
                <IconButton icon="x" label="Cancel competition" onPress={onCancel} />
              ) : null}
            </View>
          ) : (
            <Text style={styles.compStatus}>{comp.status.toUpperCase()}</Text>
          )}
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  scroll: { flex: 1 },
  inner: { paddingHorizontal: 20, paddingTop: 12 },
  emptyBody: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: palette.textMid,
    lineHeight: 22,
  },
  tierLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    textAlign: "center",
  },
  dial: { alignItems: "center", marginTop: 12, marginBottom: 4 },
  activeName: {
    fontFamily: fonts.displayItalic,
    fontSize: 28,
    lineHeight: 32,
    color: palette.textHi,
    textAlign: "center",
    marginTop: 8,
  },
  activeDiscipline: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: palette.textMid,
    textAlign: "center",
    marginTop: 6,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  metaItem: { minWidth: "40%", flexGrow: 1, gap: 4 },
  metaLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: palette.textLow,
  },
  metaValue: { fontFamily: fonts.text, fontSize: 14, color: palette.text },
  notes: {
    fontFamily: fonts.text,
    fontSize: 13.5,
    color: palette.textMid,
    lineHeight: 21,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  activeActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 22 },
  actionBtn: { flex: 1, minWidth: 140, paddingHorizontal: 16 },
  compRowActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  scheduleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.goldHair,
    backgroundColor: palette.goldWash,
    marginTop: 20,
  },
  scheduleBtnPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  scheduleText: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    letterSpacing: 1.4,
    color: palette.goldPale,
  },
  formWrap: { marginTop: 20 },
  formTitle: { color: palette.goldLight, marginBottom: 18 },
  fields: { gap: 16 },
  inputMultiline: { minHeight: 88, textAlignVertical: "top", paddingTop: 16 },
  row2: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  error: {
    fontFamily: fonts.text,
    fontSize: 13,
    color: palette.redLight,
    marginTop: 14,
  },
  formActions: { flexDirection: "row", gap: 12, marginTop: 22 },
  listSection: { marginTop: 32 },
  listHeader: { marginBottom: 12 },
  compRowWrap: { marginBottom: 10 },
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  compRowName: { fontFamily: fonts.textMedium, fontSize: 15, color: palette.text },
  compRowDate: { fontFamily: fonts.text, fontSize: 12.5, color: palette.textLow, marginTop: 3 },
  compStatus: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: palette.textLow,
  },
});
