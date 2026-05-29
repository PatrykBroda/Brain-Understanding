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
};

export const videoAnalysesTable = pgTable("video_analyses", {
  id: serial("id").primaryKey(),
  fighterId: integer("fighter_id")
    .notNull()
    .references(() => fightersTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ANALYSIS_KINDS }).notNull(),
  nervousSystemLoad: text("nervous_system_load", { enum: NERVOUS_SYSTEM_LOADS }).notNull(),
  summary: text("summary").notNull(),
  findings: jsonb("findings").$type<AnalysisFinding[]>().notNull(),
  metrics: jsonb("metrics").$type<AnalysisMetrics>().notNull(),
  keyframes: jsonb("keyframes").$type<AnalysisKeyframe[]>().notNull(),
  durationSec: real("duration_sec").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VideoAnalysis = typeof videoAnalysesTable.$inferSelect;
