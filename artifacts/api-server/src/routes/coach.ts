import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import {
  db,
  fightersTable,
  messagesTable,
  calibrationsTable,
  attachmentsTable,
  type Attachment,
} from "@workspace/db";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { promises as fs } from "node:fs";
import path from "node:path";
import { COACH_SYSTEM_PROMPT_STATIC, buildDynamicContext } from "../lib/synochi";
import { getOrCreateActiveConversation } from "./conversation";
import { getActiveFacts } from "../lib/factsService";
import { extractMemory } from "../lib/memoryExtractor";
import { UPLOADS_DIR } from "./attachments";
import { selectRelevantNodes, buildRetrievalQuery } from "../lib/vaultRetrieval";
import { openai, OPENAI_COACH_MODEL } from "../lib/openaiClient";

const OPENAI_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

const CLAUDE_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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

    const recentTurns = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversation.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(6);
    const recentText = recentTurns
      .map((m) => m.content)
      .filter(Boolean)
      .join("\n\n");
    const profileText = [fighter.goals, fighter.weaknesses].filter(Boolean).join(" ");
    const deepNodes = selectRelevantNodes(
      `${profileText}\n${recentText}`,
      6,
    );

    const entryInstruction = `\n\n[ENTRY BRIEFING MODE]\nThe athlete just opened the frame. Produce a short opening (4-7 sentences, no preamble).\n- Open with their name in the first 1-3 words.\n- Reflect ONE specific signal you actually have on them (from their model, onboarding, or last calibration) so they feel seen.\n- Name where they appear to be right now (fresh, mid-cycle, deload, post-comp, etc. — only assert what you actually have evidence for; otherwise name the gap).\n- Offer 2 or 3 concrete entry points for this session (e.g. "debrief last roll", "tighten the half-guard pass", "regulate before tomorrow").\n- A single line of dry, earned banter about their archetype is permitted ONLY if you have a specific archetype signal. No generic motivation. No therapist energy. No questions back at the end — just open the floor.\nVoice: direct, structural, performance-grounded. End cleanly without sign-off.`;

    const dynamicText =
      buildDynamicContext(fighter, facts, calibrations, deepNodes) + entryInstruction;

    let text = "";
    if (conversation.aiProvider === "openai") {
      const completion = await openai.chat.completions.create({
        model: OPENAI_COACH_MODEL,
        max_completion_tokens: 600,
        messages: [
          { role: "system", content: COACH_SYSTEM_PROMPT_STATIC },
          { role: "system", content: dynamicText },
          { role: "user", content: "[athlete entering frame]" },
        ],
      });
      text = (completion.choices[0]?.message?.content ?? "").trim();
    } else {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: [
          {
            type: "text",
            text: COACH_SYSTEM_PROMPT_STATIC,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: dynamicText },
        ],
        messages: [{ role: "user", content: "[athlete entering frame]" }],
      });
      text = response.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
    }

    if (!text) {
      res.json({ message: null, reason: "empty generation" });
      return;
    }

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

async function buildOpenAIUserContent(
  text: string,
  attachments: Attachment[],
  includeImageBytes: boolean,
): Promise<string | ChatCompletionContentPart[]> {
  if (attachments.length === 0) return text;
  const parts: ChatCompletionContentPart[] = [];
  for (const a of attachments) {
    if (a.kind === "image" && OPENAI_IMAGE_MIME.has(a.mimeType) && includeImageBytes) {
      try {
        const buf = await fs.readFile(path.join(UPLOADS_DIR, a.filePath));
        parts.push({
          type: "image_url",
          image_url: { url: `data:${a.mimeType};base64,${buf.toString("base64")}` },
        });
      } catch {
        parts.push({ type: "text", text: `[image attached but unreadable: ${a.filename}]` });
      }
    } else if (a.kind === "image") {
      parts.push({ type: "text", text: `[earlier image attached: ${a.filename}]` });
    } else {
      parts.push({
        type: "text",
        text: `[video attached: ${a.filename} (${a.mimeType}) — you cannot see video, ask the athlete to describe what to focus on or take stills]`,
      });
    }
  }
  if (text) parts.push({ type: "text", text });
  return parts;
}

async function buildUserMessageContent(
  text: string,
  attachments: Attachment[],
  includeImageBytes: boolean,
): Promise<Anthropic.MessageParam["content"]> {
  if (attachments.length === 0) return text;

  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const a of attachments) {
    if (a.kind === "image" && CLAUDE_IMAGE_MIME.has(a.mimeType) && includeImageBytes) {
      try {
        const buf = await fs.readFile(path.join(UPLOADS_DIR, a.filePath));
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: a.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: buf.toString("base64"),
          },
        });
      } catch {
        blocks.push({ type: "text", text: `[image attached but unreadable: ${a.filename}]` });
      }
    } else if (a.kind === "image") {
      blocks.push({ type: "text", text: `[earlier image attached: ${a.filename}]` });
    } else {
      blocks.push({
        type: "text",
        text: `[video attached: ${a.filename} (${a.mimeType}) — you cannot see video, ask the athlete to describe what to focus on or take stills]`,
      });
    }
  }
  if (text) blocks.push({ type: "text", text });
  return blocks;
}

