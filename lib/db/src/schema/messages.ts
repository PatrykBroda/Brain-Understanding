import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Idempotency key the app generates per send (retries reuse it). On a user row
  // it identifies the send; on an assistant row it marks the COMPLETE reply to
  // that send (partial replies saved after a dropped stream leave it null).
  clientMessageId: text("client_message_id"),
}, (t) => [
  index("messages_conversation_client_message_id_idx").on(t.conversationId, t.clientMessageId),
]);

export type Message = typeof messagesTable.$inferSelect;
