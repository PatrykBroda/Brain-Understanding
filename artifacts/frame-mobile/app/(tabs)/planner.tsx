import { useAuth } from "@/context/AuthContext";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
import { WeeklyMission } from "@/components/WeeklyMission";
import { FormScroll } from "@/components/FormScroll";
import { useIsFramePlus } from "@/hooks/useEntitlement";
import {
  Button,
  Display,
  EmptyState,
  Field,
  GlassCard,
  IconButton,
  Label,
  Numeral,
  PillTabs,
  Screen,
  Status,
  haptic,
} from "@/components/ui";
import { fonts, MIN_TAP, palette, radius, SCREEN_PAD, type as T } from "@/constants/theme";

/** Pressure window the countdown bar sweeps over: the last 12 weeks before the event. */
const DIAL_WINDOW_DAYS = 84;

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  sparring: "Sparring",
  wrestling: "Wrestling",
  bjj: "BJJ",
  striking: "Striking",
  conditioning: "Conditioning",
  recovery: "Recovery",
  mobility: "Mobility",
};

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Local YYYY-MM-DD -> readable label without timezone drift ("Today" / "Tomorrow" when it applies).
function fmtDayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((d.getTime() - t0) / 86400000);
  if (diff === 0) return `Today, ${base}`;
  if (diff === 1) return `Tomorrow, ${base}`;
  return base;
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
    <Screen light="silver" focus="topRight">
      <View style={[shell.root, { paddingTop: topPad }]}>
        <View style={shell.header}>
          <IconButton
            icon="chevron-left"
            label="Back to home"
            onPress={() => router.push("/(tabs)/home")}
          />
          <Display size="title" style={shell.title}>
            Camp
          </Display>
          <FramePlusPill />
        </View>

        <CampView />
      </View>
    </Screen>
  );
}