router.post("/coach/chat", async (req, res) => {
  const body = req.body as { content?: unknown; attachmentIds?: unknown };
  if (typeof body.content !== "string") {
    res.status(400).json({ error: "content (string) required" });
    return;
  }
  const userContent = body.content.trim();

  const attachmentIds: number[] = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : [];

  if (userContent.length === 0 && attachmentIds.length === 0) {
    res.status(400).json({ error: "message must have text or attachments" });
    return;
  }

  const [fighter] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  if (!fighter) {
    res.status(400).json({ error: "no fighter — complete onboarding first" });
    return;
  }
  const conversation = await getOrCreateActiveConversation(fighter.id);

  const [userMsg] = await db
    .insert(messagesTable)
    .values({
      conversationId: conversation.id,
      role: "user",
      content: userContent,
    })
    .returning();

  if (attachmentIds.length > 0 && userMsg) {
    await db
      .update(attachmentsTable)
      .set({ messageId: userMsg.id })
      .where(inArray(attachmentsTable.id, attachmentIds));
  }

  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversation.id))
    .orderBy(asc(messagesTable.createdAt));

  const allAttachments = await db
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.conversationId, conversation.id));

  const byMsg = new Map<number, Attachment[]>();
  for (const a of allAttachments) {
    if (a.messageId == null) continue;
    const arr = byMsg.get(a.messageId);
    if (arr) arr.push(a);
    else byMsg.set(a.messageId, [a]);
  }

  const lastUserMsgId = userMsg?.id ?? -1;

  const facts = await getActiveFacts(fighter.id);
  const calibrations = await db
    .select()
    .from(calibrationsTable)
    .where(eq(calibrationsTable.fighterId, fighter.id))
    .orderBy(desc(calibrationsTable.createdAt))
    .limit(10);

  // Build retrieval context: profile signals + last 6 turns + the new user message,
  // with the new message weighted highest. selectRelevantNodes scores MODELS/MECHANISMS
  // and returns full-text for top matches to inline in the dynamic system block.
  const recentForRetrieval = history.slice(-6).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const profileText = [fighter.goals, fighter.weaknesses].filter(Boolean).join(" ");
  const retrievalQuery = `${profileText}\n${buildRetrievalQuery(recentForRetrieval, userContent)}`;
  const deepNodes = selectRelevantNodes(retrievalQuery, 8);
  req.log.info(
    {
      deepNodeCount: deepNodes.length,
      deepTitles: deepNodes.map((n) => `${n.folder}/${n.title}(${n.score})`),
    },
    "vault retrieval",
  );

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
    const dynamicText = buildDynamicContext(fighter, facts, calibrations, deepNodes);

    if (conversation.aiProvider === "openai") {
      const openaiMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: COACH_SYSTEM_PROMPT_STATIC },
        { role: "system", content: dynamicText },
      ];
      for (const m of history) {
        const role = m.role as "user" | "assistant";
        const atts = byMsg.get(m.id) ?? [];
        if (role === "assistant") {
          openaiMessages.push({ role: "assistant", content: m.content });
          continue;
        }
        const includeImageBytes = m.id === lastUserMsgId;
        const content = await buildOpenAIUserContent(m.content, atts, includeImageBytes);
        openaiMessages.push({ role: "user", content } as ChatCompletionMessageParam);
      }

      const stream = await openai.chat.completions.create({
        model: OPENAI_COACH_MODEL,
        max_completion_tokens: 8192,
        messages: openaiMessages,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          assembled += delta;
          send({ content: delta });
        }
      }
    } else {
      const claudeMessages: Anthropic.MessageParam[] = [];
      for (const m of history) {
        const role = m.role as "user" | "assistant";
        const atts = byMsg.get(m.id) ?? [];
        if (role === "assistant") {
          claudeMessages.push({ role, content: m.content });
          continue;
        }
        const includeImageBytes = m.id === lastUserMsgId;
        const content = await buildUserMessageContent(m.content, atts, includeImageBytes);
        claudeMessages.push({ role, content });
      }

      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: [
          {
            type: "text",
            text: COACH_SYSTEM_PROMPT_STATIC,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: dynamicText },
        ],
        messages: claudeMessages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          assembled += event.delta.text;
          send({ content: event.delta.text });
        }
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
