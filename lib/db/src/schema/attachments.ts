import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";
import { messagesTable } from "./messages";

export const attachmentsTable = pgTable("attachments", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  messageId: integer("message_id").references(() => messagesTable.id, {
    onDelete: "cascade",
  }),
  kind: text("kind", { enum: ["image", "video"] }).notNull(),
  mimeType: text("mime_type").notNull(),
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Attachment = typeof attachmentsTable.$inferSelect;
