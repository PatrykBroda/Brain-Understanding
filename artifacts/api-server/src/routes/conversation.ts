import { Router, type IRouter } from "express";
import {
  db,
  fightersTable,
  conversationsTable,
  messagesTable,
} from "@workspace/db";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateActiveConversation(fighterId: number) {
  const [active] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.fighterId, fighterId), isNull(conversationsTable.endedAt)))
    .orderBy(desc(conversationsTable.startedAt))
    .limit(1);
  if (active) return active;
  const [created] = await db
    .insert(conversationsTable)
    .values({ fighterId })
    .returning();
  return created!;
}

router.get("/conversation/active", async (_req, res) => {
  const [fighter] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  if (!fighter) {
    res.json({ conversation: null, messages: [] });
    return;
  }
  const conversation = await getOrCreateActiveConversation(fighter.id);
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversation.id))
    .orderBy(asc(messagesTable.createdAt));
  res.json({ conversation, messages });
});

router.post("/conversation/reset", async (_req, res) => {
  const [fighter] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  await db
    .update(conversationsTable)
    .set({ endedAt: new Date() })
    .where(and(eq(conversationsTable.fighterId, fighter.id), isNull(conversationsTable.endedAt)));
  const conversation = await getOrCreateActiveConversation(fighter.id);
  res.json({ conversation, messages: [] });
});

export { getOrCreateActiveConversation };
export default router;
