/**
 * A local stand-in for the two AI providers (Anthropic Messages + OpenAI Chat
 * Completions), speaking their real streaming wire formats so the real SDKs run
 * against it. It records every request (size and text) and can be told to
 * misbehave per provider: rate-limit, overload, or reject requests above a size
 * (how a tokens-per-minute limit looks from outside).
 *
 * NOT a model: replies are canned. Use it to test plumbing, never quality.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export type Behaviour =
  | { mode: "ok"; reply?: string }
  | { mode: "status"; status: number; retryAfter?: number }
  | { mode: "status-once"; status: number; reply?: string }
  | { mode: "too-big"; maxChars: number; reply?: string };

export interface Recorded {
  provider: "anthropic" | "openai";
  chars: number;
  system: string;
  messages: { role: string; content: unknown }[];
  status: number;
  /** true for the coach's streamed turns (the memory writer and planner are not streamed). */
  stream: boolean;
  /** Anthropic only: cache_control of the first system block, and max_tokens. */
  cacheControl?: unknown;
  maxTokens?: number;
  /** Set when the caller hung up before this streamed reply was fully written. */
  abortedEarly?: boolean;
}

export interface MockProviders {
  url: string;
  anthropicBase: string;
  openaiBase: string;
  anthropic: Behaviour;
  openai: Behaviour;
  requests: Recorded[];
  /** Planner tool-use response for non-streaming Anthropic calls that force a tool. */
  anthropicTool?: (toolName: string) => unknown;
  /** Delay (ms) before the first byte of every streamed reply. */
  firstByteDelayMs: number;
  /** Delay (ms) between streamed words (to test a client hanging up mid-reply). */
  wordDelayMs: number;
  reset(): void;
  close(): Promise<void>;
}

function textOfSystem(system: unknown): string {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return system.map((b) => (typeof b === "object" && b ? (b as { text?: string }).text ?? "" : "")).join("\n");
  return "";
}

export async function startMockProviders(): Promise<MockProviders> {
  const state: MockProviders = {
    url: "",
    anthropicBase: "",
    openaiBase: "",
    anthropic: { mode: "ok" },
    openai: { mode: "ok" },
    requests: [],
    firstByteDelayMs: 0,
    wordDelayMs: 0,
    reset() {
      onceUsed.clear();
      state.anthropic = { mode: "ok" };
      state.openai = { mode: "ok" };
      state.requests = [];
      state.firstByteDelayMs = 0;
      state.wordDelayMs = 0;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
  const onceUsed = new Set<string>();

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: any = {};
      try {
        body = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      const isOpenAI = req.url?.startsWith("/openai/");
      const provider = isOpenAI ? "openai" : "anthropic";
      const behaviour = isOpenAI ? state.openai : state.anthropic;

      const rec: Recorded = {
        provider,
        chars: raw.length,
        system: isOpenAI
          ? (body.messages ?? []).filter((m: any) => m.role === "system").map((m: any) => m.content).join("\n")
          : textOfSystem(body.system),
        messages: (body.messages ?? []).filter((m: any) => m.role !== "system"),
        status: 200,
        stream: body.stream === true,
        cacheControl: !isOpenAI && Array.isArray(body.system) ? body.system[0]?.cache_control : undefined,
        maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
      };
      state.requests.push(rec);

      const fail = (status: number, retryAfter?: number) => {
        rec.status = status;
        res.writeHead(status, { "content-type": "application/json", ...(retryAfter != null ? { "retry-after": String(retryAfter) } : {}) });
        res.end(
          JSON.stringify(
            isOpenAI
              ? { error: { message: status === 429 ? "Rate limit reached (tokens per min)" : "upstream error", type: "rate_limit_exceeded" } }
              : { type: "error", error: { type: status === 529 ? "overloaded_error" : "rate_limit_error", message: "busy" } },
          ),
        );
      };

      let reply = "Mock reply.";
      if (behaviour.mode === "status") return fail(behaviour.status, behaviour.retryAfter);
      if (behaviour.mode === "status-once") {
        const key = `${provider}:${behaviour.status}`;
        // Only the coach's own streamed call: a background memory-writer call must not eat the one failure.
        if (rec.stream && !onceUsed.has(key)) {
          onceUsed.add(key);
          return fail(behaviour.status);
        }
        reply = behaviour.reply ?? reply;
      }
      if (behaviour.mode === "too-big") {
        if (raw.length > behaviour.maxChars) return fail(429);
        reply = behaviour.reply ?? reply;
      }
      if (behaviour.mode === "ok") reply = behaviour.reply ?? reply;

      if (state.firstByteDelayMs > 0) await new Promise((r) => setTimeout(r, state.firstByteDelayMs));

      // Non-streaming Anthropic call (memory writer, planner): canned JSON.
      if (!isOpenAI && body.stream !== true) {
        res.writeHead(200, { "content-type": "application/json" });
        const toolName = body.tool_choice?.name as string | undefined;
        const content =
          toolName && state.anthropicTool
            ? [{ type: "tool_use", id: "tu_1", name: toolName, input: state.anthropicTool(toolName) }]
            : [{ type: "text", text: "ok" }];
        res.end(
          JSON.stringify({
            id: "msg_mock",
            type: "message",
            role: "assistant",
            model: body.model ?? "mock",
            content,
            stop_reason: toolName ? "tool_use" : "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        );
        return;
      }
      if (isOpenAI && body.stream !== true) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "c1",
            object: "chat.completion",
            choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
          }),
        );
        return;
      }

      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.on("close", () => {
        if (!res.writableFinished) rec.abortedEarly = true;
      });
      const pause = () => (state.wordDelayMs > 0 ? new Promise((r) => setTimeout(r, state.wordDelayMs)) : null);
      const words = reply.split(" ");
      if (isOpenAI) {
        for (const w of words) {
          await pause();
          if (res.destroyed) return;
          res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: `${w} ` }, finish_reason: null }] })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      const ev = (name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      ev("message_start", {
        type: "message_start",
        message: { id: "msg_mock", type: "message", role: "assistant", model: body.model ?? "mock", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
      });
      ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      for (const w of words) {
        await pause();
        if (res.destroyed) return;
        ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: `${w} ` } });
      }
      ev("content_block_stop", { type: "content_block_stop", index: 0 });
      ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: words.length } });
      ev("message_stop", { type: "message_stop" });
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  state.url = `http://127.0.0.1:${port}`;
  state.anthropicBase = state.url;
  state.openaiBase = `${state.url}/openai`;
  return state;
}
