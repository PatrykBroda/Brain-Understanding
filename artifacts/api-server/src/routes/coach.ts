import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import {
  db,
  messagesTable,
  conversationsTable,
  calibrationsTable,
  attachmentsTable,
  fightersTable,
  type Attachment,
} from "@workspace/db";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { promises as fs } from "node:fs";
import path from "node:path";
import { COACH_SYSTEM_PROMPT_STATIC, buildDynamicContext } from "../lib/synochi";
import { getOrCreateActiveConversation } from "./conversation";
import { getActiveFacts } from "../lib/factsService";
import { extractMemory } from "../lib/memoryExtractor";
import { UPLOADS_DIR } from "../lib/uploads";
import { prepareImageForModel } from "../lib/modelImage";
import { classifyCoachStreamError } from "../lib/coachStreamError";
import { selectRelevantNodes, buildRetrievalQuery, budgetNodes } from "../lib/vaultRetrieval";
import { budgetEnabled, estimateTokens, trimHistory } from "../lib/promptBudget";
import {
  describeProviderError,
  FirstTokenTimeoutError,
  firstTokenGuard,
  isRetryableProviderError,
  runWithRetry,
  type FirstTokenGuard,
} from "../lib/aiRetry";
import {
  ChatTurn,
  ChatTurnRegistry,
  onClientDisconnect,
  openSse,
  retryOnce,
  sanitizeClientMessageId,
  Throttle,
  type SseChannel,
  type TurnEvent,
} from "../lib/coachChatStream";
import { buildFirstReplyBlock, buildTodayBlock, loadCoachDayContext } from "../lib/coachContext";
import { effectiveTimeZone, rememberTimezone, todayFor } from "../middlewares/timezone";
import { localDayBounds } from "../lib/localTime";
import { openai, OPENAI_COACH_MODEL } from "../lib/openaiClient";
import {
  getActiveCompetition,
  pressureFor,
  competitionPromptBlock,
  weightCutFor,
} from "../lib/competitionService";
import { getUpcomingSessions } from "../lib/trainingSessionService";
import { computeVocabulary, vocabularyPromptBlock } from "../lib/vocabulary";
import { getEntitlementForUserId } from "../lib/subscriptionService";
import { countUserMessagesToday, FREE_DAILY_COACHING_LIMIT } from "../lib/featureGates";
import {
  AI_PROVIDER_MAX_RETRIES,
  hasAiConsentForUser,
  requireAiConsent,
} from "../lib/aiConsent";

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

const client = new Anthropic({ baseURL, apiKey, maxRetries: AI_PROVIDER_MAX_RETRIES });

const CLAUDE_COACH_MODEL = "claude-sonnet-4-6";
type Provider = "claude" | "openai";
const providerConfigured = (p: Provider): boolean =>
  p === "claude"
    ? Boolean(process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] && process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"])
    : Boolean(process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] && process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]);
// Up to three tries on the athlete's chosen provider, then up to two on the other
// one. All of them (backoff waits included) share ONE deadline counted from the
// first provider call, so a reply either starts within COACH_FIRST_TOKEN_DEADLINE_MS
// or the athlete gets an error event, well before the apps' own 60s first-reply
// watchdog fires. Each attempt also has its own first-token window, so one hung
// call can't eat the whole budget. A cold prompt cache has been seen at ~24s to
// first token, hence the generous per-attempt window.
const PROVIDER_ATTEMPTS = 3;
const FALLBACK_ATTEMPTS = 2;
const COACH_FIRST_TOKEN_DEADLINE_MS = 45_000;
const ATTEMPT_FIRST_TOKEN_MS = 30_000;
// Don't start a retry or the fallback with less than this left before the deadline.
const MIN_ATTEMPT_MS = 5_000;

