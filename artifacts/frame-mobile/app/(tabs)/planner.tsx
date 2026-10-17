import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { apiGet, apiPatch, apiPost, apiUrl, ApiError } from "@/lib/api";
import { AiConsentModal } from "@/components/AiAnalysisConsentModal";
import type { AiConsentStatus } from "@/lib/aiConsent";
import { toIso } from "@/lib/dateUtils";
import {
  competitionApi,
  SESSION_TYPES,
  type CampReview,
  type Competition,
  type PressureTier,
  type SessionType,
  type TrainingSession,
  type WeightCut,
} from "@/lib/competition";
import {
  useActiveCompetition,
  useCreateSession,
  useDeleteSession,
  useUpdateSession,
} from "@/hooks/useCompetition";
import { GoogleCalendarSync } from "@/components/GoogleCalendarSync";
import { useIsFramePlus } from "@/hooks/useEntitlement";
import { LinearGradient } from "expo-linear-gradient";
import { ArcGauge, IconButton, Screen } from "@/components/ui";
import { fonts, gradients, palette, radius } from "@/constants/theme";

const TIER_ACCENT: Record<PressureTier, string> = {
  base: palette.goldLight,
  build: palette.goldLight,
  sharpen: palette.redLight,
  peak: palette.redLight,
  fight_week: palette.redLight,
};

/** Pressure window the countdown dial sweeps over: the last 12 weeks before the event. */
const DIAL_WINDOW_DAYS = 84;

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  sparring: "SPARRING",
  wrestling: "WRESTLING",
  bjj: "BJJ",
  striking: "STRIKING",
  conditioning: "CONDITIONING",
  recovery: "RECOVERY",
  mobility: "MOBILITY",
};

// Local YYYY-MM-DD -> readable label without timezone drift.
function fmtDayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ISO timestamp -> "Fri, Sep 11, 2026" (read in UTC to avoid tz drift), so the
// dashboard detail rows match the web CampDashboard's formatDay.
function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ISO timestamp -> YYYY-MM-DD for prefilling the date TextInputs on edit.
function isoToInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

// Validate a user-typed date and return a clean YYYY-MM-DD, or null.
function toYmd(input: string): string | null {
  const iso = toIso(input);
  return iso ? iso.slice(0, 10) : null;
}

export default function CampScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <Screen>
    <View style={[shell.root, { paddingTop: topPad }]}>
      <View style={shell.header}>
        <IconButton
          icon="chevron-left"
          label="Back to home"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            router.push("/(tabs)/home");
          }}
        />

        <View style={shell.brand}>
          <Image
            source={require("../../assets/images/frame-logo.png")}
            style={shell.logo}
            resizeMode="contain"
          />
          <View>
            <Text style={shell.title}>CAMP</Text>
            <Text style={shell.subtitle}>FIGHT CAMP</Text>
          </View>
        </View>

        <View style={shell.headerRight}>
          <FramePlusPill />
        </View>
      </View>

      <CampView />
    </View>
    </Screen>
  );
}

// Top-right entitlement pill, mirroring the web header's FramePlusPill.
function FramePlusPill() {
  const isPlus = useIsFramePlus();
  if (isPlus) {
    return (
      <View style={shell.plusPill}>
        <Text style={shell.plusPillText}>FRAME+</Text>
      </View>
    );
  }
  return (
    <Pressable
      style={shell.plusPill}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push("/paywall");
      }}
    >
      <Text style={shell.plusPillText}>FRAME+</Text>
    </Pressable>
  );
}

