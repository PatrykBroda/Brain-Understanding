import type { PushMessage, PushUserContext } from "./pushLogic";
import { pushesToSend } from "./pushLogic";

export interface PushTarget {
  tokens: string[];
}

export interface SendResult {
  /** Tokens the push service says are dead (DeviceNotRegistered); we delete them. */
  invalidTokens: string[];
  /** True if at least one ticket was accepted. */
  delivered: boolean;
}

/** The Expo push API sits behind this so tests never touch the network. */
export interface PushSender {
  send(tokens: string[], msg: PushMessage): Promise<SendResult>;
}

/** Persistence the job needs; the drizzle implementation lives in pushStore.ts. */
export interface PushStore {
  /** Every user that has at least one device, with tokens and context. */
  listUsers(now: Date): Promise<(PushUserContext & PushTarget)[]>;
  /** Atomically claim (user, dedupeKey). False if it was already claimed. */
  claim(userId: string, kind: string, dedupeKey: string): Promise<boolean>;
  /** Un-claim after a failed send so the next run retries. */
  release(userId: string, dedupeKey: string): Promise<void>;
  removeTokens(tokens: string[]): Promise<void>;
}

export interface PushJobResult {
  considered: number;
  sent: number;
  skippedDuplicate: number;
  failed: number;
}

/**
 * One pass of the push job. Idempotent: each (user, event) is claimed before the
 * send, so overlapping runs or a restart can never double-send. A thrown send
 * releases the claim and retries on the next pass.
 */
export async function runPushJob(opts: { store: PushStore; sender: PushSender; now: Date }): Promise<PushJobResult> {
  const { store, sender, now } = opts;
  const res: PushJobResult = { considered: 0, sent: 0, skippedDuplicate: 0, failed: 0 };
  for (const user of await store.listUsers(now)) {
    if (user.tokens.length === 0) continue;
    for (const msg of pushesToSend(user, now)) {
      res.considered++;
      if (!(await store.claim(user.userId, msg.kind, msg.dedupeKey))) {
        res.skippedDuplicate++;
        continue;
      }
      try {
        const r = await sender.send(user.tokens, msg);
        if (r.invalidTokens.length) await store.removeTokens(r.invalidTokens);
        // Every token dead: nothing to retry, keep the claim.
        if (r.delivered) res.sent++;
        else res.failed++;
      } catch {
        await store.release(user.userId, msg.dedupeKey).catch(() => {});
        res.failed++;
      }
    }
  }
  return res;
}

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

export class ExpoPushSender implements PushSender {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(tokens: string[], msg: PushMessage): Promise<SendResult> {
    const r = await this.fetchImpl(EXPO_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(
        tokens.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data, sound: "default" })),
      ),
    });
    if (!r.ok) throw new Error(`expo push ${r.status}`);
    const json = (await r.json()) as { data?: { status: string; details?: { error?: string } }[] };
    const tickets = json.data ?? [];
    const invalidTokens: string[] = [];
    let delivered = false;
    tickets.forEach((t, i) => {
      if (t.status === "ok") delivered = true;
      else if (t.details?.error === "DeviceNotRegistered" && tokens[i]) invalidTokens.push(tokens[i]!);
    });
    return { invalidTokens, delivered };
  }
}