// The static system block (the whole vault) is identical for every athlete, so
// its prompt cache is shared. A 1-hour TTL keeps it warm across idle gaps that
// the default 5 minutes doesn't. COACH_CACHE_TTL=5m opts out; if the provider
// rejects the ttl field we drop it for the rest of the process and retry once.
let staticCacheTtl: "1h" | undefined = process.env["COACH_CACHE_TTL"] === "5m" ? undefined : "1h";
let lastStaticCacheTouchAt = 0;

function staticSystemBlock(): Anthropic.TextBlockParam {
  return {
    type: "text",
    text: COACH_SYSTEM_PROMPT_STATIC,
    cache_control: staticCacheTtl ? { type: "ephemeral", ttl: staticCacheTtl } : { type: "ephemeral" },
  };
}

function isCacheTtlRejection(err: unknown): boolean {
  const { status } = describeProviderError(err);
  const message = err instanceof Error ? err.message : String(err ?? "");
  return status === 400 && /ttl|cache_control/i.test(message);
}

/** In-flight coach turns in this process, keyed by user + client message id. */
const chatTurns = new ChatTurnRegistry();

const isTerminalEvent = (e: TurnEvent): boolean => e["done"] === true || typeof e["error"] === "string";

const WELCOME_LOCK_NAMESPACE = 7411;

// FRAME sends exactly ONE proactive message, ever: this fixed welcome, right
// after onboarding, before the athlete's first word. After that FRAME is
// completely passive — it never initiates. Deterministic copy (product-owner
// supplied), no AI call: the model has nothing real to say about an athlete
// it hasn't met, and pretending otherwise would violate the honesty pillar.
const WELCOME_MESSAGE = [
  "Welcome.",
  "I'm still learning your game.",
  "Right now my job isn't to tell you who you are—it's to observe, ask the right questions and build an accurate understanding over time.",
  "Every conversation, session reflection and video analysis helps me coach you more precisely.",
  "Let's begin.",
].join("\n\n");

/** True if this fighter has ANY message in ANY of their conversations —
 *  spans conversation resets so a reset can never re-trigger first contact.
 *  Accepts an optional executor so the in-lock recheck can run on the same
 *  transaction/connection that holds the advisory lock. */
async function fighterHasAnyMessage(
  fighterId: number,
  executor: Pick<typeof db, "select"> = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .innerJoin(
      conversationsTable,
      eq(messagesTable.conversationId, conversationsTable.id),
    )
    .where(eq(conversationsTable.fighterId, fighterId))
    .limit(1);
  return row !== undefined;
}

const CLAUDE_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