// Schedule / Weekly-mission switch, positioned below the dashboard + review to
// match the web ViewTab (grid-cols-2, accent border when active).
function ViewTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[camp.viewTab, active && camp.viewTabActive]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
    >
      <Text style={[camp.viewTabText, active && camp.viewTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* CAMP VIEW — dashboard + session schedule + create/edit camp        */
/* ------------------------------------------------------------------ */

function CampView() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const [view, setView] = useState<"schedule" | "mission">("schedule");

  const { data, isLoading, refetch, isRefetching } = useActiveCompetition();
  const competition = data?.competition ?? null;
  const pressure = data?.pressure ?? null;
  const weightCut = data?.weightCut ?? null;
  const sessions = data?.sessions ?? [];
  const review = data?.review ?? null;

  // ---- camp form ----
  const [showCampForm, setShowCampForm] = useState(false);
  const [editingCampId, setEditingCampId] = useState<number | null>(null);
  const [eventName, setEventName] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [weighInDate, setWeighInDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [promotion, setPromotion] = useState("");
  const [weightClass, setWeightClass] = useState("");
  const [rounds, setRounds] = useState("");
  const [location, setLocation] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [campError, setCampError] = useState<string | null>(null);

  function resetCampForm() {
    setShowCampForm(false);
    setEditingCampId(null);
    setEventName("");
    setDiscipline("");
    setEventDate("");
    setWeighInDate("");
    setOpponent("");
    setPromotion("");
    setWeightClass("");
    setRounds("");
    setLocation("");
    setCurrentWeight("");
    setTargetWeight("");
    setNotes("");
    setCampError(null);
  }

  function buildCampInput() {
    const iso = toIso(eventDate);
    if (!iso) throw new Error("Enter a valid event date (YYYY-MM-DD)");
    const weighIso = weighInDate.trim() ? toIso(weighInDate) : null;
    if (weighInDate.trim() && !weighIso) throw new Error("Weigh-in date is invalid");
    let roundsNum: number | null = null;
    if (rounds.trim()) {
      const n = Number(rounds.trim());
      if (!Number.isFinite(n)) throw new Error("Rounds must be a number");
      roundsNum = Math.trunc(n);
    }
    return {
      eventName: eventName.trim(),
      discipline: discipline.trim(),
      eventDate: iso,
      weighInDate: weighIso,
      opponent: opponent.trim(),
      promotion: promotion.trim(),
      weightClass: weightClass.trim(),
      rounds: roundsNum,
      location: location.trim(),
      currentWeight: currentWeight.trim(),
      targetWeight: targetWeight.trim(),
      notes: notes.trim(),
    };
  }

  const createCampMut = useMutation({
    mutationFn: () => competitionApi.create(buildCampInput()),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ["competition"] });
      resetCampForm();
    },
    onError: (e: unknown) => {
      setCampError(e instanceof Error ? e.message : "Could not create camp");
    },
  });

  const updateCampMut = useMutation({
    mutationFn: (id: number) => competitionApi.update(id, buildCampInput()),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ["competition"] });
      resetCampForm();
    },
    onError: (e: unknown) => {
      setCampError(e instanceof Error ? e.message : "Could not update camp");
    },
  });

  const cancelCampMut = useMutation({
    mutationFn: (id: number) => competitionApi.cancel(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      qc.invalidateQueries({ queryKey: ["competition"] });
      resetCampForm();
    },
  });

  const campSaving = createCampMut.isPending || updateCampMut.isPending;

  function beginEditCamp(c: Competition) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setEditingCampId(c.id);
    setEventName(c.eventName ?? "");
    setDiscipline(c.discipline ?? "");
    setEventDate(isoToInput(c.eventDate));
    setWeighInDate(isoToInput(c.weighInDate));
    setOpponent(c.opponent ?? "");
    setPromotion(c.promotion ?? "");
    setWeightClass(c.weightClass ?? "");
    setRounds(c.rounds != null ? String(c.rounds) : "");
    setLocation(c.location ?? "");
    setCurrentWeight(c.currentWeight ?? "");
    setTargetWeight(c.targetWeight ?? "");
    setNotes(c.notes ?? "");
    setCampError(null);
    setShowCampForm(true);
  }

  function submitCamp() {
    if (!eventName.trim()) {
      setCampError("Event name is required");
      return;
    }
    setCampError(null);
    if (editingCampId != null) updateCampMut.mutate(editingCampId);
    else createCampMut.mutate();
  }

  // ---- session form ----
  const createSessionMut = useCreateSession();
  const updateSessionMut = useUpdateSession();
  const deleteSessionMut = useDeleteSession();

  const [showSessionForm, setShowSessionForm] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [sType, setSType] = useState<SessionType>("sparring");
  const [sDate, setSDate] = useState("");
  const [sTime, setSTime] = useState("");
  const [sDuration, setSDuration] = useState("");
  const [sCoach, setSCoach] = useState("");
  const [sObjective, setSObjective] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);

  function resetSessionForm() {
    setShowSessionForm(false);
    setEditingSessionId(null);
    setSType("sparring");
    setSDate("");
    setSTime("");
    setSDuration("");
    setSCoach("");
    setSObjective("");
    setSessionError(null);
  }

  function beginEditSession(s: TrainingSession) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setEditingSessionId(s.id);
    setSType(s.sessionType);
    setSDate(s.sessionDate.slice(0, 10));
    setSTime(s.startTime ?? "");
    setSDuration(s.durationMin != null ? String(s.durationMin) : "");
    setSCoach(s.coach ?? "");
    setSObjective(s.objective ?? "");
    setSessionError(null);
    setShowSessionForm(true);
  }

  function submitSession() {
    if (!competition) return;
    const ymd = toYmd(sDate);
    if (!ymd) {
      setSessionError("Enter a valid date (YYYY-MM-DD)");
      return;
    }
    const time = sTime.trim();
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      setSessionError("Time must be HH:MM");
      return;
    }
    let durationNum: number | null = null;
    if (sDuration.trim()) {
      const n = Number(sDuration.trim());
      if (!Number.isFinite(n)) {
        setSessionError("Duration must be a number");
        return;
      }
      durationNum = Math.trunc(n);
    }
    setSessionError(null);
    const input = {
      sessionType: sType,
      sessionDate: ymd,
      startTime: time || null,
      durationMin: durationNum,
      coach: sCoach.trim(),
      objective: sObjective.trim(),
    };
    if (editingSessionId != null) {
      updateSessionMut.mutate(
        { id: editingSessionId, input },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            resetSessionForm();
          },
          onError: (e: unknown) =>
            setSessionError(e instanceof Error ? e.message : "Could not update session"),
        },
      );
    } else {
      createSessionMut.mutate(
        { campId: competition.id, input },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            resetSessionForm();
          },
          onError: (e: unknown) =>
            setSessionError(e instanceof Error ? e.message : "Could not add session"),
        },
      );
    }
  }

  function toggleSession(s: TrainingSession) {
    if (s.source === "google_calendar") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    updateSessionMut.mutate({ id: s.id, input: { completed: !s.completed } });
  }

  function removeSession(s: TrainingSession) {
    if (s.source === "google_calendar") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    deleteSessionMut.mutate(s.id);
  }

  const sessionSaving = createSessionMut.isPending || updateSessionMut.isPending;
  const groups = groupSessions(sessions);

  // Shared so it renders both when creating a first camp (no-camp branch) and
  // when editing an existing one (dashboard edit). Without this, tapping
  // "CREATE YOUR CAMP" on the empty state showed nothing.
  const campFormNode = showCampForm ? (
    <CampForm
      editing={editingCampId != null}
      eventName={eventName}
      setEventName={setEventName}
      discipline={discipline}
      setDiscipline={setDiscipline}
      eventDate={eventDate}
      setEventDate={setEventDate}
      weighInDate={weighInDate}
      setWeighInDate={setWeighInDate}
      opponent={opponent}
      setOpponent={setOpponent}
      promotion={promotion}
      setPromotion={setPromotion}
      weightClass={weightClass}
      setWeightClass={setWeightClass}
      rounds={rounds}
      setRounds={setRounds}
      location={location}
      setLocation={setLocation}
      currentWeight={currentWeight}
      setCurrentWeight={setCurrentWeight}
      targetWeight={targetWeight}
      setTargetWeight={setTargetWeight}
      notes={notes}
      setNotes={setNotes}
      error={campError}
      saving={campSaving}
      onCancel={resetCampForm}
      onSubmit={submitCamp}
    />
  ) : null;

  return (
    <ScrollView
      style={camp.scroll}
      contentContainerStyle={[camp.inner, { paddingBottom: insets.bottom + bottomPad + 120 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.goldLight} />
      }
    >
      {isLoading ? (
        <ActivityIndicator color={palette.goldLight} style={{ marginTop: 40 }} />
      ) : !competition ? (
        <>
          <View style={camp.emptyCard}>
            <Text style={camp.emptyTitle}>No camp yet</Text>
            <Text style={camp.emptyBody}>
              Set your fight or comp and FRAME builds the camp around it — countdown, phase, weight
              cut, and the sessions that carry you to the mat.
            </Text>
            {!showCampForm && (
              <Pressable
                style={({ pressed }) => [camp.cta, pressed && camp.ctaPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowCampForm(true);
                }}
              >
                <Feather name="plus" size={16} color={palette.goldLight} />
                <Text style={camp.ctaText}>CREATE YOUR CAMP</Text>
              </Pressable>
            )}
          </View>
          {campFormNode}
        </>
      ) : (
        <>
          {/* Dashboard */}
          <Dashboard
            competition={competition}
            days={pressure?.daysToEvent ?? null}
            tier={pressure?.tier ?? "base"}
            tierLabel={pressure?.tierLabel ?? ""}
            phase={pressure?.phase ?? ""}
            daysToWeighIn={pressure?.daysToWeighIn ?? null}
            weightCut={weightCut}
            onEdit={() => beginEditCamp(competition)}
            onCancel={() => cancelCampMut.mutate(competition.id)}
            cancelling={cancelCampMut.isPending}
          />

          {/* Camp review — cross-analysis intelligence over this camp's footage.
              Server returns review:null for free tier, so null == FRAME+-gated. */}
          {!showCampForm &&
            (review ? <CampReviewSection review={review} /> : <CampReviewLocked />)}

          {/* Schedule / Weekly-mission switch sits below the dashboard + review,
              matching the web layout. Hidden while the camp edit form is open. */}
          {!showCampForm && (
            <>
              <View style={camp.viewTabRow}>
                <ViewTab
                  label="SCHEDULE"
                  active={view === "schedule"}
                  onPress={() => setView("schedule")}
                />
                <ViewTab
                  label="WEEKLY MISSION"
                  active={view === "mission"}
                  onPress={() => setView("mission")}
                />
              </View>

              {view === "schedule" ? (
                <>
                  {/* Session schedule */}
                  <View style={camp.sectionHead}>
                    <Text style={camp.sectionTitle}>SESSION SCHEDULE</Text>
                    {!showSessionForm && (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setShowSessionForm(true);
                        }}
                        hitSlop={8}
                        style={camp.addBtn}
                      >
                        <Feather name="plus" size={14} color={palette.goldLight} />
                        <Text style={camp.addBtnText}>ADD</Text>
                      </Pressable>
                    )}
                  </View>

                  <GoogleCalendarSync campId={competition.id} />

                  {showSessionForm && (
                    <SessionForm
                      editing={editingSessionId != null}
                      sType={sType}
                      setSType={setSType}
                      sDate={sDate}
                      setSDate={setSDate}
                      sTime={sTime}
                      setSTime={setSTime}
                      sDuration={sDuration}
                      setSDuration={setSDuration}
                      sCoach={sCoach}
                      setSCoach={setSCoach}
                      sObjective={sObjective}
                      setSObjective={setSObjective}
                      error={sessionError}
                      saving={sessionSaving}
                      onCancel={resetSessionForm}
                      onSubmit={submitSession}
                    />
                  )}

                  {sessions.length === 0 && !showSessionForm ? (
                    <Text style={camp.noSessions}>
                      No sessions yet. Add the sessions that make up this camp.
                    </Text>
                  ) : (
                    groups.map((g) => (
                      <View key={g.date} style={camp.dayGroup}>
                        <Text style={camp.dayLabel}>{fmtDayLabel(g.date)}</Text>
                        {g.items.map((s) => (
                          <SessionRow
                            key={s.id}
                            session={s}
                            onToggle={() => toggleSession(s)}
                            onEdit={() => beginEditSession(s)}
                            onDelete={() => removeSession(s)}
                            disabled={updateSessionMut.isPending || deleteSessionMut.isPending}
                          />
                        ))}
                      </View>
                    ))
                  )}
                </>
              ) : (
                <MissionContent />
              )}
            </>
          )}

          {/* Camp edit form (opened via dashboard edit) */}
          {campFormNode}
        </>
      )}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* CAMP REVIEW — cross-analysis intelligence over this camp's footage  */
