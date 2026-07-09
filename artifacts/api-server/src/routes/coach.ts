import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import {
  db,
  messagesTable,
  calibrationsTable,
  attachmentsTable,
  fightersTable,
  type Attachment,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { promises as fs } from "node:fs";
import path from "node:path";
import { COACH_SYSTEM_PROMPT_STATIC, buildDynamicContext } from "../lib/synochi";
import { getOrCreateActiveConversation } from "./conversation";
import { getActiveFacts } from "../lib/factsService";
import { extractMemory } from "../lib/memoryExtractor";
import { UPLOADS_DIR } from "./attachments";
import { selectRelevantNodes, buildRetrievalQuery } from "../lib/vaultRetrieval";
import { openai, OPENAI_COACH_MODEL } from "../lib/openaiClient";
import {
  getActiveCompetition,
  pressureFor,
  competitionPromptBlock,
  weightCutFor,
} from "../lib/competitionService";
import { getUpcomingSessions } from "../lib/trainingSessionService";
import { computeVocabulary, vocabularyPromptBlock } from "../lib/vocabulary";
import { getEntitlementForClerkUser } from "../lib/subscriptionService";
import { countUserMessagesToday, FREE_DAILY_COACHING_LIMIT } from "../lib/featureGates";

// Build the active-camp coach directive: pressure + phase + honest weight-cut +
// upcoming scheduled sessions. Null when no camp is live.
async function buildCompBlock(fighterId: number): Promise<string | null> {
  const activeComp = await getActiveCompetition(fighterId);
  if (!activeComp) return null;
  const sessions = await getUpcomingSessions(activeComp.id, fighterId);
  return competitionPromptBlock(pressureFor(activeComp), {
    sessions,
    weightCut: weightCutFor(activeComp),
  });
}

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

// Time-aware re-entry tiers (gap since the athlete's last message in the convo):
//   < 2h         → silent resume (no welcome fires)
//   2h .. 24h    → returning same day
//   24h .. 72h   → new day / mission refresh
//   > 72h        → lapsed / recommit
const ENTRY_STALE_MS = 2 * 60 * 60 * 1000;
const NEW_DAY_MS = 24 * 60 * 60 * 1000;
const LAPSED_MS = 72 * 60 * 60 * 1000;

const WELCOME_LOCK_NAMESPACE = 7411;

const CLAUDE_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

router.post("/coach/welcome", async (req, res) => {
  const fighter = await getUserFighter(req);
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

    const gapMs = last ? Date.now() - new Date(last.createdAt).getTime() : Infinity;
    const isStale = gapMs >= ENTRY_STALE_MS;
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

    // First contact is keyed on real conversation history, not fact count — a
    // returning athlete with sparse facts has still been here before, and the
    // tier branches below handle sparse-model wording honestly.
    const noHistory = !last;
    const gapDays = Number.isFinite(gapMs) ? Math.max(1, Math.floor(gapMs / NEW_DAY_MS)) : 0;

    let entryInstruction: string;
    if (noHistory) {
      entryInstruction = `\n\n[ENTRY BRIEFING MODE — FIRST CONTACT]\nThis is the very first time this athlete has entered the frame. You have almost nothing on them yet — only their onboarding. Do NOT pretend to read them deeply; that would be a lie and they'll feel it.\n- Open with their name in the first 1-3 words.\n- Land ONE sharp, genuinely funny line that reads their archetype from the thin signal you DO have (their art, level, stated goal, their spirit animal "${fighter.spiritAnimal || "unassigned"}"${fighter.spiritAnimalTagline ? ` — ${fighter.spiritAnimalTagline}` : ""}). Dry, earned, specific to them — the kind of read that makes someone laugh because it's a little too accurate. Never generic, never mean, never a pun.\n- Then state plainly that you don't know them yet and the only way you sharpen is reps — every roll they bring you, every honest answer, tightens the read.\n- Offer 2 or 3 concrete first moves (e.g. "tell me your last roll", "name the position you hate", "calibrate where your game actually is").\nVoice: direct, structural, a blade with a sense of humor. No therapist energy. No questions stacked at the end — open the floor. End clean.`;
    } else if (gapMs > LAPSED_MS) {
      entryInstruction = `\n\n[ENTRY BRIEFING MODE — LAPSED ${gapDays} DAYS]\nThe athlete has been away from the frame for ${gapDays} days. This is a recommit moment — handle it with weight, not guilt.\n- Open with their name. Name the gap plainly and ACCURATELY: it has been ${gapDays} days since they were last in the frame. CRITICAL: this is time since their last contact HERE — you do NOT know whether they trained, rested, or were injured. Never say "you haven't trained in ${gapDays} days." Say it like a corner that noticed they've been away, then ask.\n- No shaming, no motivational-poster energy, no "where have you been."\n- Offer a clean recommit: pick the thread back up on their last recorded focus (name it from the model if you can see it), OR reset goals if the layoff may have changed things. One question max, then open the floor.\nVoice: grounded, direct, a little heavier. End clean.`;
    } else if (gapMs >= NEW_DAY_MS) {
      entryInstruction = `\n\n[ENTRY BRIEFING MODE — NEW DAY]\nA new training day — the athlete hasn't been in the frame since yesterday or before. Short opening (4-6 sentences, no preamble).\n- Open with their name. Mark the reset honestly ("new day").\n- Reflect ONE specific signal from their recorded model so they feel tracked, then point forward to today's work — the mission refresh.\n- Offer 2 or 3 concrete entry points (debrief the last session, sharpen their named weakness, regulate, build today's drill).\n- Do NOT fabricate metrics, training logs, or "progress since." Only reference what is actually in the model.\nVoice: clean, forward, structural. End cleanly without sign-off.`;
    } else {
      entryInstruction = `\n\n[ENTRY BRIEFING MODE — RETURNING SAME DAY]\nThe athlete stepped away and came back within the day. Short re-entry (3-6 sentences, no preamble).\n- Open with their name, picking the thread straight back up (continuity, not a fresh greeting).\n- Name their last recorded focus from the model (the most recent weakness/goal/pattern you can see) so the thread is unbroken. If you genuinely can't see a last focus, say you're picking up where you left off and ask what they want to move.\n- Offer 2 concrete continuations of that focus.\n- Do NOT fabricate "progress since" — you don't track training logs. Reference only what's actually in the model.\nVoice: direct, continuous, no preamble. End clean.`;
    }

    const compBlock = await buildCompBlock(fighter.id);

    const dynamicText =
      buildDynamicContext(fighter, facts, calibrations, deepNodes, compBlock) +
      "\n\n" +
      vocabularyPromptBlock(computeVocabulary(facts)) +
      entryInstruction;

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

  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter — complete onboarding first" });
    return;
  }

  // Server-enforced free-tier gate: 20 coaching messages per UTC day.
  // Checked BEFORE the SSE stream starts so the client gets clean JSON.
  const entitlement = await getEntitlementForClerkUser(req.clerkUserId as string);
  if (entitlement.plan === "free") {
    const used = await countUserMessagesToday(fighter.id);
    if (used >= FREE_DAILY_COACHING_LIMIT) {
      res.status(402).json({
        error: `Daily coaching limit reached (${FREE_DAILY_COACHING_LIMIT} messages on the free tier). FRAME+ removes the cap.`,
        code: "FRAME_PLUS_REQUIRED",
        feature: "coaching",
        limit: FREE_DAILY_COACHING_LIMIT,
      });
      return;
    }
  }

  const conversation = await getOrCreateActiveConversation(fighter.id);

  // Reuse an immediately-preceding identical, unanswered user message instead of
  // inserting a duplicate. This makes a one-tap retry of a turn that failed
  // mid-stream idempotent: the orphaned user row left by the failed attempt is
  // reused rather than piling up duplicate history. Plain-text turns only —
  // attachment turns always insert fresh so message/attachment linkage stays clean.
  let userMsg: typeof messagesTable.$inferSelect | undefined;
  if (attachmentIds.length === 0) {
    const [recent] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversation.id))
      .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id))
      .limit(1);
    if (recent && recent.role === "user" && recent.content === userContent) {
      userMsg = recent;
    }
  }
  if (!userMsg) {
    [userMsg] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        role: "user",
        content: userContent,
      })
      .returning();
  }

  if (attachmentIds.length > 0 && userMsg) {
    // Authorize: only attachments belonging to THIS conversation may be linked.
    // The attachment-upload endpoint already verifies the conversation is owned
    // by req.clerkUserId, so a conversationId match is sufficient tenant scoping here.
    const owned = await db
      .select({ id: attachmentsTable.id })
      .from(attachmentsTable)
      .where(
        and(
          inArray(attachmentsTable.id, attachmentIds),
          eq(attachmentsTable.conversationId, conversation.id),
        ),
      );
    if (owned.length !== attachmentIds.length) {
      res.status(403).json({ error: "attachment not in conversation" });
      return;
    }
    await db
      .update(attachmentsTable)
      .set({ messageId: userMsg.id })
      .where(
        and(
          inArray(
            attachmentsTable.id,
            owned.map((o) => o.id),
          ),
          eq(attachmentsTable.conversationId, conversation.id),
        ),
      );
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
  // Top-6 score-sorted nodes: the deepest depth lives in the highest-scoring
  // matches, so trimming the two lowest-scored shrinks the uncached dynamic
  // block (faster first token) without dropping what the coach actually draws on.
  const deepNodes = selectRelevantNodes(retrievalQuery, 6);
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

  const compBlock = await buildCompBlock(fighter.id);

  const vocab = computeVocabulary(facts);
  // Persist the high-water mark so the profile can show real growth and the tier
  // never regresses once earned.
  if (vocab.tier > fighter.vocabularyLevel) {
    db.update(fightersTable)
      .set({ vocabularyLevel: vocab.tier })
      .where(eq(fightersTable.id, fighter.id))
      .catch((err) => req.log.error({ err }, "vocab level persist failed"));
  }

  try {
    const dynamicText =
      buildDynamicContext(fighter, facts, calibrations, deepNodes, compBlock) +
      "\n\n" +
      vocabularyPromptBlock(vocab);

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

      // Confirm prompt caching is actually being hit. A warm static block shows
      // cache_read_input_tokens ~= the static prompt size and near-zero
      // cache_creation; a cold/expired cache shows the inverse (slow first token).
      try {
        const finalMsg = await stream.finalMessage();
        req.log.info(
          {
            cacheRead: finalMsg.usage.cache_read_input_tokens,
            cacheCreate: finalMsg.usage.cache_creation_input_tokens,
            inputTokens: finalMsg.usage.input_tokens,
            outputTokens: finalMsg.usage.output_tokens,
          },
          "coach stream usage (claude)",
        );
      } catch {
        // usage logging is best-effort; never let it break the turn
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
