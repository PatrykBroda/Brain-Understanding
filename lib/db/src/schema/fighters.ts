import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const fightersTable = pgTable("fighters", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  art: text("art").notNull(),
  level: text("level").notNull(),
  trainingFrequency: text("training_frequency").notNull(),
  goals: text("goals").notNull().default(""),
  weaknesses: text("weaknesses").notNull().default(""),
  competes: boolean("competes").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertFighterSchema = createInsertSchema(fightersTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFighter = z.infer<typeof insertFighterSchema>;
export type Fighter = typeof fightersTable.$inferSelect;