/* Ported from the web (coach/src/pages/planner.tsx). Every field is    */
/* grounded in real records — honest empty states, no fabricated data.  */
/* ------------------------------------------------------------------ */

function CampReviewSection({ review }: { review: CampReview }) {
  const { totalAnalyses, countsByKind, biggestImprovement, mostPersistentLeak } = review;

  return (
    <View style={rev.section}>
      <View style={rev.head}>
        <Text style={rev.headLabel}>CAMP REVIEW</Text>
        <Text style={rev.headCount}>
          {totalAnalyses === 1 ? "1 ANALYSIS" : `${totalAnalyses} ANALYSES`}
        </Text>
      </View>

      {totalAnalyses === 0 ? (
        <View style={rev.body}>
          <Text style={rev.emptyText}>
            No session analysis is attached to this camp yet. Camp review
            trends will appear when supported analysis records are available.
          </Text>
        </View>
      ) : (
        <>
          {/* Session mix — a real count per kind */}
          <View style={rev.mixRow}>
            {countsByKind.map((c) => (
              <View key={c.kind} style={rev.mixItem}>
                <Text style={rev.mixCount}>{c.count}</Text>
                <Text style={rev.mixLabel}>{c.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>

          {/* Biggest real improvement — two recorded endpoints + dates */}
          <View style={rev.block}>
            <Text style={rev.blockLabel}>BIGGEST IMPROVEMENT</Text>
            {biggestImprovement ? (
              <View style={{ marginTop: 8 }}>
                <View style={rev.impTop}>
                  <Text style={rev.impName}>{biggestImprovement.label.toUpperCase()}</Text>
                  <Text style={rev.impDelta}>+{biggestImprovement.delta}</Text>
                </View>
                <Text style={rev.impValues}>
                  {biggestImprovement.from} → {biggestImprovement.to}
                </Text>
                <Text style={rev.impDates}>
                  {fmtDayLabel(biggestImprovement.fromAt)} → {fmtDayLabel(biggestImprovement.toAt)}
                </Text>
              </View>
            ) : (
              <Text style={rev.blockEmpty}>
                {totalAnalyses < 2
                  ? "One session in — log a second analysis and the trend appears here."
                  : "No attribute rose between your first and latest session this camp. Held or dipped — no gain to claim yet."}
              </Text>
            )}
          </View>

          {/* Most persistent real leak — a real recurrence count */}
          <View style={[rev.block, rev.blockLast]}>
            <Text style={rev.blockLabel}>MOST PERSISTENT LEAK</Text>
            {mostPersistentLeak ? (
              <View style={{ marginTop: 8 }}>
                <Text style={rev.leakLabel}>{mostPersistentLeak.label}</Text>
                <Text style={rev.leakMeta}>
                  FLAGGED IN {mostPersistentLeak.sessions} OF {mostPersistentLeak.total} SESSIONS
                </Text>
              </View>
            ) : (
              <Text style={rev.blockEmpty}>
                {totalAnalyses < 2
                  ? "A leak has to recur across sessions to count. One session in, nothing to call persistent."
                  : "No single leak has recurred across your sessions this camp."}
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

// Free tier: the review reads across every analysis in the camp, which is a
// FRAME+ capability. Honest teaser — no fabricated preview numbers.
function CampReviewLocked() {
  return (
    <Pressable
      style={rev.section}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push("/paywall");
      }}
    >
      <View style={rev.head}>
        <Text style={rev.headLabel}>CAMP REVIEW</Text>
        <View style={rev.lockPill}>
          <Feather name="lock" size={10} color={palette.goldLight} />
          <Text style={rev.lockPillText}>FRAME+</Text>
        </View>
      </View>
      <View style={rev.body}>
        <Text style={rev.emptyText}>
          Camp review reads across every analysis in this camp to surface your biggest real gain and
          the leak that keeps recurring — grounded in your recorded sessions, never invented. Part
          of FRAME+.
        </Text>
      </View>
    </Pressable>
  );
}

function groupSessions(sessions: TrainingSession[]): { date: string; items: TrainingSession[] }[] {
  const groups: { date: string; items: TrainingSession[] }[] = [];
  for (const s of sessions) {
    const key = s.sessionDate.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.date === key) last.items.push(s);
    else groups.push({ date: key, items: [s] });
  }
  return groups;
}

function Dashboard({
  competition,
  days,
  tier,
  tierLabel,
  phase,
  daysToWeighIn,
  weightCut,
  onEdit,
  onCancel,
  cancelling,
}: {
  competition: Competition;
  days: number | null;
  tier: PressureTier;
  tierLabel: string;
  phase: string;
  daysToWeighIn: number | null;
  weightCut: WeightCut | null;
  onEdit: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const accent = TIER_ACCENT[tier] ?? palette.goldLight;

  const fightLine = [
    competition.opponent,
    competition.promotion,
    competition.weightClass,
    competition.rounds != null ? `${competition.rounds} rounds` : "",
    competition.location,
  ]
    .filter((v) => v != null && String(v).trim() !== "")
    .join(" · ");

  const cur = (weightCut?.current ?? "").trim();
  const tgt = (weightCut?.target ?? "").trim();
  const weightCutValue = weightCut
    ? cur || tgt
      ? `${cur || "?"} → ${tgt || "?"} · ${weightCut.status}`
      : weightCut.status
    : null;

  return (
    <View>
      {/* Centered countdown card, mirroring the web CampDashboard */}
      <View style={[camp.dashCard, { borderColor: `${accent}55` }]}>
        <LinearGradient
          colors={gradients.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={camp.dashCardTop}>
          <Text style={[camp.phaseLabel, { color: accent }]}>
            {phase ? phase.toUpperCase() : "CAMP"}
          </Text>
          <Pressable style={camp.editInline} onPress={onEdit} hitSlop={6}>
            <Feather name="edit-2" size={11} color={palette.textMid} />
            <Text style={camp.editInlineText}>EDIT</Text>
          </Pressable>
        </View>

        {days != null ? (
          <>
            <View style={camp.dial}>
              <ArcGauge
                value={Math.max(0, DIAL_WINDOW_DAYS - Math.max(0, days))}
                max={DIAL_WINDOW_DAYS}
                size={210}
                tone={accent === palette.redLight ? "red" : "gold"}
                display={String(days <= 0 ? 0 : days)}
              />
            </View>
            <Text style={camp.countdownUnit}>
              {days === 1 ? "DAY UNTIL" : "DAYS UNTIL"} {competition.eventName.toUpperCase()}
            </Text>
            {tierLabel ? (
              <Text style={camp.countdownTier}>{tierLabel.toUpperCase()}</Text>
            ) : null}
            {daysToWeighIn != null ? (
              <Text style={camp.weighInLine}>
                WEIGH-IN:{" "}
                {daysToWeighIn <= 0
                  ? "NOW"
                  : `${daysToWeighIn} ${daysToWeighIn === 1 ? "DAY" : "DAYS"}`}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={camp.dashEventFallback}>{competition.eventName}</Text>
        )}
      </View>

      {/* Detail rows */}
      <View style={camp.rowList}>
        <Row label="EVENT DATE" value={formatDay(competition.eventDate)} />
        {competition.weighInDate ? (
          <Row label="WEIGH-IN DATE" value={formatDay(competition.weighInDate)} />
        ) : null}
        {competition.discipline?.trim() ? (
          <Row label="DISCIPLINE" value={competition.discipline} />
        ) : null}
        {fightLine ? <Row label="FIGHT" value={fightLine} /> : null}
        {weightCutValue ? <Row label="WEIGHT CUT" value={weightCutValue} /> : null}
        {competition.notes?.trim() ? <Row label="NOTES" value={competition.notes} /> : null}
      </View>

      <Pressable
        style={({ pressed }) => [camp.endCampBtn, pressed && camp.endCampBtnPressed]}
        onPress={onCancel}
        disabled={cancelling}
      >
        <Text style={camp.endCampText}>{cancelling ? "ENDING…" : "END CAMP"}</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={camp.row}>
      <Text style={camp.rowLabel}>{label}</Text>
      <Text style={camp.rowValue}>{value}</Text>
    </View>
  );
}

function SessionRow({
  session,
  onToggle,
  onEdit,
  onDelete,
  disabled,
}: {
  session: TrainingSession;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const imported = session.source === "google_calendar";
  const detail = [
    session.startTime ? session.startTime : null,
    session.durationMin != null ? `${session.durationMin} min` : null,
    session.coach ? session.coach : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[camp.sRow, session.completed && camp.sRowDone]}>
      <Pressable
        style={[camp.sCheck, session.completed && camp.sCheckDone, imported && camp.sCheckLocked]}
        onPress={onToggle}
        disabled={disabled || imported}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!session.completed, disabled: disabled || imported }}
      >
        {session.completed && <Feather name="check" size={13} color="#050505" />}
      </Pressable>

      <View style={{ flex: 1 }}>
        <View style={camp.sTopRow}>
          <Text style={camp.sType}>{SESSION_TYPE_LABELS[session.sessionType]}</Text>
          {imported && <Text style={camp.importedTag}>IMPORTED</Text>}
        </View>
        {detail ? <Text style={camp.sDetail}>{detail}</Text> : null}
        {session.objective ? <Text style={camp.sObjective}>{session.objective}</Text> : null}
      </View>

      {!imported && (
        <View style={camp.sActions}>
          <Pressable onPress={onEdit} disabled={disabled} style={camp.iconTap} accessibilityLabel="Edit session">
            <Feather name="edit-2" size={14} color={palette.textMid} />
          </Pressable>
          <Pressable onPress={onDelete} disabled={disabled} style={camp.iconTap} accessibilityLabel="Delete session">
            <Feather name="trash-2" size={14} color={palette.redLight} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SessionForm(props: {
  editing: boolean;
  sType: SessionType;
  setSType: (v: SessionType) => void;
  sDate: string;
  setSDate: (v: string) => void;
  sTime: string;
  setSTime: (v: string) => void;
  sDuration: string;
  setSDuration: (v: string) => void;
  sCoach: string;
  setSCoach: (v: string) => void;
  sObjective: string;
  setSObjective: (v: string) => void;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={camp.form}>
      <Text style={camp.formTitle}>{props.editing ? "EDIT SESSION" : "NEW SESSION"}</Text>

      <Field label="SESSION TYPE">
        <View style={camp.chips}>
          {SESSION_TYPES.map((t) => (
            <Pressable
              key={t}
              style={[camp.chip, props.sType === t && camp.chipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                props.setSType(t);
              }}
            >
              <Text style={[camp.chipText, props.sType === t && camp.chipTextActive]}>
                {SESSION_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="DATE (YYYY-MM-DD)">
        <TextInput
          style={camp.input}
          value={props.sDate}
          onChangeText={props.setSDate}
          placeholder="2026-07-01"
          placeholderTextColor={palette.textLow}
          autoCapitalize="none"
        />
      </Field>

      <View style={camp.row2}>
        <View style={camp.col}>
          <Field label="TIME (HH:MM)">
            <TextInput
              style={camp.input}
              value={props.sTime}
              onChangeText={props.setSTime}
              placeholder="18:00"
              placeholderTextColor={palette.textLow}
              autoCapitalize="none"
            />
          </Field>
        </View>
        <View style={camp.col}>
          <Field label="DURATION (MIN)">
            <TextInput
              style={camp.input}
              value={props.sDuration}
              onChangeText={props.setSDuration}
              placeholder="60"
              placeholderTextColor={palette.textLow}
              keyboardType="number-pad"
            />
          </Field>
        </View>
      </View>

      <Field label="COACH (OPTIONAL)">
        <TextInput
          style={camp.input}
          value={props.sCoach}
          onChangeText={props.setSCoach}
          placeholder="Name"
          placeholderTextColor={palette.textLow}
        />
      </Field>

      <Field label="OBJECTIVE (OPTIONAL)">
        <TextInput
          style={[camp.input, camp.inputMultiline]}
          value={props.sObjective}
          onChangeText={props.setSObjective}
          placeholder="What this session is for"
          placeholderTextColor={palette.textLow}
          multiline
        />
      </Field>

      {props.error ? <Text style={camp.error}>{props.error}</Text> : null}

      <View style={camp.formActions}>
        <Pressable style={camp.cancelBtn} onPress={props.onCancel}>
          <Text style={camp.cancelText}>CANCEL</Text>
        </Pressable>
        <Pressable
          style={[camp.submitBtn, props.saving && { opacity: 0.6 }]}
          onPress={props.onSubmit}
          disabled={props.saving}
        >
          {props.saving ? (
            <ActivityIndicator size="small" color="#050505" />
          ) : (
            <Text style={camp.submitText}>{props.editing ? "UPDATE" : "ADD SESSION"}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function CampForm(props: {
  editing: boolean;
  eventName: string;
  setEventName: (v: string) => void;
  discipline: string;
  setDiscipline: (v: string) => void;
  eventDate: string;
  setEventDate: (v: string) => void;
  weighInDate: string;
  setWeighInDate: (v: string) => void;
  opponent: string;
  setOpponent: (v: string) => void;
  promotion: string;
  setPromotion: (v: string) => void;
  weightClass: string;
  setWeightClass: (v: string) => void;
  rounds: string;
  setRounds: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  currentWeight: string;
  setCurrentWeight: (v: string) => void;
  targetWeight: string;
  setTargetWeight: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={camp.form}>
      <Text style={camp.formTitle}>{props.editing ? "EDIT CAMP" : "NEW CAMP"}</Text>

      <Field label="EVENT NAME">
        <TextInput
          style={camp.input}
          value={props.eventName}
          onChangeText={props.setEventName}
          placeholder="Regional Open"
          placeholderTextColor={palette.textLow}
        />
      </Field>

      <Field label="DISCIPLINE">
        <TextInput
          style={camp.input}
          value={props.discipline}
          onChangeText={props.setDiscipline}
          placeholder="BJJ / MMA / Muay Thai"
          placeholderTextColor={palette.textLow}
        />
      </Field>

      <Field label="EVENT DATE (YYYY-MM-DD)">
        <TextInput
          style={camp.input}
          value={props.eventDate}
          onChangeText={props.setEventDate}
          placeholder="2026-07-01"
          placeholderTextColor={palette.textLow}
          autoCapitalize="none"
        />
      </Field>

      <Field label="WEIGH-IN DATE (OPTIONAL)">
        <TextInput
          style={camp.input}
          value={props.weighInDate}
          onChangeText={props.setWeighInDate}
          placeholder="2026-06-30"
          placeholderTextColor={palette.textLow}
          autoCapitalize="none"
        />
      </Field>

      <View style={camp.row2}>
        <View style={camp.col}>
          <Field label="OPPONENT">
            <TextInput
              style={camp.input}
              value={props.opponent}
              onChangeText={props.setOpponent}
              placeholder="Name"
              placeholderTextColor={palette.textLow}
            />
          </Field>
        </View>
        <View style={camp.col}>
          <Field label="PROMOTION">
            <TextInput
              style={camp.input}
              value={props.promotion}
              onChangeText={props.setPromotion}
              placeholder="Org"
              placeholderTextColor={palette.textLow}
            />
          </Field>
        </View>
      </View>

      <View style={camp.row2}>
        <View style={camp.col}>
          <Field label="WEIGHT CLASS">
            <TextInput
              style={camp.input}
              value={props.weightClass}
              onChangeText={props.setWeightClass}
              placeholder="Lightweight"
              placeholderTextColor={palette.textLow}
            />
          </Field>
        </View>
        <View style={camp.col}>
          <Field label="ROUNDS">
            <TextInput
              style={camp.input}
              value={props.rounds}
              onChangeText={props.setRounds}
              placeholder="3"
              placeholderTextColor={palette.textLow}
              keyboardType="number-pad"
            />
          </Field>
        </View>
      </View>

      <Field label="LOCATION (OPTIONAL)">
        <TextInput
          style={camp.input}
          value={props.location}
          onChangeText={props.setLocation}
          placeholder="City / venue"
          placeholderTextColor={palette.textLow}
        />
      </Field>

      <View style={camp.row2}>
        <View style={camp.col}>
          <Field label="CURRENT WEIGHT">
            <TextInput
              style={camp.input}
              value={props.currentWeight}
              onChangeText={props.setCurrentWeight}
              placeholder="78kg"
              placeholderTextColor={palette.textLow}
            />
          </Field>
        </View>
        <View style={camp.col}>
          <Field label="TARGET WEIGHT">
            <TextInput
              style={camp.input}
              value={props.targetWeight}
              onChangeText={props.setTargetWeight}
              placeholder="74kg"
              placeholderTextColor={palette.textLow}
            />
          </Field>
        </View>
      </View>

      <Field label="NOTES (OPTIONAL)">
        <TextInput
          style={[camp.input, camp.inputMultiline]}
          value={props.notes}
          onChangeText={props.setNotes}
          placeholder="Anything FRAME should hold in mind"
          placeholderTextColor={palette.textLow}
          multiline
        />
      </Field>

      {props.error ? <Text style={camp.error}>{props.error}</Text> : null}

      <View style={camp.formActions}>
        <Pressable style={camp.cancelBtn} onPress={props.onCancel}>
          <Text style={camp.cancelText}>CANCEL</Text>
        </Pressable>
        <Pressable
          style={[camp.submitBtn, props.saving && { opacity: 0.6 }]}
          onPress={props.onSubmit}
          disabled={props.saving}
        >
          {props.saving ? (
            <ActivityIndicator size="small" color="#050505" />
          ) : (
            <Text style={camp.submitText}>{props.editing ? "UPDATE CAMP" : "CREATE CAMP"}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={camp.field}>
      <Text style={camp.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* MISSION VIEW — preserved AI weekly mission                          */
/* ------------------------------------------------------------------ */

interface PlanItem {
  key: string;
  section: string;
  content: string;
  sourceLabel: string | null;
  completed?: boolean;
}

interface WeeklyPlan {
  id: number;
  weekStart: string;
  focusSummary: string | null;
  structuralObjective: string | null;
  items: PlanItem[];
}

const SECTION_LABELS: Record<string, string> = {
  primary_weakness: "PRIMARY WEAKNESS",
  structural_objective: "STRUCTURAL OBJECTIVE",
  daily_execution: "DAILY EXECUTION",
  technical_drilling: "TECHNICAL DRILLING",
  recovery_protocol: "RECOVERY PROTOCOL",
};

const SECTION_ORDER = [
  "primary_weakness",
  "structural_objective",
  "daily_execution",
  "technical_drilling",
  "recovery_protocol",
];

function PlanItemRow({
  item,
  onToggle,
  disabled,
}: {
  item: PlanItem;
  onToggle: (key: string, done: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [pi.row, item.completed && pi.rowCompleted, pressed && pi.rowPressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle(item.key, !item.completed);
      }}
      disabled={disabled}
    >
      <View style={[pi.check, item.completed && pi.checkDone]}>
        {item.completed && <Feather name="check" size={10} color="#050505" />}
      </View>
      <Text style={[pi.text, item.completed && pi.textDone]}>{item.content}</Text>
    </Pressable>
  );
}

// Inlined inside CampView's ScrollView (not its own scroll) so the toggle can
// live below the dashboard, matching the web's single-scroll layout.
function MissionContent() {
  const { isSignedIn } = useAuth();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentStatus, setConsentStatus] = useState<AiConsentStatus | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const pendingGenerationRef = useRef(false);
  const generationInFlightRef = useRef(false);
  const consentAcceptingRef = useRef(false);

  const {
    data: plan,
    isLoading,
    refetch,
  } = useQuery<WeeklyPlan | null>({
    queryKey: ["plan"],
    queryFn: async () => {
      try {
        return await apiGet<WeeklyPlan>("/planner/current");
      } catch {
        return null;
      }
    },
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, done }: { key: string; done: boolean }) =>
      apiPatch(`/planner/items/${key}`, { completed: done }),
    onMutate: async ({ key, done }) => {
      await qc.cancelQueries({ queryKey: ["plan"] });
      qc.setQueryData<WeeklyPlan | null>(["plan"], (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((i) => (i.key === key ? { ...i, completed: done } : i)),
        };
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });

  async function runGeneration() {
    try {
      await apiPost("/planner/regenerate");
      qc.invalidateQueries({ queryKey: ["plan"] });
    } catch {
      // Keep the planner usable if generation fails.
    } finally {
      setGenerating(false);
      generationInFlightRef.current = false;
    }
  }

  async function handleGenerate() {
    if (generationInFlightRef.current || generating || isLoading) return;
    generationInFlightRef.current = true;
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const status = await apiGet<AiConsentStatus>("/ai-consent");
      setConsentStatus(status);
      if (!status.accepted) {
        pendingGenerationRef.current = true;
        setConsentVisible(true);
        setGenerating(false);
        return;
      }
      await runGeneration();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === "AI_CONSENT_REQUIRED") {
        qc.setQueryData(["ai-consent"], { accepted: false });
      }
      setGenerating(false);
      generationInFlightRef.current = false;
    }
  }

  async function acceptConsentAndGenerate() {
    if (consentAcceptingRef.current) return;
    if (!pendingGenerationRef.current) {
      setConsentVisible(false);
      generationInFlightRef.current = false;
      return;
    }
    consentAcceptingRef.current = true;
    setConsentBusy(true);
    try {
      const status = await apiPatch<AiConsentStatus>("/ai-consent", { accepted: true });
      qc.setQueryData(["ai-consent"], status);
      setConsentStatus(status);
      pendingGenerationRef.current = false;
      setConsentVisible(false);
      setGenerating(true);
      await runGeneration();
    } catch {
      // Keep the intent and modal available so the user can try again.
      generationInFlightRef.current = false;
    } finally {
      setConsentBusy(false);
      consentAcceptingRef.current = false;
    }
  }

  const sections = SECTION_ORDER.reduce<Record<string, PlanItem[]>>((acc, sec) => {
    if (!plan) return acc;
    const items = plan.items.filter((i) => i.section === sec);
    if (items.length > 0) acc[sec] = items;
    return acc;
  }, {});

  const completedCount = plan?.items.filter((i) => i.completed).length ?? 0;
  const totalCount = plan?.items.length ?? 0;

  return (
    <>
      <AiConsentModal
        visible={consentVisible}
        status={consentStatus}
        busy={consentBusy}
        onAccept={() => void acceptConsentAndGenerate()}
        onDecline={() => {
          pendingGenerationRef.current = false;
          generationInFlightRef.current = false;
          setGenerating(false);
          setConsentVisible(false);
          qc.setQueryData(["ai-consent"], { accepted: false });
        }}
        onPrivacy={() => void Linking.openURL(apiUrl("/privacy"))}
      />
      <View style={mission.wrap}>
      <View style={mission.header}>
        <Text style={mission.headerTitle}>WEEKLY MISSION</Text>
        <Pressable
          style={({ pressed }) => [mission.genBtn, pressed && { opacity: 0.8 }]}
          onPress={handleGenerate}
          disabled={generating || isLoading}
        >
          {generating ? (
            <ActivityIndicator size="small" color={palette.goldLight} />
          ) : (
            <Feather name="refresh-cw" size={16} color={palette.goldLight} />
          )}
        </Pressable>
      </View>

      {isLoading && !plan && (
        <View style={mission.loadingBlock}>
          <ActivityIndicator color={palette.goldLight} />
        </View>
      )}

      {!isLoading && !plan && (
        <View style={mission.emptyBlock}>
          <Text style={mission.emptyTitle}>NO MISSION SET</Text>
          <Text style={mission.emptyText}>
            Generate your weekly mission to get a structured plan built from your athlete model.
          </Text>
          <Pressable
            style={({ pressed }) => [mission.generateBtn, pressed && { opacity: 0.8 }]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#050505" />
            ) : (
              <Text style={mission.generateBtnText}>GENERATE MISSION</Text>
            )}
          </Pressable>
        </View>
      )}

      {plan && (
        <>
          {plan.focusSummary && (
            <View style={mission.focusCard}>
              <Text style={mission.focusLabel}>MISSION FOCUS</Text>
              <Text style={mission.focusText}>{plan.focusSummary}</Text>
            </View>
          )}

          <View style={mission.progressRow}>
            <View style={mission.progressBar}>
              <View
                style={[
                  mission.progressFill,
                  { width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` },
                ]}
              />
            </View>
            <Text style={mission.progressLabel}>
              {completedCount}/{totalCount}
            </Text>
          </View>

          {Object.entries(sections).map(([sec, items]) => (
            <View key={sec} style={mission.section}>
              <Text style={mission.sectionLabel}>{SECTION_LABELS[sec] ?? sec.toUpperCase()}</Text>
              <View style={mission.sectionItems}>
                {items.map((item) => (
                  <PlanItemRow
                    key={item.key}
                    item={item}
                    onToggle={(key, done) => toggleMutation.mutate({ key, done })}
                    disabled={toggleMutation.isPending}
                  />
                ))}
              </View>
            </View>
          ))}
        </>
      )}
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const shell = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 26,
    height: 26,
    opacity: 0.9,
  },
  title: {
    fontFamily: fonts.displayItalic,
    fontSize: 28,
    lineHeight: 30,
    color: palette.textHi,
  },
  subtitle: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.8,
    color: palette.textLow,
    marginTop: 2,
  },
  headerRight: {
    marginLeft: "auto",
  },
  plusPill: {
    minHeight: 36,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.goldHair,
    backgroundColor: palette.goldWash,
    paddingHorizontal: 14,
  },
  plusPillText: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.goldPale,
  },
});

const glassPanel = {
  borderWidth: 1,
  borderColor: palette.glassEdge,
  backgroundColor: palette.graphite1,
  borderRadius: radius.lg,
  overflow: "hidden",
} as const;

const camp = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  inner: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  emptyCard: {
    ...glassPanel,
    borderRadius: radius.xl,
    borderColor: palette.goldHair,
    padding: 24,
  },
  emptyTitle: {
    fontFamily: fonts.displayItalic,
    fontSize: 26,
    lineHeight: 30,
    color: palette.textHi,
    marginBottom: 10,
  },
  emptyBody: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: palette.textMid,
    lineHeight: 22,
    marginBottom: 20,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.goldHair,
    backgroundColor: palette.goldWash,
  },
  ctaPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  ctaText: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    letterSpacing: 1.4,
    color: palette.goldPale,
  },
  dashCard: {
    ...glassPanel,
    borderRadius: radius.xl,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "center",
  },
  dashCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  phaseLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  editInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  editInlineText: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.textMid,
  },
  dial: {
    marginTop: 4,
    alignItems: "center",
  },
  countdown: {
    fontFamily: fonts.numeralXL,
    fontSize: 72,
    lineHeight: 78,
    letterSpacing: -2,
    marginTop: 14,
  },
  countdownUnit: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    color: palette.textMid,
    textAlign: "center",
    marginTop: 8,
  },
  countdownTier: {
    fontFamily: fonts.displayItalic,
    fontSize: 20,
    color: palette.textHi,
    textAlign: "center",
    marginTop: 6,
  },
  weighInLine: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.textLow,
    textAlign: "center",
    marginTop: 12,
  },
  dashEventFallback: {
    fontFamily: fonts.displayItalic,
    fontSize: 24,
    color: palette.textHi,
    marginTop: 14,
  },
  rowList: {
    marginTop: 20,
    gap: 12,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    paddingBottom: 12,
  },
  rowLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: palette.textLow,
  },
  rowValue: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: palette.text,
    textAlign: "right",
    flexShrink: 1,
    maxWidth: "62%",
  },
  endCampBtn: {
    marginTop: 24,
    width: "100%",
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    backgroundColor: palette.glass,
    alignItems: "center",
    justifyContent: "center",
  },
  endCampBtnPressed: {
    borderColor: "rgba(224,86,78,0.5)",
    backgroundColor: palette.redWash,
  },
  endCampText: {
    fontFamily: fonts.textMedium,
    fontSize: 12.5,
    letterSpacing: 1.6,
    color: palette.textMid,
  },
  viewTabRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
  },
  viewTab: {
    flex: 1,
    minHeight: 46,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.glass,
    alignItems: "center",
  },
  viewTabActive: {
    borderColor: palette.goldHair,
    backgroundColor: palette.goldWash,
  },
  viewTabText: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 1.6,
    color: palette.textMid,
  },
  viewTabTextActive: {
    color: palette.goldPale,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    color: palette.goldLight,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  addBtnText: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.goldLight,
  },
  noSessions: {
    fontFamily: fonts.text,
    fontSize: 13.5,
    color: palette.textMid,
    lineHeight: 21,
  },
  dayGroup: {
    marginBottom: 18,
  },
  dayLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: palette.textLow,
    marginBottom: 8,
  },
  sRow: {
    ...glassPanel,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 14,
    marginBottom: 10,
  },
  sRowDone: {
    opacity: 0.6,
  },
  sCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.glassEdgeHi,
    backgroundColor: palette.glass,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  sCheckDone: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.goldLight,
  },
  sCheckLocked: {
    borderColor: palette.hairline,
    backgroundColor: palette.graphite2,
  },
  sTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sType: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    color: palette.textHi,
  },
  importedTag: {
    fontFamily: fonts.textMedium,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: palette.textMid,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  sDetail: {
    fontFamily: fonts.text,
    fontSize: 12.5,
    color: palette.textLow,
    marginTop: 4,
  },
  sObjective: {
    fontFamily: fonts.text,
    fontSize: 13.5,
    color: palette.textMid,
    marginTop: 4,
    lineHeight: 19,
  },
  sActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    marginTop: -10,
    marginRight: -10,
  },
  iconTap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  form: {
    ...glassPanel,
    borderRadius: radius.xl,
    marginTop: 8,
    marginBottom: 8,
    padding: 22,
  },
  formTitle: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    color: palette.goldLight,
    marginBottom: 18,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.goldLight,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    borderRadius: radius.md,
    color: palette.textHi,
    fontFamily: fonts.text,
    fontSize: 15,
    paddingHorizontal: 18,
    paddingVertical: 12,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: "top",
    paddingTop: 14,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.glass,
    paddingHorizontal: 16,
  },
  chipActive: {
    borderColor: palette.goldHair,
    backgroundColor: palette.goldWash,
  },
  chipText: {
    fontFamily: fonts.textMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    color: palette.textMid,
  },
  chipTextActive: {
    color: palette.goldPale,
  },
  row2: {
    flexDirection: "row",
    gap: 12,
  },
  col: {
    flex: 1,
  },
  error: {
    fontFamily: fonts.text,
    fontSize: 13,
    color: palette.redLight,
    marginBottom: 12,
  },
  formActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    backgroundColor: palette.glassStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    letterSpacing: 1.2,
    color: palette.text,
  },
  submitBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: "#B38F4B",
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    letterSpacing: 1.2,
    color: "#0a0806",
  },
});

const rev = StyleSheet.create({
  section: {
    ...glassPanel,
    borderRadius: radius.xl,
    marginTop: 18,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  headLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    color: palette.goldLight,
  },
  headCount: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.textLow,
  },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.goldHair,
    backgroundColor: palette.goldWash,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  lockPillText: {
    fontFamily: fonts.textMedium,
    fontSize: 10,
    letterSpacing: 1.4,
    color: palette.goldPale,
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  emptyText: {
    fontFamily: fonts.text,
    fontSize: 13.5,
    color: palette.textMid,
    lineHeight: 21,
  },
  mixRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 22,
    rowGap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  mixItem: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  mixCount: {
    fontFamily: fonts.numeral,
    fontSize: 24,
    color: palette.textHi,
  },
  mixLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: palette.textLow,
  },
  block: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  blockLast: {
    borderBottomWidth: 0,
  },
  blockLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.8,
    color: palette.goldLight,
  },
  blockEmpty: {
    fontFamily: fonts.text,
    fontSize: 13,
    color: palette.textMid,
    lineHeight: 19,
    marginTop: 8,
  },
  impTop: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  impName: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    letterSpacing: 1.2,
    color: palette.textHi,
  },
  impDelta: {
    fontFamily: fonts.numeral,
    fontSize: 20,
    color: palette.goldPale,
  },
  impValues: {
    fontFamily: fonts.text,
    fontSize: 12.5,
    color: palette.textMid,
    marginTop: 4,
  },
  impDates: {
    fontFamily: fonts.text,
    fontSize: 12,
    color: palette.textLow,
    marginTop: 4,
  },
  leakLabel: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: palette.text,
    lineHeight: 21,
  },
  leakMeta: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: palette.textLow,
    marginTop: 6,
  },
});

const pi = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  rowCompleted: {
    opacity: 0.55,
  },
  rowPressed: {
    backgroundColor: palette.glassStrong,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: palette.glassEdgeHi,
    backgroundColor: palette.glass,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkDone: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.goldLight,
  },
  text: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: 14.5,
    color: palette.text,
    lineHeight: 21,
  },
  textDone: {
    textDecorationLine: "line-through",
    color: palette.textLow,
  },
});

const mission = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: fonts.displayItalic,
    fontSize: 26,
    lineHeight: 30,
    color: palette.textHi,
  },
  genBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.glassStrong,
    borderWidth: 1,
    borderColor: palette.glassEdge,
  },
  loadingBlock: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyBlock: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 16,
  },
  emptyTitle: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    letterSpacing: 2,
    color: palette.textLow,
  },
  emptyText: {
    fontFamily: fonts.text,
    fontSize: 14,
    color: palette.textMid,
    textAlign: "center",
    lineHeight: 22,
  },
  generateBtn: {
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: "#B38F4B",
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  generateBtnText: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    letterSpacing: 1.4,
    color: "#0a0806",
  },
  focusCard: {
    ...glassPanel,
    borderRadius: radius.lg,
    borderColor: palette.goldHair,
    backgroundColor: palette.graphite2,
    padding: 20,
    marginBottom: 18,
  },
  focusLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.8,
    color: palette.goldLight,
    marginBottom: 8,
  },
  focusText: {
    fontFamily: fonts.text,
    fontSize: 14.5,
    color: palette.text,
    lineHeight: 23,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 22,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.glassStrong,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.goldLight,
  },
  progressLabel: {
    fontFamily: fonts.numeral,
    fontSize: 16,
    color: palette.textMid,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 1.8,
    color: palette.goldLight,
    marginBottom: 10,
  },
  sectionItems: {
    ...glassPanel,
    borderRadius: radius.lg,
  },
});
