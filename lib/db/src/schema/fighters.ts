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
  // Free-text self-description captured at onboarding; seeds the spirit-animal read.
  personality: text("personality").notNull().default(""),
  // Spirit animal is chosen by the AI from a fixed curated bestiary (see spiritAnimals.ts).
  spiritAnimal: text("spirit_animal").notNull().default(""),
  spiritAnimalTagline: text("spirit_animal_tagline").notNull().default(""),
  // Adaptive language: 0 = unknown, 1 (plain) .. 5 (technical). Grows as the athlete shows range.
  vocabularyLevel: integer("vocabulary_level").notNull().default(0),
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
