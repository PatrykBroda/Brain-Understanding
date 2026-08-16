import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { apiGet, apiPatch, apiPost } from "@/lib/api";
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

const TIER_ACCENT: Record<PressureTier, string> = {
  base: "#8A6A2F",
  build: "#8A6A2F",
  sharpen: "#d2553f",
  peak: "#e0604a",
  fight_week: "#ff6a4d",
};

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
    <View style={[shell.root, { paddingTop: topPad }]}>
      <View style={shell.header}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            router.push("/(tabs)/home");
          }}
          hitSlop={12}
          accessibilityLabel="Back to home"
        >
          <Feather name="chevron-left" size={22} color="#777" />
        </Pressable>

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
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#8A6A2F" />
      }
    >
      {isLoading ? (
        <ActivityIndicator color="#8A6A2F" style={{ marginTop: 40 }} />
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
                <Feather name="plus" size={16} color="#8A6A2F" />
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
                        <Feather name="plus" size={14} color="#8A6A2F" />
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
            No footage analysed in this camp yet. Upload a round on Analyse and this camp starts
            reading your trend, session over session.
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
          <Feather name="lock" size={10} color="#8A6A2F" />
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
  const accent = TIER_ACCENT[tier] ?? "#8A6A2F";

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
        <View style={camp.dashCardTop}>
          <Text style={[camp.phaseLabel, { color: accent }]}>
            {phase ? phase.toUpperCase() : "CAMP"}
          </Text>
          <Pressable style={camp.editInline} onPress={onEdit} hitSlop={6}>
            <Feather name="edit-2" size={11} color="#888" />
            <Text style={camp.editInlineText}>EDIT</Text>
          </Pressable>
        </View>

        {days != null ? (
          <>
            <Text style={[camp.countdown, { color: accent }]}>{days <= 0 ? 0 : days}</Text>
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
        hitSlop={8}
      >
        {session.completed && <Feather name="check" size={11} color="#050505" />}
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
          <Pressable onPress={onEdit} disabled={disabled} hitSlop={8}>
            <Feather name="edit-2" size={14} color="#777" />
          </Pressable>
          <Pressable onPress={onDelete} disabled={disabled} hitSlop={8}>
            <Feather name="trash-2" size={14} color="#6a3a35" />
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
          placeholderTextColor="#444"
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
              placeholderTextColor="#444"
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
              placeholderTextColor="#444"
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
          placeholderTextColor="#444"
        />
      </Field>

      <Field label="OBJECTIVE (OPTIONAL)">
        <TextInput
          style={[camp.input, camp.inputMultiline]}
          value={props.sObjective}
          onChangeText={props.setSObjective}
          placeholder="What this session is for"
          placeholderTextColor="#444"
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
          placeholderTextColor="#444"
        />
      </Field>

      <Field label="DISCIPLINE">
        <TextInput
          style={camp.input}
          value={props.discipline}
          onChangeText={props.setDiscipline}
          placeholder="BJJ / MMA / Muay Thai"
          placeholderTextColor="#444"
        />
      </Field>

      <Field label="EVENT DATE (YYYY-MM-DD)">
        <TextInput
          style={camp.input}
          value={props.eventDate}
          onChangeText={props.setEventDate}
          placeholder="2026-07-01"
          placeholderTextColor="#444"
          autoCapitalize="none"
        />
      </Field>

      <Field label="WEIGH-IN DATE (OPTIONAL)">
        <TextInput
          style={camp.input}
          value={props.weighInDate}
          onChangeText={props.setWeighInDate}
          placeholder="2026-06-30"
          placeholderTextColor="#444"
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
              placeholderTextColor="#444"
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
              placeholderTextColor="#444"
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
              placeholderTextColor="#444"
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
              placeholderTextColor="#444"
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
          placeholderTextColor="#444"
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
              placeholderTextColor="#444"
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
              placeholderTextColor="#444"
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
          placeholderTextColor="#444"
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

  async function handleGenerate() {
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiPost("/planner");
      qc.invalidateQueries({ queryKey: ["plan"] });
    } catch {
      // noop
    } finally {
      setGenerating(false);
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
    <View style={mission.wrap}>
      <View style={mission.header}>
        <Text style={mission.headerTitle}>WEEKLY MISSION</Text>
        <Pressable
          style={({ pressed }) => [mission.genBtn, pressed && { opacity: 0.8 }]}
          onPress={handleGenerate}
          disabled={generating || isLoading}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#8A6A2F" />
          ) : (
            <Feather name="refresh-cw" size={16} color="#8A6A2F" />
          )}
        </Pressable>
      </View>

      {isLoading && !plan && (
        <View style={mission.loadingBlock}>
          <ActivityIndicator color="#8A6A2F" />
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
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const shell = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 22,
    height: 22,
    opacity: 0.8,
  },
  title: {
    fontFamily: "Outfit",
    fontWeight: "200",
    fontSize: 13,
    letterSpacing: 5,
    color: "rgba(224,224,224,0.95)",
  },
  subtitle: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 4,
    color: "rgba(224,224,224,0.5)",
    marginTop: 5,
  },
  headerRight: {
    marginLeft: "auto",
  },
  plusPill: {
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  plusPillText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
});

const camp = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  inner: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
    marginBottom: 18,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.4)",
    paddingVertical: 14,
  },
  ctaPressed: {
    borderColor: "#8A6A2F",
    backgroundColor: "rgba(138,106,47,0.06)",
  },
  ctaText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
  dashCard: {
    borderWidth: 1,
    backgroundColor: "#0a0a0a",
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
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3.5,
  },
  editInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editInlineText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#888",
  },
  countdown: {
    fontFamily: "Outfit",
    fontWeight: "200",
    fontSize: 72,
    lineHeight: 78,
    marginTop: 14,
  },
  countdownUnit: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "rgba(224,224,224,0.55)",
    textAlign: "center",
    marginTop: 8,
  },
  countdownTier: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "rgba(224,224,224,0.4)",
    textAlign: "center",
    marginTop: 8,
  },
  weighInLine: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2.5,
    color: "rgba(224,224,224,0.45)",
    textAlign: "center",
    marginTop: 12,
  },
  dashEventFallback: {
    fontFamily: "Outfit",
    fontSize: 15,
    letterSpacing: 1,
    color: "rgba(224,224,224,0.8)",
    marginTop: 14,
  },
  rowList: {
    marginTop: 20,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    paddingBottom: 10,
  },
  rowLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "rgba(224,224,224,0.45)",
  },
  rowValue: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "rgba(224,224,224,0.85)",
    textAlign: "right",
    flexShrink: 1,
    maxWidth: "62%",
  },
  endCampBtn: {
    marginTop: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: 14,
    alignItems: "center",
  },
  endCampBtnPressed: {
    borderColor: "rgba(210,85,63,0.5)",
  },
  endCampText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3.5,
    color: "rgba(224,224,224,0.6)",
  },
  viewTabRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
  },
  viewTab: {
    flex: 1,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  viewTabActive: {
    borderColor: "rgba(138,106,47,0.5)",
    backgroundColor: "rgba(138,106,47,0.06)",
  },
  viewTabText: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 2.5,
    color: "rgba(255,255,255,0.5)",
  },
  viewTabTextActive: {
    color: "#8A6A2F",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#8A6A2F",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
  noSessions: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
  },
  dayGroup: {
    marginBottom: 18,
  },
  dayLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#555",
    marginBottom: 8,
  },
  sRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    padding: 12,
    marginBottom: 8,
  },
  sRowDone: {
    opacity: 0.55,
  },
  sCheck: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  sCheckDone: {
    backgroundColor: "#8A6A2F",
    borderColor: "#8A6A2F",
  },
  sCheckLocked: {
    borderColor: "#222",
    backgroundColor: "#111",
  },
  sTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sType: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 1.5,
    color: "#d0d0d0",
  },
  importedTag: {
    fontFamily: "SpaceMono",
    fontSize: 7,
    letterSpacing: 1.5,
    color: "#666",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  sDetail: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "#666",
    marginTop: 4,
  },
  sObjective: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#999",
    marginTop: 4,
    lineHeight: 18,
  },
  sActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 1,
  },
  form: {
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    padding: 18,
  },
  formTitle: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3,
    color: "#8A6A2F",
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipActive: {
    borderColor: "#8A6A2F",
    backgroundColor: "rgba(138,106,47,0.10)",
  },
  chipText: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 1.5,
    color: "#666",
  },
  chipTextActive: {
    color: "#8A6A2F",
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
    backgroundColor: "#8A6A2F",
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
});

