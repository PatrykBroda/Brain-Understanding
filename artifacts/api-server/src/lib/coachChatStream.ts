// Plumbing for the coach chat SSE stream, kept out of the route so it can be
// unit-tested without a database or a provider:
//   - a heartbeat so proxies / iOS don't drop the connection during a silent wait
//     (a cold prompt cache can take ~25s before the first token);
//   - an in-flight turn that one or more requests can listen to, which aborts the
//     provider call once nobody is listening any more;
//   - a per-process registry keyed by the client's message id, so a retry of a
//     message that is still generating attaches to it instead of starting a
//     second generation.

import type { Response } from "express";

export const SSE_HEARTBEAT_MS = 10_000;
export const SSE_PING = ": ping\n\n";

type Writable = Pick<Response, "write"> & { readonly writableEnded: boolean; readonly destroyed: boolean };

/** Writes an SSE comment every `intervalMs` until stopped or the response ends. */
export function startSseHeartbeat(res: Writable, intervalMs = SSE_HEARTBEAT_MS): () => void {
  const timer = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(timer);
      return;
    }
    try {
      res.write(SSE_PING);
    } catch {
      clearInterval(timer);
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export type TurnEvent = Record<string, unknown>;

export interface SseChannel {
  send(event: TurnEvent): void;
  end(): void;
  readonly closed: boolean;
}

type SseResponse = Writable &
  Pick<Response, "setHeader" | "end" | "on"> & { flushHeaders?: () => void };

/** Sets SSE headers, flushes them, and starts the heartbeat. Writes after close are dropped. */
export function openSse(res: SseResponse, heartbeatMs = SSE_HEARTBEAT_MS): SseChannel {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const stop = startSseHeartbeat(res, heartbeatMs);
  let closed = false;
  res.on("close", () => {
    closed = true;
    stop();
  });
  const writable = () => !closed && !res.writableEnded && !res.destroyed;
  return {
    send(event) {
      if (writable()) res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end() {
      stop();
      if (!res.writableEnded) res.end();
      closed = true;
    },
    get closed() {
      return closed || res.writableEnded || res.destroyed;
    },
  };
}

/**
 * Calls `onDisconnect` if the response closes before it finished normally (the
 * client hung up, timed out, or the network dropped). Returns an unbind.
 * Uses the RESPONSE's close: on current Node the request's own 'close' fires as
 * soon as the body has been read, which is not a disconnect.
 */
export function onClientDisconnect(
  res: Pick<Response, "on" | "off"> & { readonly writableFinished: boolean },
  onDisconnect: () => void,
): () => void {
  const handler = () => {
    if (!res.writableFinished) onDisconnect();
  };
  res.on("close", handler);
  return () => res.off("close", handler);
}

type Listener = (event: TurnEvent) => void;

/**
 * One generation of a coach reply. Requests subscribe to it; content and the
 * terminal event (done / error) fan out to every subscriber. When the last
 * subscriber leaves before the turn has finished, the provider call is aborted.
 */
export class ChatTurn {
  assembled = "";
  terminal: TurnEvent | null = null;
  readonly controller = new AbortController();
  private readonly listeners = new Set<Listener>();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get finished(): boolean {
    return this.terminal !== null;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  content(delta: string): void {
    if (!delta || this.terminal) return;
    this.assembled += delta;
    for (const l of this.listeners) l({ content: delta });
  }

  finish(event: TurnEvent): void {
    if (this.terminal) return;
    this.terminal = event;
    for (const l of this.listeners) l(event);
    this.listeners.clear();
  }

  /**
   * Listen to this turn. With `replay`, whatever has streamed so far is sent first
   * as one chunk (and the terminal event, if the turn already finished).
   * The returned function unsubscribes; the last one out aborts an unfinished turn.
   */
  subscribe(listener: Listener, opts: { replay?: boolean } = {}): () => void {
    if (opts.replay) {
      if (this.assembled) listener({ content: this.assembled });
      if (this.terminal) {
        listener(this.terminal);
        return () => {};
      }
    } else if (this.terminal) {
      listener(this.terminal);
      return () => {};
    }
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && !this.terminal) {
        this.controller.abort(Object.assign(new Error("client disconnected"), { name: "AbortError" }));
      }
    };
  }
}

/** In-flight turns for this process, keyed by user + client message id. */
export class ChatTurnRegistry {
  private readonly turns = new Map<string, ChatTurn>();

  static key(userId: string, clientMessageId: string): string {
    return `${userId}\u0000${clientMessageId}`;
  }

  get(key: string): ChatTurn | undefined {
    return this.turns.get(key);
  }

  /** Registers a new turn. Synchronous, so two racing requests can't both start one. */
  start(key: string): ChatTurn {
    const turn = new ChatTurn();
    this.turns.set(key, turn);
    return turn;
  }

  release(key: string, turn: ChatTurn): void {
    if (this.turns.get(key) === turn) this.turns.delete(key);
  }

  get size(): number {
    return this.turns.size;
  }
}

const CLIENT_MESSAGE_ID_MAX = 64;

/** A client message id is optional; anything that isn't a short safe token is ignored. */
export function sanitizeClientMessageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v.length === 0 || v.length > CLIENT_MESSAGE_ID_MAX) return null;
  if (!/^[A-Za-z0-9_.:-]+$/.test(v)) return null;
  return v;
}

/** Per-key "at most once every N ms" gate (used to rate-limit cache warm-ups). */
export class Throttle {
  private readonly last = new Map<string, number>();
  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** True (and records the hit) if `key` hasn't been let through within the interval. */
  take(key: string): boolean {
    const t = this.now();
    const prev = this.last.get(key);
    if (prev !== undefined && t - prev < this.intervalMs) return false;
    this.last.set(key, t);
    if (this.last.size > 10_000) {
      for (const [k, v] of this.last) if (t - v >= this.intervalMs) this.last.delete(k);
    }
    return true;
  }
}

/** Runs `op`, and once more after `delayMs` if it throws. Rethrows the second failure. */
export async function retryOnce<T>(op: () => Promise<T>, delayMs = 500): Promise<T> {
  try {
    return await op();
  } catch {
    await new Promise((r) => setTimeout(r, delayMs));
    return op();
  }
}