router.post("/coach/welcome", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  // Cheap pre-lock check: returning athletes (the overwhelming majority of
  // calls) exit here without ever taking the lock.
  if (await fighterHasAnyMessage(fighter.id)) {
    res.json({ message: null, reason: "not first contact" });
    return;
  }

  const conversation = await getOrCreateActiveConversation(fighter.id);

  // Lock keyed to the FIGHTER (not the conversation — a reset changes the
  // conversation id and would defeat the lock). Transaction-scoped
  // (pg_try_advisory_xact_lock): lock, recheck and insert all run on the
  // transaction's single connection, and the lock auto-releases on
  // commit/rollback. A session lock via the pool could be "unlocked" on a
  // DIFFERENT pooled connection and silently leak if the insert threw.
  try {
    const outcome = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(${WELCOME_LOCK_NAMESPACE}::int, ${fighter.id}::int) AS got`,
      );
      const got =
        (lockResult.rows[0] as { got: boolean } | undefined)?.got === true;
      if (!got) {
        return { message: null, reason: "in-progress" } as const;
      }

      // Re-check inside the lock: a concurrent request may have inserted the
      // welcome (or the athlete's first message) between check and lock.
      if (await fighterHasAnyMessage(fighter.id, tx)) {
        return { message: null, reason: "not first contact" } as const;
      }

      const [msg] = await tx
        .insert(messagesTable)
        .values({
          conversationId: conversation.id,
          role: "assistant",
          content: WELCOME_MESSAGE,
        })
        .returning();

      return { message: msg } as const;
    });

    res.json(outcome);
  } catch (err) {
    req.log.error({ err }, "welcome failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "welcome failed" });
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
        const img = await prepareImageForModel(buf, a.mimeType);
        if (!img) throw new Error("image too large for model");
        parts.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data.toString("base64")}` },
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
        const img = await prepareImageForModel(buf, a.mimeType);
        if (!img) throw new Error("image too large for model");
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: img.data.toString("base64"),
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

/** Streams an in-flight turn to a second request for the same send (a retry). */
function attachToTurn(res: import("express").Response, turn: ChatTurn): void {
  const channel = openSse(res);
  const unsubscribe = turn.subscribe(
    (e) => {
      channel.send(e);
      if (isTerminalEvent(e)) channel.end();
    },
    { replay: true },
  );
  onClientDisconnect(res, unsubscribe);
}

router.post("/coach/chat", async (req, res) => {
  const body = req.body as { content?: unknown; attachmentIds?: unknown; clientMessageId?: unknown };
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
  // Optional idempotency key generated by the app for each send; a retry reuses it.
  const clientMessageId = sanitizeClientMessageId(body.clientMessageId);

  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  // Check before creating a conversation, persisting the user's message, or
  // constructing provider payloads. Consent covers both Claude and OpenAI.
  if (!(await requireAiConsent(req, res))) return;

  // The same send is still generating in this process (the app retried, or the
  // connection dropped and came back): listen to that turn, never start a second.
  const turnKey = clientMessageId ? ChatTurnRegistry.key(req.userId as string, clientMessageId) : null;
  const running = turnKey ? chatTurns.get(turnKey) : undefined;
  if (running) {
    req.log.info({ clientMessageId }, "coach chat: attaching to in-flight turn");
    attachToTurn(res, running);
    return;
  }
  // Registered synchronously (no await since the lookup) so racing requests can't both start.
  const turn = turnKey ? chatTurns.start(turnKey) : new ChatTurn();
  let channel: SseChannel | null = null;
  const unsubscribe = turn.subscribe((e) => {
    channel?.send(e);
    if (isTerminalEvent(e)) channel?.end();
  });
  // The athlete's request went away: once nobody is listening, the turn aborts
  // the provider call (any text that already arrived is still saved below).
  const unbindDisconnect = onClientDisconnect(res, unsubscribe);
  const bail = (status: number, json: Record<string, unknown>) => {
    res.status(status).json(json);
    turn.finish({ code: typeof json["code"] === "string" ? json["code"] : "AI_ERROR", error: String(json["error"] ?? "") });
  };

  try {
    const conversation = await getOrCreateActiveConversation(fighter.id);

    let userMsg: typeof messagesTable.$inferSelect | undefined;
    // Assistant rows from a dropped attempt at this same send, to be replaced by this reply.
    let stalePartialIds: number[] = [];

    if (clientMessageId) {
      const [existing] = await db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, conversation.id),
            eq(messagesTable.role, "user"),
            eq(messagesTable.clientMessageId, clientMessageId),
          ),
        )
        .orderBy(desc(messagesTable.id))
        .limit(1);
      if (existing) {
        const [reply] = await db
          .select()
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.conversationId, conversation.id),
              eq(messagesTable.role, "assistant"),
              eq(messagesTable.clientMessageId, clientMessageId),
            ),
          )
          .orderBy(desc(messagesTable.id))
          .limit(1);
        if (reply) {
          // Already answered: hand back the saved reply, don't generate again.
          req.log.info({ clientMessageId, messageId: reply.id }, "coach chat: replaying saved reply");
          channel = openSse(res);
          turn.content(reply.content);
          turn.finish({ done: true, replayed: true });
          return;
        }
        // Not answered. Reuse the row if nothing but partial replies came after it.
        const newer = await db
          .select({ id: messagesTable.id, role: messagesTable.role, clientMessageId: messagesTable.clientMessageId })
          .from(messagesTable)
          .where(and(eq(messagesTable.conversationId, conversation.id), gt(messagesTable.id, existing.id)));
        if (newer.every((m) => m.role === "assistant" && m.clientMessageId == null)) {
          userMsg = existing;
          stalePartialIds = newer.map((m) => m.id);
        }
      }
    }

    if (!userMsg) {
      // Server-enforced free-tier gate: 5 coaching messages per day (the athlete's own
      // local day). Checked BEFORE the SSE stream starts so the client gets clean JSON.
      // A retry of a send that is already stored is not a new message and skips it.
      await rememberTimezone(req, fighter);
      const entitlement = await getEntitlementForUserId(req.userId as string);
      if (entitlement.plan === "free") {
        const dayStart = localDayBounds(todayFor(req, fighter.timezone), effectiveTimeZone(req, fighter.timezone)).start;
        const used = await countUserMessagesToday(fighter.id, dayStart);
        if (used >= FREE_DAILY_COACHING_LIMIT) {
          bail(402, {
            error: `Daily coaching limit reached (${FREE_DAILY_COACHING_LIMIT} messages on the free tier). FRAME+ removes the cap.`,
            code: "FRAME_PLUS_REQUIRED",
            feature: "coaching",
            limit: FREE_DAILY_COACHING_LIMIT,
          });
          return;
        }
      }

      // Older apps send no clientMessageId. For them, reuse an immediately-preceding
      // identical, unanswered user message instead of inserting a duplicate, so a
      // one-tap retry of a failed turn doesn't pile up history. Plain-text turns only:
      // attachment turns always insert fresh so message/attachment linkage stays clean.
      if (!clientMessageId && attachmentIds.length === 0) {
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
    }
    if (!userMsg) {
      [userMsg] = await db
        .insert(messagesTable)
        .values({
          conversationId: conversation.id,
          role: "user",
          content: userContent,
          clientMessageId,
        })
        .returning();
    }

    if (attachmentIds.length > 0 && userMsg) {
      // Authorize: only attachments belonging to THIS conversation may be linked.
      // The attachment-upload endpoint already verifies the conversation is owned
      // by req.userId, so a conversationId match is sufficient tenant scoping here.
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
        bail(403, { error: "attachment not in conversation" });
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

    const storedHistory = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversation.id))
      .orderBy(asc(messagesTable.createdAt));
    // A partial reply left by a dropped attempt at THIS send is replaced, not built on.
    const fullHistory = storedHistory.filter((m) => !stalePartialIds.includes(m.id));
    // Cap what earlier conversation rides along on every turn (newest always kept).
    const history = budgetEnabled() ? trimHistory(fullHistory) : fullHistory;

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
    // (and the shelved tails of the always-loaded layers) and returns full-text for the
    // top matches to inline in the dynamic system block.
    const recentForRetrieval = fullHistory.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    const profileText = [fighter.goals, fighter.weaknesses].filter(Boolean).join(" ");
    const retrievalQuery = `${profileText}\n${buildRetrievalQuery(recentForRetrieval, userContent)}`;
    // Top-6 score-sorted nodes, then capped per note and per turn so one long note can
    // never dominate the prompt.
    const scoredNodes = selectRelevantNodes(retrievalQuery, 6);
    const deepNodes = budgetEnabled() ? budgetNodes(scoredNodes) : scoredNodes;
    req.log.info(
      {
        deepNodeCount: deepNodes.length,
        deepTitles: deepNodes.map((n) => `${n.folder}/${n.title}(${n.score})`),
      },
      "vault retrieval",
    );
    // Headers go out now; from here a heartbeat keeps the connection alive while
    // the provider prepares its first token.
    channel = openSse(res);

    let assembled = "";
    const emit = (delta: string) => {
      assembled += delta;
      turn.content(delta);
    };


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

    // Today's date, the readiness check-in and the State/Focus FRAME holds. A failure
    // here must never cost the athlete their reply, so it degrades to "no block".
    let todayBlock: string | null = null;
    let todayLine: string | undefined;
    try {
      const dayCtx = await loadCoachDayContext(fighter, {
        now: req.frameNow ?? new Date(),
        tz: effectiveTimeZone(req, fighter.timezone),
        today: todayFor(req, fighter.timezone),
      });
      todayBlock = buildTodayBlock(dayCtx);
      const ct = dayCtx.view.readiness.today;
      todayLine = `Today (athlete's local date): ${dayCtx.today}. Readiness check-in today: ${
        ct ? `sleep ${ct.checkin.sleep}, energy ${ct.checkin.energy}, soreness ${100 - ct.checkin.soreness}/100 sore, stress ${100 - ct.checkin.stress}/100 stressed` : "none logged"
      }.`;
    } catch (err) {
      req.log.error({ err }, "coach day context failed; replying without it");
    }
    const userTurns = fullHistory.filter((m) => m.role === "user").length;
    const firstReplyBlock = userTurns === 1 ? buildFirstReplyBlock(fighter) : null;

    const dynamicText =
      buildDynamicContext(fighter, facts, calibrations, deepNodes, compBlock, { todayBlock, firstReplyBlock }) +
      "\n\n" +
      vocabularyPromptBlock(vocab);

    const historyChars = history.reduce((n, m) => n + m.content.length, 0);
    const sizes = {
      staticTokens: estimateTokens(COACH_SYSTEM_PROMPT_STATIC.length),
      dynamicTokens: estimateTokens(dynamicText.length),
      historyTokens: estimateTokens(historyChars),
      historyMessages: history.length,
      historyTrimmed: fullHistory.length - history.length,
    };
    const estInputTokens = sizes.staticTokens + sizes.dynamicTokens + sizes.historyTokens;
    req.log.info({ ...sizes, estInputTokens, budget: budgetEnabled() }, "coach prompt size (estimated tokens)");
    const primary: Provider = conversation.aiProvider === "openai" ? "openai" : "claude";
    const other: Provider = primary === "openai" ? "claude" : "openai";
    const startedAt = Date.now();
    const deadlineAt = startedAt + COACH_FIRST_TOKEN_DEADLINE_MS;
    let usedProvider: Provider = primary;
    let firstTokenAt: number | null = null;

    // Consent can be withdrawn between attempts, so it is re-checked before every one.
    const checkConsent = async () => {
      if (!(await hasAiConsentForUser(req.userId as string))) {
        const error = new Error("AI consent is required before using this feature.");
        (error as Error & { code: string }).code = "AI_CONSENT_REQUIRED";
        throw error;
      }
    };

    const streamOpenAI = async (guard: FirstTokenGuard) => {
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
      const stream = await openai.chat.completions.create(
        {
          model: OPENAI_COACH_MODEL,
          max_completion_tokens: 8192,
          messages: openaiMessages,
          stream: true,
        },
        { signal: guard.signal },
      );
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          guard.gotToken();
          emit(delta);
        }
      }
    };

    const streamClaude = async (guard: FirstTokenGuard) => {
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
      const stream = client.messages.stream(
        {
          model: CLAUDE_COACH_MODEL,
          max_tokens: 8192,
          system: [staticSystemBlock(), { type: "text", text: dynamicText }],
          messages: claudeMessages,
        },
        { signal: guard.signal },
      );

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          guard.gotToken();
          emit(event.delta.text);
        }
      }
      lastStaticCacheTouchAt = Date.now();

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
            cacheTtl: staticCacheTtl ?? "5m",
            firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null,
          },
          "coach stream usage (claude)",
        );
      } catch {
        // usage logging is best-effort; never let it break the turn
      }
    };

    // One provider call, bounded by its own first-token window and the shared deadline.
    const attemptOnce = async (provider: Provider) => {
      const windowMs = Math.max(1, Math.min(ATTEMPT_FIRST_TOKEN_MS, deadlineAt - Date.now()));
      const guard = firstTokenGuard(turn.signal, windowMs);
      const onToken = guard.gotToken;
      const tracked: FirstTokenGuard = {
        signal: guard.signal,
        gotToken: () => {
          if (firstTokenAt === null) firstTokenAt = Date.now();
          onToken();
        },
        get timedOut() {
          return guard.timedOut;
        },
        dispose: guard.dispose,
      };
      try {
        if (provider === "openai") await streamOpenAI(tracked);
        else await streamClaude(tracked);
      } catch (err) {
        if (guard.timedOut && assembled.length === 0) throw new FirstTokenTimeoutError(windowMs);
        throw err;
      } finally {
        guard.dispose();
      }
    };

    const run = (provider: Provider, maxAttempts: number) =>
      runWithRetry(
        async (attempt) => {
          usedProvider = provider;
          const t0 = Date.now();
          try {
            try {
              await attemptOnce(provider);
            } catch (err) {
              // The proxy/model refused the 1h cache TTL: drop it for good and go again.
              if (provider === "claude" && staticCacheTtl && assembled.length === 0 && isCacheTtlRejection(err)) {
                req.log.warn({ err }, "provider rejected 1h prompt-cache TTL; falling back to 5m");
                staticCacheTtl = undefined;
                await attemptOnce(provider);
              } else {
                throw err;
              }
            }
          } catch (err) {
            const info = describeProviderError(err);
            req.log.warn(
              {
                provider,
                model: provider === "openai" ? OPENAI_COACH_MODEL : CLAUDE_COACH_MODEL,
                attempt: attempt + 1,
                status: info.status,
                kind: info.kind,
                retryAfterMs: info.retryAfterMs,
                providerRequestId: info.requestId,
                estInputTokens,
                ms: Date.now() - t0,
                streamedChars: assembled.length,
              },
              "coach provider call failed",
            );
            throw err;
          }
        },
        {
          maxAttempts,
          deadlineAt,
          minAttemptMs: MIN_ATTEMPT_MS,
          signal: turn.signal,
          beforeAttempt: checkConsent,
          // Never retry once text has reached the athlete: that would repeat the reply.
          canRetry: () => assembled.length === 0 && !turn.signal.aborted,
          onRetry: ({ attempt, waitMs, error }) =>
            req.log.info({ provider, attempt: attempt + 1, waitMs, kind: error.kind }, "retrying coach provider call"),
        },
      );

    try {
      if (turn.signal.aborted) throw turn.signal.reason ?? new Error("client disconnected");
      try {
        await run(primary, PROVIDER_ATTEMPTS);
      } catch (err) {
        // The athlete's chosen provider is busy, down or too slow, and nothing has been
        // shown yet: answer from the other one if the shared deadline still allows it.
        // Their setting is left alone.
        const kind = describeProviderError(err).kind;
        const worthFallback = isRetryableProviderError(err) || kind === "timeout";
        if (
          assembled.length === 0 &&
          !turn.signal.aborted &&
          worthFallback &&
          providerConfigured(other) &&
          deadlineAt - Date.now() >= MIN_ATTEMPT_MS
        ) {
          req.log.warn({ from: primary, to: other, afterMs: Date.now() - startedAt }, "coach falling back to the other provider");
          await run(other, FALLBACK_ATTEMPTS);
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (turn.signal.aborted) {
        req.log.info({ streamedChars: assembled.length, afterMs: Date.now() - startedAt }, "coach client disconnected; provider call aborted");
      } else {
        req.log.error({ err }, "Coach stream failed");
      }
      // Keep whatever did arrive so history isn't missing it. It is saved WITHOUT the
      // client message id, which marks it as not-complete: a retry of this send
      // generates again and the new reply replaces it.
      if (assembled.length > 0) {
        try {
          await retryOnce(() =>
            db.insert(messagesTable).values({
              conversationId: conversation.id,
              role: "assistant",
              content: assembled,
            }),
          );
        } catch (insertErr) {
          req.log.error({ err: insertErr }, "persisting partial coach reply failed");
        }
      }
      turn.finish(classifyCoachStreamError(err));
      return;
    }

    // The reply is complete: tell the app first, then save. A slow or failed insert
    // must never turn a reply the athlete already has into an error.
    turn.finish({ done: true, provider: usedProvider, fallback: usedProvider !== primary });

    try {
      await retryOnce(() =>
        db.insert(messagesTable).values({
          conversationId: conversation.id,
          role: "assistant",
          content: assembled,
          clientMessageId,
        }),
      );
      if (stalePartialIds.length > 0) {
        await db
          .delete(messagesTable)
          .where(and(eq(messagesTable.conversationId, conversation.id), inArray(messagesTable.id, stalePartialIds)))
          .catch((err) => req.log.error({ err }, "removing superseded partial reply failed"));
      }
    } catch (err) {
      req.log.error({ err, streamedChars: assembled.length }, "persisting coach reply failed after it was delivered");
    }

    if (assembled.trim().length > 0) {
      extractMemory({
        fighter,
        userText: userContent,
        assistantText: assembled,
        log: req.log,
        todayLine,
      }).catch((err) => req.log.error({ err }, "extractMemory rejected"));
    }
  } catch (err) {
    req.log.error({ err }, "coach chat failed");
    if (!turn.finished) {
      if (!channel && !res.headersSent) bail(500, { error: "FRAME couldn't reply to that. Try again.", code: "AI_ERROR" });
      else turn.finish(classifyCoachStreamError(err));
    }
  } finally {
    unbindDisconnect();
    if (!turn.finished) {
      // Every path should have finished the turn; make sure no listener waits forever.
      if (!channel && !res.headersSent) bail(500, { error: "FRAME couldn't reply to that. Try again.", code: "AI_ERROR" });
      else turn.finish(classifyCoachStreamError(new Error("turn ended without a result")));
    }
    if (turnKey) chatTurns.release(turnKey, turn);
  }
});

