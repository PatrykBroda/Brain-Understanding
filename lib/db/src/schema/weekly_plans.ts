import { pgTable, serial, integer, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

export const PLAN_CATEGORIES = ["fix", "train", "technique", "regulate", "goal_step"] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];

export type PlanItem = {
  key: string;
  category: PlanCategory;
  title: string;
  detail: string;
  suggestedDays: string;
  sourceFactIds: number[];
  sourceCalibrationKeys: string[];
  sourceLabel: string;
};

export const weeklyPlansTable = pgTable(
  "weekly_plans",
  {
    id: serial("id").primaryKey(),
    fighterId: integer("fighter_id")
      .notNull()
      .references(() => fightersTable.id, { onDelete: "cascade" }),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    aiProvider: text("ai_provider").notNull().default("claude"),
    items: jsonb("items").$type<PlanItem[]>().notNull(),
    rationale: text("rationale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fighterWeek: uniqueIndex("weekly_plans_fighter_week_uq").on(t.fighterId, t.weekStart),
  }),
);

export const weeklyPlanItemCompletionsTable = pgTable(
  "weekly_plan_item_completions",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => weeklyPlansTable.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planItemUq: uniqueIndex("weekly_plan_completions_plan_item_uq").on(t.planId, t.itemKey),
  }),
);

export type WeeklyPlan = typeof weeklyPlansTable.$inferSelect;
export type WeeklyPlanCompletion = typeof weeklyPlanItemCompletionsTable.$inferSelect;
