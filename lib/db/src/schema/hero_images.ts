import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

// The profile fighter-card hero image, stored as bytes in Postgres rather than
// on local disk. The app runs on Replit autoscale, where each instance has its
// own ephemeral filesystem — a file written on the upload instance is gone (or
// on a different instance) by the time the image GET lands, so disk storage
// silently 404s. Keeping the bytes in the shared DB makes the photo durable.
//
// One row per fighter (fighterId is unique); `heroImageUrl` on the fighter row
// stays as a short marker used for `hasHero`/cache-busting, not the payload.
export const heroImagesTable = pgTable(
  "hero_images",
  {
    id: serial("id").primaryKey(),
    fighterId: integer("fighter_id")
      .notNull()
      .references(() => fightersTable.id, { onDelete: "cascade" }),
    mimeType: text("mime_type").notNull(),
    // Base64-encoded image bytes.
    dataBase64: text("data_base64").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    fighterUq: uniqueIndex("hero_images_fighter_uq").on(t.fighterId),
  }),
);

export type HeroImage = typeof heroImagesTable.$inferSelect;
