import { pgTable, serial, integer, text, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";
import { competitionsTable } from "./competitions";

export const ANALYSIS_KINDS = [
  "sparring",
  "padwork",
  "shadowboxing",
  "drilling",
  "movement",
  "lifting",
] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

export const NERVOUS_SYSTEM_LOADS = ["low", "moderate", "elevated", "high"] as const;
export type NervousSystemLoad = (typeof NERVOUS_SYSTEM_LOADS)[number];

// Who the footage is OF. "self" is the athlete's own read (the FRAME REPORT with
// real pose-measured 0-100 scores). "opponent" is a scouting read: categorical
// tendencies only (no fabricated scores) plus a matchup vs the athlete's model.
export const ANALYSIS_SUBJECTS = ["self", "opponent"] as const;
export type AnalysisSubject = (typeof ANALYSIS_SUBJECTS)[number];

// Fixed vocabulary for "where on the body" a finding points. The AI may only
// pick from this list (plus a real keyframe index); the client resolves the
// landmarks and movement arrow from the stored pose track — never from the AI.
export const BODY_REGIONS = [
  "lead_hand",
  "rear_hand",
  "head",
  "hips",
  "lead_foot",
  "rear_foot",
  "lead_knee",
  "rear_knee",
  "shoulders",
  "torso",
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export type AnalysisFinding = {
  title: string;
  observation: string;
  // Legacy name, kept for stored rows: "why this matters in a fight", in plain words.
  nervousSystemFraming: string;
  // The one drill / constraint / cue for the next session (optional: older analyses do not have it).
  fix?: string;
  severity: "low" | "medium" | "high";
  area: string;
  // Knowledge Loop: id of an EXISTING athlete_facts row this finding is new
  // evidence for (AI-proposed, server-validated before any merge).
  matchesFactId?: number;
  // Fixed-ontology key (lib/ontology) for NEW observations, e.g. "striking.exits".
  subcategory?: string;
  // Optional grounded visual: the real keyframe this finding is about and the
  // body region on it. Both or neither; server-validated against the stored
  // keyframes (and the pose track when present). Omitted when not groundable.
  keyframeIndex?: number;
  bodyRegion?: BodyRegion;
};

export type AnalysisSignal = {
  key: string;
  label: string;
  value: string;
  detail: string;
};

// A 0-100 attribute derived deterministically from real pose metrics on the client.
// `basis` records HOW it was derived so provenance is never lost (brand: no fake numbers).
export type AnalysisScore = {
  key: string;
  label: string;
  value: number; // 0-100
  basis: string;
};

// A grounded, hedged stylistic parallel to a known fighter (never "you ARE X").
export type StyleParallel = {
  name: string;
  note: string;
};

// A movement event detected from pose data, tied to a timestamp (and usually a keyframe).
export type DetectedEvent = {
  timestamp: number;
  type: string; // e.g. "guard_drop", "overextension", "slip", "delayed_recovery"
  label: string;
  severity: "low" | "medium" | "high";
};

export type AnalysisComparison = {
  deltas: { key: string; label: string; delta: number }[];
  note: string;
};

export type AnalysisMetrics = {
  framesAnalysed: number;
  poseFrames: number;
  durationSec: number;
  loadBasis: string;
  signals: AnalysisSignal[];
};

export type AnalysisKeyframe = {
  timestamp: number;
  imageBase64: string;
  caption: string;
  eventType?: string;
};

// FRAME Replay: up to three curated film-review moments. The AI selects among the
// REAL detected keyframes and writes the `note`; the `timestamp` is always copied
// from a real stored keyframe server-side (never emitted by the AI) so it can seek
// the footage to a genuine moment.
export const REPLAY_ROLES = ["best_decision", "worst_habit", "biggest_opportunity"] as const;
export type ReplayRole = (typeof REPLAY_ROLES)[number];

export type ReplayMoment = {
  role: ReplayRole;
  timestamp: number; // copied from a real keyframe.timestamp
  label: string; // human label, e.g. "Best decision"
  note: string; // AI narrative, grounded — never numbers
};

// Opponent Mode matchup read: a categorical contrast of the athlete's recorded
// model vs an opponent's detected tendencies. Narrative only — never numbers. Null
// when there isn't enough grounded evidence on either side to call it honestly.
export type MatchupEdge = {
  title: string;
  note: string;
};

export type Matchup = {
  advantage: MatchupEdge;
  risk: MatchupEdge;
  notes: string[];
} | null;

// Compact per-frame pose track (quantised landmarks), v1. Only frames with a
// pose lock are kept. `d` is base64 of, per frame, 33 x [x u16, y u16, vis u8]
// (little-endian), x/y mapped from [-0.5, 1.5] to [0, 65535], vis from [0, 1]
// to [0, 255]. `t` is the per-frame timestamp in integer milliseconds. `w`/`h`
// is the source video size (aspect only). `lead` is the measured lead side of
// the stance ("left"|"right") or null when it could not be told honestly.
export type PoseTrack = {
  v: 1;
  w: number;
  h: number;
  lead: "left" | "right" | null;
  t: number[];
  d: string;
  // Optional second person from a two-person clip ("blue is you, red is the
  // opponent"): same layout/w/h as above. Absent on single-person clips and on
  // every row saved before this existed — no migration, the jsonb just grows.
  opp?: {
    lead: "left" | "right" | null;
    t: number[];
    d: string;
  };
};

export const videoAnalysesTable = pgTable("video_analyses", {
  id: serial("id").primaryKey(),
  fighterId: integer("fighter_id")
    .notNull()
    .references(() => fightersTable.id, { onDelete: "cascade" }),
  // The active camp at the moment this analysis was created (null when none was
  // live). Stamped at write time — camp membership is never re-derived by date,
  // so creating/cancelling a camp later never silently reassigns past footage.
  campId: integer("camp_id").references(() => competitionsTable.id, {
    onDelete: "set null",
  }),
  // Opponent Mode discriminator. "self" rows are the athlete's own reads (scored
  // FRAME REPORT + knowledge-loop). "opponent" rows are scouting reads: categorical
  // only (scores stay []), never feed athlete_facts, and are excluded from every
  // self-progression query (history comparison, camp review, free-tier taster).
  subject: text("subject", { enum: ANALYSIS_SUBJECTS }).notNull().default("self"),
  // Free-text opponent name for opponent rows (prefilled from the active camp's
  // opponent when present). Always "" for self rows.
  opponentName: text("opponent_name").notNull().default(""),
  kind: text("kind", { enum: ANALYSIS_KINDS }).notNull(),
  focus: text("focus").notNull().default(""),
  nervousSystemLoad: text("nervous_system_load", { enum: NERVOUS_SYSTEM_LOADS }).notNull(),
  fragmentationRisk: text("fragmentation_risk", { enum: NERVOUS_SYSTEM_LOADS })
    .notNull()
    .default("low"),
  sessionScore: integer("session_score").notNull().default(0),
  styleProfile: text("style_profile").notNull().default(""),
  aiComment: text("ai_comment").notNull().default(""),
  summary: text("summary").notNull(),
  findings: jsonb("findings").$type<AnalysisFinding[]>().notNull(),
  scores: jsonb("scores").$type<AnalysisScore[]>().notNull().default([]),
  styleParallels: jsonb("style_parallels").$type<StyleParallel[]>().notNull().default([]),
  detectedEvents: jsonb("detected_events").$type<DetectedEvent[]>().notNull().default([]),
  comparison: jsonb("comparison").$type<AnalysisComparison | null>(),
  // Opponent Mode only: the grounded matchup read (advantage/risk/notes) vs the
  // athlete's recorded model. Null on self rows and on opponent rows where evidence
  // was too thin to call the matchup honestly.
  matchup: jsonb("matchup").$type<Matchup>(),
  metrics: jsonb("metrics").$type<AnalysisMetrics>().notNull(),
  keyframes: jsonb("keyframes").$type<AnalysisKeyframe[]>().notNull(),
  keyframeNotes: jsonb("keyframe_notes").$type<Record<number, string>>().notNull().default({}),
  // Film-review loop: ONE grounded follow-up question FRAME asks after the read,
  // and the athlete's recorded answer (empty until answered).
  reviewQuestion: text("review_question").notNull().default(""),
  reviewAnswer: text("review_answer").notNull().default(""),
  // FRAME Replay — up to three curated moments tied to real keyframe timestamps.
  replayMoments: jsonb("replay_moments").$type<ReplayMoment[]>().notNull().default([]),
  // Per-frame pose landmarks (quantised) for the skeleton overlay, movement
  // graphs, annotated frames and comparisons. Null on analyses saved before
  // this existed — they render exactly as before.
  poseTrack: jsonb("pose_track").$type<PoseTrack | null>(),
  durationSec: real("duration_sec").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VideoAnalysis = typeof videoAnalysesTable.$inferSelect;
