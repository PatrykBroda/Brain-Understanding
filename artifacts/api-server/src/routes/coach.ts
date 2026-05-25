import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  fightersTable,
  messagesTable,
  calibrationsTable,
} from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { COACH_SYSTEM_PROMPT_STATIC, buildDynamicContext } from "../lib/synochi";
import { getOrCreateActiveConversation } from "./conversation";
import { getActiveFacts } from "../lib/factsService";
import { extractMemory } from "../lib/memoryExtractor";

const router: IRouter = Router();

const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];

if (!baseURL || !apiKey) {
  throw new Error(
    "AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY must be set",
  );
}

const client = new Anthropic({ baseURL, apiKey });

router.post("/coach/chat", async (req, res) => {
  const body = req.body as { content?: unknown };
  if (typeof body.content !== "string" || body.content.trim().length === 0) {
    res.status(400).json({ error: "content (string) required" });
    return;
  }
  const userContent = body.content.trim();

  const [fighter] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  if (!fighter) {
    res.status(400).json({ error: "no fighter — complete onboarding first" });
    return;
  }
  const conversation = await getOrCreateActiveConversation(fighter.id);

  await db.insert(messagesTable).values({
    conversationId: conversation.id,
    role: "user",
    content: userContent,
  });

  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversation.id))
    .orderBy(asc(messagesTable.createdAt));

  const facts = await getActiveFacts(fighter.id);

  const calibrations = await db
    .select()
    .from(calibrationsTable)
    .where(eq(calibrationsTable.fighterId, fighter.id))
    .orderBy(desc(calibrationsTable.createdAt))
    .limit(10);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let assembled = "";

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: [
        {
          type: "text",
          text: COACH_SYSTEM_PROMPT_STATIC,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: buildDynamicContext(fighter, facts, calibrations),
        },
      ],
      messages: history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        assembled += event.delta.text;
        send({ content: event.delta.text });
      }
    }

    await db.insert(messagesTable).values({
      conversationId: conversation.id,
      role: "assistant",
      content: assembled,
    });

    send({ done: true });
    res.end();

    if (assembled.trim().length > 0) {
      extractMemory({
        fighter,
        userText: userContent,
        assistantText: assembled,
        log: req.log,
      }).catch((err) => req.log.error({ err }, "extractMemory rejected"));
    }
  } catch (err) {
    req.log.error({ err }, "Coach stream failed");
    if (assembled.length > 0) {
      await db.insert(messagesTable).values({
        conversationId: conversation.id,
        role: "assistant",
        content: assembled,
      });
    }
    send({ error: err instanceof Error ? err.message : "stream failed" });
    res.end();
  }
});

export default router;
