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

export type AnalysisFinding = {
  title: string;
  observation: string;
  nervousSystemFraming: string;
  severity: "low" | "medium" | "high";
  area: string;
  // Knowledge Loop: id of an EXISTING athlete_facts row this finding is new
  // evidence for (AI-proposed, server-validated before any merge).
  matchesFactId?: number;
  // Fixed-ontology key (lib/ontology) for NEW observations, e.g. "striking.exits".
  subcategory?: string;
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
  metrics: jsonb("metrics").$type<AnalysisMetrics>().notNull(),
  keyframes: jsonb("keyframes").$type<AnalysisKeyframe[]>().notNull(),
  keyframeNotes: jsonb("keyframe_notes").$type<Record<number, string>>().notNull().default({}),
  // Film-review loop: ONE grounded follow-up question FRAME asks after the read,
  // and the athlete's recorded answer (empty until answered).
  reviewQuestion: text("review_question").notNull().default(""),
  reviewAnswer: text("review_answer").notNull().default(""),
  // FRAME Replay — up to three curated moments tied to real keyframe timestamps.
  replayMoments: jsonb("replay_moments").$type<ReplayMoment[]>().notNull().default([]),
  durationSec: real("duration_sec").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VideoAnalysis = typeof videoAnalysesTable.$inferSelect;
