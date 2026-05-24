import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { COACH_SYSTEM_PROMPT } from "../lib/synochi";

const router: IRouter = Router();

const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];

if (!baseURL || !apiKey) {
  throw new Error(
    "AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY must be set",
  );
}

const client = new Anthropic({ baseURL, apiKey });

type ChatMessage = { role: "user" | "assistant"; content: string };

function isValidMessages(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const m of value) {
    if (!m || typeof m !== "object") return false;
    const mm = m as Record<string, unknown>;
    if (mm["role"] !== "user" && mm["role"] !== "assistant") return false;
    if (typeof mm["content"] !== "string") return false;
  }
  return true;
}

router.post("/coach/chat", async (req, res) => {
  const messages = (req.body as { messages?: unknown })?.messages;

  if (!isValidMessages(messages)) {
    res.status(400).json({ error: "messages must be a non-empty array of {role, content}" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: [
        {
          type: "text",
          text: COACH_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        send({ content: event.delta.text });
      }
    }

    send({ done: true });
    res.end();
  } catch (err) {
    req.log.error({ err }, "Coach stream failed");
    send({ error: err instanceof Error ? err.message : "stream failed" });
    res.end();
  }
});

export default router;
