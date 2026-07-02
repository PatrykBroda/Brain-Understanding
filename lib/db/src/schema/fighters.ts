import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
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
  // Source of truth for age going forward (ISO "YYYY-MM-DD"); `age` is kept in sync/back-compat.
  dateOfBirth: date("date_of_birth"),
  art: text("art").notNull(),
  // Structured primary combat sport (mma/boxing/muay_thai/kickboxing/bjj/wrestling/judo/karate/mixed).
  // FRAME is a combat-performance system, not BJJ-only — this steers sport-specific language.
  primarySport: text("primary_sport").notNull().default(""),
  level: text("level").notNull(),
  trainingFrequency: text("training_frequency").notNull(),
  gym: text("gym").notNull().default(""),
  // Head coach / lead trainer — shown in the profile "Camp" block.
  headCoach: text("head_coach").notNull().default(""),
  heightCm: integer("height_cm"),
  weightKg: integer("weight_kg"),
  // Fighter-card identity fields (all optional, shown only when set).
  reachCm: integer("reach_cm"),
  weightClass: text("weight_class").notNull().default(""),
  stance: text("stance").notNull().default(""),
  // Free-form competitive record, e.g. "8-1-0" (wins-losses-draws). Never fabricated.
  record: text("record").notNull().default(""),
  // Customizable faded hero background for the profile card. Stores a safe filename in
  // the server UPLOADS_DIR; server-managed via POST/DELETE /fighter/hero (omitted from client schemas).
  heroImageUrl: text("hero_image_url").notNull().default(""),
  goals: text("goals").notNull().default(""),
  weaknesses: text("weaknesses").notNull().default(""),
  competes: boolean("competes").notNull().default(false),
  // Free-text self-description captured at onboarding; seeds the spirit-animal read.
  personality: text("personality").notNull().default(""),
  // Persistent athlete bio — shown on profile and injected into every coach session.
  bio: text("bio").notNull().default(""),
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

// `age` is omitted everywhere the client can write: it is server-derived from
// `dateOfBirth` (the single source of truth) so the two can never desync.
export const insertFighterSchema = createInsertSchema(fightersTable)
  .omit({
    id: true,
    userId: true,
    age: true,
    // hero image is set via the dedicated upload endpoint, never by the client payload.
    heroImageUrl: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    dateOfBirth: z.string().date(),
  });

// Partial update for editing an existing athlete profile (PATCH /fighter).
// Server-controlled fields stay omitted so they can't be overwritten by the client.
export const updateFighterSchema = createInsertSchema(fightersTable)
  .omit({
    id: true,
    userId: true,
    age: true,
    heroImageUrl: true,
    createdAt: true,
    updatedAt: true,
    spiritAnimal: true,
    spiritAnimalTagline: true,
    vocabularyLevel: true,
  })
  .partial();

export type InsertFighter = z.infer<typeof insertFighterSchema>;
export type UpdateFighter = z.infer<typeof updateFighterSchema>;
export type Fighter = typeof fightersTable.$inferSelect;
