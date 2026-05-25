import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  fightersTable,
  messagesTable,
  calibrationsTable,
} from "@workspace/db";
import { asc, desc, eq, sql } from "drizzle-orm";
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

const ENTRY_STALE_MS = 30 * 60 * 1000;

const WELCOME_LOCK_NAMESPACE = 7411;

router.post("/coach/welcome", async (req, res) => {
  const [fighter] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  if (!fighter) {
    res.status(400).json({ error: "no fighter — complete onboarding first" });
    return;
  }
  const conversation = await getOrCreateActiveConversation(fighter.id);

  const lockResult = await db.execute(
    sql`SELECT pg_try_advisory_lock(${WELCOME_LOCK_NAMESPACE}::int, ${conversation.id}::int) AS got`,
  );
  const got = (lockResult.rows[0] as { got: boolean } | undefined)?.got === true;
  if (!got) {
    res.json({ message: null, reason: "in-progress" });
    return;
  }

  try {
    const [last] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversation.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    const isStale = !last || Date.now() - new Date(last.createdAt).getTime() > ENTRY_STALE_MS;
    if (!isStale) {
      res.json({ message: null, reason: "recent activity" });
      return;
    }

    const lastSeenId = last?.id ?? null;

    const facts = await getActiveFacts(fighter.id);
    const calibrations = await db
      .select()
      .from(calibrationsTable)
      .where(eq(calibrationsTable.fighterId, fighter.id))
      .orderBy(desc(calibrationsTable.createdAt))
      .limit(10);

    const entryInstruction = `\n\n[ENTRY BRIEFING MODE]\nThe athlete just opened the frame. Produce a short opening (4-7 sentences, no preamble).\n- Open with their name in the first 1-3 words.\n- Reflect ONE specific signal you actually have on them (from their model, onboarding, or last calibration) so they feel seen.\n- Name where they appear to be right now (fresh, mid-cycle, deload, post-comp, etc. — only assert what you actually have evidence for; otherwise name the gap).\n- Offer 2 or 3 concrete entry points for this session (e.g. "debrief last roll", "tighten the half-guard pass", "regulate before tomorrow").\n- A single line of dry, earned banter about their archetype is permitted ONLY if you have a specific archetype signal. No generic motivation. No therapist energy. No questions back at the end — just open the floor.\nVoice: direct, structural, performance-grounded. End cleanly without sign-off.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: COACH_SYSTEM_PROMPT_STATIC,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: buildDynamicContext(fighter, facts, calibrations) + entryInstruction,
        },
      ],
      messages: [{ role: "user", content: "[athlete entering frame]" }],
    });

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    if (!text) {
      res.json({ message: null, reason: "empty generation" });
      return;
    }

    // Re-check: while we were generating, did a user (or another writer)
    // post a new message? If so, drop the welcome — sending it now would
    // arrive out of order and disrupt the live exchange.
    const [latest] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversation.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    const racedByOther = latest && latest.id !== lastSeenId;
    if (racedByOther) {
      res.json({ message: null, reason: "raced" });
      return;
    }

    const [msg] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        role: "assistant",
        content: text,
      })
      .returning();

    res.json({ message: msg });
  } catch (err) {
    req.log.error({ err }, "welcome generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "welcome failed" });
  } finally {
    await db
      .execute(
        sql`SELECT pg_advisory_unlock(${WELCOME_LOCK_NAMESPACE}::int, ${conversation.id}::int)`,
      )
      .catch((err) => req.log.error({ err }, "welcome advisory unlock failed"));
  }
});

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
