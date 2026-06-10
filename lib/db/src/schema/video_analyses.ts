import { pgTable, serial, integer, text, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

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

export const videoAnalysesTable = pgTable("video_analyses", {
  id: serial("id").primaryKey(),
  fighterId: integer("fighter_id")
    .notNull()
    .references(() => fightersTable.id, { onDelete: "cascade" }),
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
  durationSec: real("duration_sec").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VideoAnalysis = typeof videoAnalysesTable.$inferSelect;