const rev = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
    marginTop: 16,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  headLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 4,
    color: "#b0b0b0",
  },
  headCount: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3,
    color: "#555",
  },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.4)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockPillText: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#8A6A2F",
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#777",
    lineHeight: 20,
  },
  mixRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 18,
    rowGap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  mixItem: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  mixCount: {
    fontFamily: "Outfit",
    fontSize: 16,
    color: "#e0e0e0",
  },
  mixLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2,
    color: "#666",
  },
  block: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  blockLast: {
    borderBottomWidth: 0,
  },
  blockLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#666",
  },
  blockEmpty: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
    marginTop: 8,
  },
  impTop: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  impName: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 2,
    color: "#d0d0d0",
  },
  impDelta: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#4fbf7b",
  },
  impValues: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 1,
    color: "#888",
    marginTop: 4,
  },
  impDates: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#555",
    marginTop: 4,
  },
  leakLabel: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#d0d0d0",
    lineHeight: 20,
  },
  leakMeta: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#777",
    marginTop: 6,
  },
});

const pi = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  rowCompleted: {
    opacity: 0.5,
  },
  rowPressed: {
    backgroundColor: "#0a0a0a",
  },
  check: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkDone: {
    backgroundColor: "#8A6A2F",
    borderColor: "#8A6A2F",
  },
  text: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 20,
  },
  textDone: {
    textDecorationLine: "line-through",
    color: "#444",
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
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 5,
    color: "#e0e0e0",
  },
  genBtn: {
    padding: 8,
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
    fontFamily: "SpaceMono",
    fontSize: 12,
    letterSpacing: 4,
    color: "#333",
  },
  emptyText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
  },
  generateBtn: {
    backgroundColor: "#8A6A2F",
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
  },
  generateBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 11,
    letterSpacing: 3,
    color: "#050505",
  },
  focusCard: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    borderLeftColor: "#8A6A2F",
    borderLeftWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  focusLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#8A6A2F",
    marginBottom: 6,
  },
  focusText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#c0c0c0",
    lineHeight: 22,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  progressBar: {
    flex: 1,
    height: 2,
    backgroundColor: "#1a1a1a",
  },
  progressFill: {
    height: 2,
    backgroundColor: "#8A6A2F",
  },
  progressLabel: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    color: "#444",
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 3,
    color: "#8A6A2F",
    marginBottom: 8,
  },
  sectionItems: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
});