// Top-right entitlement chip, mirroring the web header's FramePlusPill.
function FramePlusPill() {
  const isPlus = useIsFramePlus();
  if (isPlus) return <Status label="FRAME+" tone="gold" />;
  return (
    <Pressable
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Upgrade to FRAME+"
      onPress={() => {
        haptic.select();
        router.push("/paywall");
      }}
    >
      <Status label="FRAME+" tone="gold" />
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

  const { data, isLoading, isError, refetch, isRefetching } = useActiveCompetition();
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
      haptic.success();
      qc.invalidateQueries({ queryKey: ["competition"] });
      resetCampForm();
    },
    onError: (e: unknown) => {
      haptic.error();
      setCampError(e instanceof Error ? e.message : "Could not create camp");
    },
  });

  const updateCampMut = useMutation({
    mutationFn: (id: number) => competitionApi.update(id, buildCampInput()),
    onSuccess: () => {
      haptic.success();
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
      haptic.press();
      qc.invalidateQueries({ queryKey: ["competition"] });
      resetCampForm();
    },
  });

  const campSaving = createCampMut.isPending || updateCampMut.isPending;

  function beginEditCamp(c: Competition) {
    haptic.select();
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
    haptic.select();
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
            haptic.success();
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
            haptic.success();
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
    haptic.select();
    updateSessionMut.mutate({ id: s.id, input: { completed: !s.completed } });
  }

  function removeSession(s: TrainingSession) {
    if (s.source === "google_calendar") return;
    haptic.press();
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

  // The one thing to do next: first unfinished session from today on.
  const today = todayYmd();
  const nextSession =
    sessions.find((x) => !x.completed && x.sessionDate.slice(0, 10) >= today) ?? null;

  return (
    <FormScroll
      style={camp.scroll}
      contentContainerStyle={[camp.inner, { paddingBottom: insets.bottom + bottomPad + 120 }]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.textMid} />}
    >
      {isLoading ? (
        <EmptyState kind="loading" title="Loading your camp" />
      ) : isError && !data ? (
        <EmptyState
          kind="error"
          title="Couldn't load your camp"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      ) : !competition ? (
        <>
          {!showCampForm && (
            <EmptyState
              kind="empty"
              icon="calendar"
              title="No camp yet"
              body="Set your fight or comp and FRAME builds the camp around it: countdown, phase, weight cut, and the sessions that carry you to the mat."
              actionLabel="Create your camp"
              onAction={() => setShowCampForm(true)}
            />
          )}
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
            nextSession={nextSession}
            onEdit={() => beginEditCamp(competition)}
            onCancel={() => cancelCampMut.mutate(competition.id)}
            cancelling={cancelCampMut.isPending}
          />

          {/* Camp review: cross-analysis intelligence over this camp's footage.
              Server returns review:null for free tier, so null == FRAME+-gated. */}
          {!showCampForm && (review ? <CampReviewSection review={review} /> : <CampReviewLocked />)}

          {/* Schedule / Weekly-mission switch. Hidden while the camp edit form is open. */}
          {!showCampForm && (
            <>
              <View style={camp.tabsRow}>
                <PillTabs
                  tabs={[
                    { key: "schedule", label: "Schedule" },
                    { key: "mission", label: "Weekly mission" },
                  ]}
                  value={view}
                  onChange={setView}
                />
              </View>

              {view === "schedule" ? (
                <>
                  <View style={camp.sectionHead}>
                    <Display size="heading">Session schedule</Display>
                    {!showSessionForm && (
                      <Pressable
                        onPress={() => {
                          haptic.select();
                          setShowSessionForm(true);
                        }}
                        hitSlop={6}
                        style={({ pressed }) => [camp.addBtn, pressed && { backgroundColor: palette.raised }]}
                        accessibilityRole="button"
                        accessibilityLabel="Add session"
                      >
                        <Feather name="plus" size={16} color={palette.goldPale} />
                        <Text style={camp.addBtnText}>Add</Text>
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
                    <EmptyState
                      kind="empty"
                      icon="list"
                      title="No sessions yet"
                      body="Add the sessions that make up this camp."
                      actionLabel="Add session"
                      onAction={() => setShowSessionForm(true)}
                    />
                  ) : (
                    groups.map((g) => (
                      <View key={g.date} style={camp.dayGroup}>
                        <Label style={camp.dayLabel}>{fmtDayLabel(g.date)}</Label>
                        <GlassCard padding={0}>
                          {g.items.map((s, i) => (
                            <SessionRow
                              key={s.id}
                              session={s}
                              first={i === 0}
                              onToggle={() => toggleSession(s)}
                              onEdit={() => beginEditSession(s)}
                              onDelete={() => removeSession(s)}
                              disabled={updateSessionMut.isPending || deleteSessionMut.isPending}
                            />
                          ))}
                        </GlassCard>
                      </View>
                    ))
                  )}
                </>
              ) : (
                <WeeklyMission />
              )}
            </>
          )}

          {/* Camp edit form (opened via dashboard edit) */}
          {campFormNode}
        </>
      )}
    </FormScroll>
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
    <View style={camp.block}>
      <View style={camp.sectionHead}>
        <Display size="heading">Camp review</Display>
        <Status label={totalAnalyses === 1 ? "1 analysis" : `${totalAnalyses} analyses`} />
      </View>
      <GlassCard padding={0}>
        {totalAnalyses === 0 ? (
          <Text style={rev.emptyText}>
            No session analysis is attached to this camp yet. Camp review trends will appear when
            supported analysis records are available.
          </Text>
        ) : (
          <>
            {/* Session mix: a real count per kind */}
            <View style={rev.mixRow}>
              {countsByKind.map((c) => (
                <View key={c.kind} style={rev.mixItem}>
                  <Text style={rev.mixCount}>{c.count}</Text>
                  <Text style={rev.mixLabel}>{c.label}</Text>
                </View>
              ))}
            </View>

            {/* Biggest real improvement: two recorded endpoints + dates */}
            <View style={[rev.block, rev.rule]}>
              <Text style={rev.blockLabel}>Biggest improvement</Text>
              {biggestImprovement ? (
                <View style={{ marginTop: 6 }}>
                  <View style={rev.impTop}>
                    <Text style={rev.impName}>{biggestImprovement.label}</Text>
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
                    ? "One session in. Log a second analysis and the trend appears here."
                    : "No attribute rose between your first and latest session this camp. Held or dipped, no gain to claim yet."}
                </Text>
              )}
            </View>

            {/* Most persistent real leak: a real recurrence count */}
            <View style={[rev.block, rev.rule]}>
              <Text style={rev.blockLabel}>Most persistent leak</Text>
              {mostPersistentLeak ? (
                <View style={{ marginTop: 6 }}>
                  <Text style={rev.leakLabel}>{mostPersistentLeak.label}</Text>
                  <Text style={rev.leakMeta}>
                    Flagged in {mostPersistentLeak.sessions} of {mostPersistentLeak.total} sessions
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
      </GlassCard>
    </View>
  );
}

// Free tier: the review reads across every analysis in the camp, which is a
// FRAME+ capability. Honest teaser: no fabricated preview numbers.
function CampReviewLocked() {
  return (
    <View style={camp.block}>
      <View style={camp.sectionHead}>
        <Display size="heading">Camp review</Display>
        <Status label="FRAME+" tone="gold" />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Camp review is part of FRAME+. Upgrade"
        onPress={() => {
          haptic.select();
          router.push("/paywall");
        }}
      >
        <GlassCard padding={0}>
          <View style={rev.lockRow}>
            <Feather name="lock" size={16} color={palette.textLow} style={{ marginTop: 2 }} />
            <Text style={rev.lockText}>
              Camp review reads across every analysis in this camp to surface your biggest real gain and
              the leak that keeps recurring, grounded in your recorded sessions, never invented.
            </Text>
          </View>
        </GlassCard>
      </Pressable>
    </View>
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
  nextSession,
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
  nextSession: TrainingSession | null;
  onEdit: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  // Closing phases carry a red chip WITH the written phase label.
  const closing = tier === "sharpen" || tier === "peak" || tier === "fight_week";

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

  const progress = days != null ? Math.max(0, Math.min(1, (DIAL_WINDOW_DAYS - Math.max(0, days)) / DIAL_WINDOW_DAYS)) : 0;

  return (
    <View>
      {/* The focal point: days until the event */}
      <GlassCard raised padding={20}>
        <View style={camp.heroTop}>
          <Status label={tierLabel || phase || "Camp"} tone={closing ? "red" : "gold"} />
          <Pressable
            style={({ pressed }) => [camp.editInline, pressed && { opacity: 0.7 }]}
            onPress={onEdit}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Edit camp"
          >
            <Feather name="edit-2" size={14} color={palette.textMid} />
            <Text style={camp.editInlineText}>Edit</Text>
          </Pressable>
        </View>

        <Display size="heading" style={camp.eventName} numberOfLines={2}>
          {competition.eventName}
        </Display>

        {days != null ? (
          <>
            <View style={camp.countRow} accessible accessibilityLabel={`${days <= 0 ? 0 : days} ${days === 1 ? "day" : "days"} to go`}>
              <Numeral size="hero">{days <= 0 ? 0 : days}</Numeral>
              <Text style={camp.countUnit}>{days === 1 ? "day to go" : "days to go"}</Text>
            </View>
            <View style={camp.progressTrack}>
              <View style={[camp.progressFill, { width: `${progress * 100}%` }, closing && { backgroundColor: palette.redText }]} />
            </View>
            {daysToWeighIn != null ? (
              <Text style={camp.weighInLine}>
                Weigh-in {daysToWeighIn <= 0 ? "now" : `in ${daysToWeighIn} ${daysToWeighIn === 1 ? "day" : "days"}`}
              </Text>
            ) : null}
          </>
        ) : null}

        {nextSession ? (
          <View style={camp.nextRow}>
            <Text style={camp.nextLabel}>Next session</Text>
            <Text style={camp.nextValue}>
              {SESSION_TYPE_LABELS[nextSession.sessionType]}
              {nextSession.startTime ? ` · ${nextSession.startTime}` : ""}
            </Text>
            <Text style={camp.nextSub}>{fmtDayLabel(nextSession.sessionDate.slice(0, 10))}</Text>
          </View>
        ) : null}
      </GlassCard>

      {/* Detail rows */}
      <View style={camp.block}>
        <GlassCard padding={0}>
          <Row first label="Event date" value={formatDay(competition.eventDate)} />
          {competition.weighInDate ? <Row label="Weigh-in date" value={formatDay(competition.weighInDate)} /> : null}
          {competition.discipline?.trim() ? <Row label="Discipline" value={competition.discipline} /> : null}
          {fightLine ? <Row label="Fight" value={fightLine} /> : null}
          {weightCutValue ? <Row label="Weight cut" value={weightCutValue} /> : null}
          {competition.notes?.trim() ? <Row label="Notes" value={competition.notes} /> : null}
        </GlassCard>
      </View>

      <Button
        title="End camp"
        variant="danger"
        onPress={onCancel}
        loading={cancelling}
        style={camp.endCampBtn}
      />
    </View>
  );
}

function Row({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[camp.row, !first && camp.rule]}>
      <Text style={camp.rowLabel}>{label}</Text>
      <Text style={camp.rowValue}>{value}</Text>
    </View>
  );
}

function SessionRow({
  session,
  first,
  onToggle,
  onEdit,
  onDelete,
  disabled,
}: {
  session: TrainingSession;
  first: boolean;
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
    <View style={[camp.sRow, !first && camp.rule]}>
      <Pressable
        style={camp.sCheckHit}
        onPress={onToggle}
        disabled={disabled || imported}
        accessibilityRole="checkbox"
        accessibilityLabel={`${SESSION_TYPE_LABELS[session.sessionType]} session`}
        accessibilityState={{ checked: !!session.completed, disabled: disabled || imported }}
      >
        <View style={[camp.sCheck, session.completed && camp.sCheckDone, imported && camp.sCheckLocked]}>
          {session.completed && <Feather name="check" size={14} color={palette.onGold} />}
        </View>
      </Pressable>

      <View style={{ flex: 1, paddingVertical: 12, opacity: session.completed ? 0.6 : 1 }}>
        <View style={camp.sTopRow}>
          <Text style={camp.sType}>{SESSION_TYPE_LABELS[session.sessionType]}</Text>
          {imported && <Status label="Imported" />}
        </View>
        {detail ? <Text style={camp.sDetail}>{detail}</Text> : null}
        {session.objective ? <Text style={camp.sObjective}>{session.objective}</Text> : null}
      </View>

      {!imported && (
        <View style={camp.sActions}>
          <Pressable onPress={onEdit} disabled={disabled} style={camp.iconTap} accessibilityRole="button" accessibilityLabel="Edit session">
            <Feather name="edit-2" size={16} color={palette.textMid} />
          </Pressable>
          <Pressable onPress={onDelete} disabled={disabled} style={camp.iconTap} accessibilityRole="button" accessibilityLabel="Delete session">
            <Feather name="trash-2" size={16} color={palette.redText} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function FormActions({
  saving,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <View style={camp.formActions}>
      <Button title="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
      <Button title={submitLabel} onPress={onSubmit} loading={saving} style={{ flex: 1.4 }} />
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
    <View style={camp.block}>
      <GlassCard padding={20}>
        <View style={camp.formCol}>
          <Display size="heading">{props.editing ? "Edit session" : "New session"}</Display>

          <View style={{ gap: 8 }}>
            <Label>Session type</Label>
            <View style={camp.chips}>
              {SESSION_TYPES.map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: props.sType === t }}
                  style={[camp.chip, props.sType === t && camp.chipActive]}
                  onPress={() => {
                    if (props.sType !== t) haptic.select();
                    props.setSType(t);
                  }}
                >
                  <Text style={[camp.chipText, props.sType === t && camp.chipTextActive]}>
                    {SESSION_TYPE_LABELS[t]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Field label="Date (YYYY-MM-DD)" value={props.sDate} onChangeText={props.setSDate} placeholder="2026-07-01" autoCapitalize="none" />

          <View style={camp.row2}>
            <View style={camp.col}>
              <Field label="Time (HH:MM)" value={props.sTime} onChangeText={props.setSTime} placeholder="18:00" autoCapitalize="none" />
            </View>
            <View style={camp.col}>
              <Field label="Duration (min)" value={props.sDuration} onChangeText={props.setSDuration} placeholder="60" keyboardType="number-pad" />
            </View>
          </View>

          <Field label="Coach (optional)" value={props.sCoach} onChangeText={props.setSCoach} placeholder="Name" />

          <Field
            label="Objective (optional)"
            style={camp.inputMultiline}
            value={props.sObjective}
            onChangeText={props.setSObjective}
            placeholder="What this session is for"
            multiline
          />

          {props.error ? <Text style={camp.error}>{props.error}</Text> : null}

          <FormActions
            saving={props.saving}
            onCancel={props.onCancel}
            onSubmit={props.onSubmit}
            submitLabel={props.editing ? "Update" : "Add session"}
          />
        </View>
      </GlassCard>
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
    <View style={camp.block}>
      <GlassCard padding={20}>
        <View style={camp.formCol}>
          <Display size="heading">{props.editing ? "Edit camp" : "New camp"}</Display>

          <Field label="Event name" value={props.eventName} onChangeText={props.setEventName} placeholder="Regional Open" />
          <Field label="Discipline" value={props.discipline} onChangeText={props.setDiscipline} placeholder="BJJ / MMA / Muay Thai" />
          <Field label="Event date (YYYY-MM-DD)" value={props.eventDate} onChangeText={props.setEventDate} placeholder="2026-07-01" autoCapitalize="none" />
          <Field label="Weigh-in date (optional)" value={props.weighInDate} onChangeText={props.setWeighInDate} placeholder="2026-06-30" autoCapitalize="none" />

          <View style={camp.row2}>
            <View style={camp.col}>
              <Field label="Opponent" value={props.opponent} onChangeText={props.setOpponent} placeholder="Name" />
            </View>
            <View style={camp.col}>
              <Field label="Promotion" value={props.promotion} onChangeText={props.setPromotion} placeholder="Org" />
            </View>
          </View>

          <View style={camp.row2}>
            <View style={camp.col}>
              <Field label="Weight class" value={props.weightClass} onChangeText={props.setWeightClass} placeholder="Lightweight" />
            </View>
            <View style={camp.col}>
              <Field label="Rounds" value={props.rounds} onChangeText={props.setRounds} placeholder="3" keyboardType="number-pad" />
            </View>
          </View>

          <Field label="Location (optional)" value={props.location} onChangeText={props.setLocation} placeholder="City / venue" />

          <View style={camp.row2}>
            <View style={camp.col}>
              <Field label="Current weight" value={props.currentWeight} onChangeText={props.setCurrentWeight} placeholder="78kg" />
            </View>
            <View style={camp.col}>
              <Field label="Target weight" value={props.targetWeight} onChangeText={props.setTargetWeight} placeholder="74kg" />
            </View>
          </View>

          <Field
            label="Notes (optional)"
            style={camp.inputMultiline}
            value={props.notes}
            onChangeText={props.setNotes}
            placeholder="Anything FRAME should hold in mind"
            multiline
          />

          {props.error ? <Text style={camp.error}>{props.error}</Text> : null}

          <FormActions
            saving={props.saving}
            onCancel={props.onCancel}
            onSubmit={props.onSubmit}
            submitLabel={props.editing ? "Update camp" : "Create camp"}
          />
        </View>
      </GlassCard>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const shell = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: { flex: 1 },
});

const camp = StyleSheet.create({
  scroll: { flex: 1 },
  inner: { paddingHorizontal: SCREEN_PAD, paddingTop: 12 },
  block: { marginTop: 24 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, minHeight: MIN_TAP },
  tabsRow: { marginTop: 28, marginBottom: 20 },

  // hero
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editInline: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: MIN_TAP, paddingHorizontal: 8, marginRight: -8 },
  editInlineText: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  eventName: { marginTop: 4 },
  countRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 12 },
  countUnit: { fontFamily: fonts.medium, fontSize: 16, color: palette.textMid },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, marginTop: 16, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.gold },
  weighInLine: { fontFamily: fonts.regular, fontSize: 14, color: palette.textMid, marginTop: 12, fontVariant: ["tabular-nums"] },
  nextRow: { marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong, gap: 2 },
  nextLabel: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid },
  nextValue: { fontFamily: fonts.semi, fontSize: 17, lineHeight: 24, color: palette.textHi, fontVariant: ["tabular-nums"] },
  nextSub: { fontFamily: fonts.regular, fontSize: 14, color: palette.textMid },

  // detail rows
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingHorizontal: 20, paddingVertical: 14 },
  rowLabel: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  rowValue: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: palette.textHi, textAlign: "right", flexShrink: 1, maxWidth: "62%" },
  endCampBtn: { marginTop: 24 },

  // schedule
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: MIN_TAP, paddingHorizontal: 12, borderRadius: radius.sm, marginRight: -8 },
  addBtnText: { fontFamily: fonts.medium, fontSize: 15, color: palette.goldPale },
  dayGroup: { marginTop: 16, gap: 8 },
  dayLabel: { color: palette.textMid },
  sRow: { flexDirection: "row", alignItems: "center", paddingRight: 4 },
  sCheckHit: { width: MIN_TAP + 8, minHeight: MIN_TAP, alignItems: "center", justifyContent: "center" },
  sCheck: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: palette.borderStrong, alignItems: "center", justifyContent: "center" },
  sCheckDone: { backgroundColor: palette.gold, borderColor: palette.gold },
  sCheckLocked: { opacity: 0.4 },
  sTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sType: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 22, color: palette.textHi },
  sDetail: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid, marginTop: 2, fontVariant: ["tabular-nums"] },
  sObjective: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textHi, marginTop: 4 },
  sActions: { flexDirection: "row" },
  iconTap: { width: MIN_TAP, height: MIN_TAP, alignItems: "center", justifyContent: "center" },

  // forms
  formCol: { gap: 16 },
  row2: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: MIN_TAP,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipActive: { backgroundColor: palette.raised, borderColor: palette.goldHair },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  chipTextActive: { color: palette.textHi },
  inputMultiline: { minHeight: 88, paddingTop: 14, paddingBottom: 14, textAlignVertical: "top" },
  error: { fontFamily: fonts.regular, fontSize: 14, color: palette.redText },
  formActions: { flexDirection: "row", gap: 12, marginTop: 4 },
});

const rev = StyleSheet.create({
  emptyText: { ...T.bodySm, color: palette.textMid, padding: 20 },
  mixRow: { flexDirection: "row", flexWrap: "wrap", gap: 24, paddingHorizontal: 20, paddingVertical: 18 },
  mixItem: { gap: 2 },
  mixCount: { ...T.numeralM, color: palette.textHi },
  mixLabel: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid },
  block: { paddingHorizontal: 20, paddingVertical: 16 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  blockLabel: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid },
  blockEmpty: { ...T.bodySm, color: palette.textMid, marginTop: 6 },
  impTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  impName: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi, flexShrink: 1 },
  impDelta: { ...T.numeralS, color: palette.gold },
  impValues: { ...T.bodySm, color: palette.textHi, marginTop: 4, fontVariant: ["tabular-nums"] },
  impDates: { ...T.caption, color: palette.textMid, marginTop: 2 },
  leakLabel: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi },
  leakMeta: { ...T.bodySm, color: palette.textMid, marginTop: 2, fontVariant: ["tabular-nums"] },
  lockRow: { flexDirection: "row", gap: 12, padding: 20, minHeight: MIN_TAP },
  lockText: { flex: 1, ...T.bodySm, color: palette.textMid },
});

