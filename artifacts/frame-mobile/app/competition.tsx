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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { competitionApi, type Competition, type PressureTier } from "@/lib/competition";
import { useActiveCompetition, useCompetitionList } from "@/hooks/useCompetition";

const TIER_ACCENT: Record<PressureTier, string> = {
  base: "#C9883A",
  build: "#C9883A",
  sharpen: "#d2553f",
  peak: "#e0604a",
  fight_week: "#ff6a4d",
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

function toIso(dateStr: string): string | null {
  const raw = dateStr.trim();
  // Accept strict YYYY-MM-DD (optionally with a THH:MM time) only — avoids
  // ambiguous cross-engine Date parsing of free-form strings.
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(raw);
  if (!m) return null;
  const [, y, mo, da, hh, mm] = m;
  const d = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(hh ?? 0), Number(mm ?? 0)),
  );
  if (Number.isNaN(d.getTime())) return null;
  // Reject overflowed components (e.g. 2026-13-40).
  if (d.getUTCMonth() !== Number(mo) - 1 || d.getUTCDate() !== Number(da)) return null;
  return d.toISOString();
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

  const createMut = useMutation({
    mutationFn: () => {
      const iso = toIso(eventDate);
      if (!iso) throw new Error("Enter a valid event date (YYYY-MM-DD)");
      const weighIso = weighInDate.trim() ? toIso(weighInDate) : null;
      if (weighInDate.trim() && !weighIso) throw new Error("Weigh-in date is invalid");
      return competitionApi.create({
        eventName: eventName.trim(),
        discipline: discipline.trim(),
        eventDate: iso,
        weighInDate: weighIso,
        currentWeight: currentWeight.trim(),
        targetWeight: targetWeight.trim(),
        notes: notes.trim(),
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ["competition"] });
      setShowForm(false);
      setEventName("");
      setDiscipline("");
      setEventDate("");
      setWeighInDate("");
      setCurrentWeight("");
      setTargetWeight("");
      setNotes("");
      setError(null);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not schedule competition");
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => competitionApi.cancel(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      qc.invalidateQueries({ queryKey: ["competition"] });
    },
  });

  function submit() {
    if (!eventName.trim()) {
      setError("Event name is required");
      return;
    }
    setError(null);
    createMut.mutate();
  }

  const activeComps = competitions.filter((c) => c.status === "active");
  const pastComps = competitions.filter((c) => c.status !== "active");

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color="#999" />
        </Pressable>
        <Text style={styles.headerTitle}>COMPETITION MODE</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.inner,
          { paddingBottom: insets.bottom + bottomPad + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {activeLoading ? (
          <ActivityIndicator color="#C9883A" style={{ marginTop: 40 }} />
        ) : pressure ? (
          <ActiveCard
            pressure={pressure}
            onCancel={() => cancelMut.mutate(pressure.competition.id)}
            cancelling={cancelMut.isPending}
          />
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No competition scheduled</Text>
            <Text style={styles.emptyBody}>
              Schedule a fight or comp and FRAME ramps the standard it holds you to as the
              date nears. Pressure lives in the standard, not in noise.
            </Text>
          </View>
        )}

        {!showForm && (
          <Pressable
            style={({ pressed }) => [styles.scheduleBtn, pressed && styles.scheduleBtnPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowForm(true);
            }}
          >
            <Feather name="plus" size={16} color="#C9883A" />
            <Text style={styles.scheduleText}>SCHEDULE COMPETITION</Text>
          </Pressable>
        )}

        {showForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>NEW COMPETITION</Text>

            <Field label="EVENT NAME">
              <TextInput
                style={styles.input}
                value={eventName}
                onChangeText={setEventName}
                placeholder="Regional Open"
                placeholderTextColor="#444"
              />
            </Field>

            <Field label="DISCIPLINE">
              <TextInput
                style={styles.input}
                value={discipline}
                onChangeText={setDiscipline}
                placeholder="BJJ / MMA / Muay Thai"
                placeholderTextColor="#444"
              />
            </Field>

            <Field label="EVENT DATE (YYYY-MM-DD)">
              <TextInput
                style={styles.input}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="2026-07-01"
                placeholderTextColor="#444"
                autoCapitalize="none"
              />
            </Field>

            <Field label="WEIGH-IN DATE (OPTIONAL)">
              <TextInput
                style={styles.input}
                value={weighInDate}
                onChangeText={setWeighInDate}
                placeholder="2026-06-30"
                placeholderTextColor="#444"
                autoCapitalize="none"
              />
            </Field>

            <View style={styles.row2}>
              <View style={styles.col}>
                <Field label="CURRENT WEIGHT">
                  <TextInput
                    style={styles.input}
                    value={currentWeight}
                    onChangeText={setCurrentWeight}
                    placeholder="78kg"
                    placeholderTextColor="#444"
                  />
                </Field>
              </View>
              <View style={styles.col}>
                <Field label="TARGET WEIGHT">
                  <TextInput
                    style={styles.input}
                    value={targetWeight}
                    onChangeText={setTargetWeight}
                    placeholder="74kg"
                    placeholderTextColor="#444"
                  />
                </Field>
              </View>
            </View>

            <Field label="NOTES (OPTIONAL)">
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything FRAME should hold in mind"
                placeholderTextColor="#444"
                multiline
              />
            </Field>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.formActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => {
                  setShowForm(false);
                  setError(null);
                }}
              >
                <Text style={styles.cancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={[styles.submitBtn, createMut.isPending && { opacity: 0.6 }]}
                onPress={submit}
                disabled={createMut.isPending}
              >
                {createMut.isPending ? (
                  <ActivityIndicator size="small" color="#050505" />
                ) : (
                  <Text style={styles.submitText}>SCHEDULE</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {activeComps.length > 1 && (
          <View style={styles.listSection}>
            <Text style={styles.listHeader}>ALSO SCHEDULED</Text>
            {activeComps
              .filter((c) => c.id !== pressure?.competition.id)
              .map((c) => (
                <CompRow
                  key={c.id}
                  comp={c}
                  onCancel={() => cancelMut.mutate(c.id)}
                  cancelling={cancelMut.isPending}
                />
              ))}
          </View>
        )}

        {pastComps.length > 0 && (
          <View style={styles.listSection}>
            <Text style={styles.listHeader}>PAST</Text>
            {pastComps.map((c) => (
              <CompRow key={c.id} comp={c} past />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ActiveCard({
  pressure,
  onCancel,
  cancelling,
}: {
  pressure: NonNullable<ReturnType<typeof useActiveCompetition>["data"]>["pressure"];
  onCancel: () => void;
  cancelling: boolean;
}) {
  if (!pressure) return null;
  const accent = TIER_ACCENT[pressure.tier] ?? "#C9883A";
  const c = pressure.competition;
  const days = pressure.daysToEvent;

  return (
    <View style={[styles.activeCard, { borderColor: accent }]}>
      <View style={styles.activeTop}>
        <Text style={[styles.tierLabel, { color: accent }]}>
          {pressure.tierLabel.toUpperCase()}
        </Text>
        <Text style={[styles.daysBig, { color: accent }]}>
          {days <= 0 ? "TODAY" : `${days}`}
        </Text>
        {days > 0 && <Text style={styles.daysUnit}>{days === 1 ? "DAY OUT" : "DAYS OUT"}</Text>}
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

      <Pressable
        style={styles.cancelComp}
        onPress={onCancel}
        disabled={cancelling}
      >
        <Text style={styles.cancelCompText}>
          {cancelling ? "CANCELLING…" : "CANCEL COMPETITION"}
        </Text>
      </Pressable>
    </View>
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
  cancelling,
  past,
}: {
  comp: Competition;
  onCancel?: () => void;
  cancelling?: boolean;
  past?: boolean;
}) {
  return (
    <View style={styles.compRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.compRowName, past && { color: "#666" }]}>{comp.eventName}</Text>
        <Text style={styles.compRowDate}>{fmtDate(comp.eventDate)}</Text>
      </View>
      {!past && onCancel ? (
        <Pressable onPress={onCancel} disabled={cancelling} hitSlop={8}>
          <Feather name="x" size={16} color="#666" />
        </Pressable>
      ) : (
        <Text style={styles.compStatus}>{comp.status.toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  backBtn: {
    width: 22,
  },
  headerTitle: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 4,
    color: "#e0e0e0",
  },
  scroll: {
    flex: 1,
  },
  inner: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    padding: 20,
  },
  emptyTitle: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    letterSpacing: 2,
    color: "#e0e0e0",
    marginBottom: 10,
  },
  emptyBody: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#777",
    lineHeight: 21,
  },
  activeCard: {
    borderWidth: 1,
    backgroundColor: "#0a0a0a",
    padding: 20,
  },
  activeTop: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  tierLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    flex: 1,
  },
  daysBig: {
    fontFamily: "SpaceMono",
    fontSize: 34,
  },
  daysUnit: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1.5,
    color: "#666",
  },
  activeName: {
    fontFamily: "Outfit",
    fontSize: 20,
    fontWeight: "600",
    color: "#e8e8e8",
    marginTop: 12,
  },
  activeDiscipline: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#666",
    marginTop: 4,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  metaItem: {
    minWidth: "40%",
    gap: 4,
  },
  metaLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#555",
  },
  metaValue: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#c0c0c0",
  },
  notes: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#888",
    lineHeight: 20,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  cancelComp: {
    marginTop: 18,
    alignSelf: "flex-start",
  },
  cancelCompText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#6a3a35",
  },
  scheduleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(201,136,58,0.4)",
    paddingVertical: 14,
    marginTop: 16,
  },
  scheduleBtnPressed: {
    borderColor: "#C9883A",
    backgroundColor: "rgba(201,136,58,0.06)",
  },
  scheduleText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#C9883A",
  },
  form: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    padding: 18,
  },
  formTitle: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#C9883A",
    marginBottom: 16,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#555",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#050505",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMultiline: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  row2: {
    flexDirection: "row",
    gap: 12,
  },
  col: {
    flex: 1,
  },
  error: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#d2553f",
    marginBottom: 12,
  },
  formActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#666",
  },
  submitBtn: {
    flex: 1,
    backgroundColor: "#C9883A",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#050505",
  },
  listSection: {
    marginTop: 28,
  },
  listHeader: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#444",
    marginBottom: 12,
  },
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 12,
  },
  compRowName: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
  },
  compRowDate: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#555",
    marginTop: 3,
  },
  compStatus: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1.5,
    color: "#555",
  },
});
