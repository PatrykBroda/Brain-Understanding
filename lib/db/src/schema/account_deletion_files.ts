import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Durable outbox for private attachment bytes whose account metadata has been
 * deleted. Rows are removed only after the corresponding filesystem object is
 * gone (or confirmed absent), allowing cleanup to retry after process failure.
 */
export const accountDeletionFilesTable = pgTable(
  "account_deletion_files",
  {
    id: serial("id").primaryKey(),
    filePath: text("file_path").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("account_deletion_files_path_uq").on(table.filePath),
  ],
);

export type AccountDeletionFile =
  typeof accountDeletionFilesTable.$inferSelect;