// Cache warm-up. The static system block (the whole vault, ~85K tokens) is the same
// for every athlete; when its prompt cache has expired the next reply waits on a full
// cache write (tens of seconds to first token). The app calls this when Chat opens so
// that write happens while the athlete is still typing. Rate-limited per user, and
// skipped when the shared cache was touched recently anyway.
const warmThrottle = new Throttle(4 * 60_000);
const STATIC_CACHE_FRESH_MS = () => (staticCacheTtl === "1h" ? 30 * 60_000 : 3 * 60_000);

router.post("/coach/warm", async (req, res) => {
  const userId = req.userId as string;
  if (!warmThrottle.take(userId)) {
    res.status(429).json({ warmed: false, reason: "rate_limited" });
    return;
  }
  if (Date.now() - lastStaticCacheTouchAt < STATIC_CACHE_FRESH_MS()) {
    res.json({ warmed: false, reason: "fresh" });
    return;
  }
  if (!(await requireAiConsent(req, res))) return;
  lastStaticCacheTouchAt = Date.now();
  res.status(202).json({ warmed: true });
  const t0 = Date.now();
  client.messages
    .create({
      model: CLAUDE_COACH_MODEL,
      max_tokens: 1,
      system: [staticSystemBlock()],
      messages: [{ role: "user", content: "." }],
    })
    .then((msg) =>
      req.log.info(
        {
          ms: Date.now() - t0,
          cacheRead: msg.usage.cache_read_input_tokens,
          cacheCreate: msg.usage.cache_creation_input_tokens,
          cacheTtl: staticCacheTtl ?? "5m",
        },
        "coach cache warm-up",
      ),
    )
    .catch((err) => {
      lastStaticCacheTouchAt = 0;
      if (staticCacheTtl && isCacheTtlRejection(err)) {
        req.log.warn({ err }, "provider rejected 1h prompt-cache TTL on warm-up; falling back to 5m");
        staticCacheTtl = undefined;
        return;
      }
      req.log.warn({ err, ms: Date.now() - t0 }, "coach cache warm-up failed");
    });
});

export default router;
