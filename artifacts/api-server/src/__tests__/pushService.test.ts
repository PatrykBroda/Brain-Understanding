import { describe, it, expect, vi } from "vitest";
import { runPushJob, ExpoPushSender, type PushStore, type PushSender } from "../lib/pushService";
import type { PushUserContext } from "../lib/pushLogic";

const NOW = new Date("2026-11-06T10:00:00Z");

function memStore(users: (PushUserContext & { tokens: string[] })[]) {
  const claimed = new Set<string>();
  const removed: string[] = [];
  const store: PushStore = {
    listUsers: async () => users,
    claim: async (u, _k, key) => {
      const id = `${u}|${key}`;
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    },
    release: async (u, key) => {
      claimed.delete(`${u}|${key}`);
    },
    removeTokens: async (t) => {
      removed.push(...t);
    },
  };
  return { store, claimed, removed };
}

const user = (over: Partial<PushUserContext & { tokens: string[] }> = {}) => ({
  userId: "u1",
  tokens: ["ExponentPushToken[aaaaaaaa]"],
  timeZone: "UTC",
  enabled: true,
  quietStartMin: 1260,
  quietEndMin: 480,
  lastCheckinDate: "2026-11-01",
  analyses: [],
  competitions: [],
  ...over,
});

const okSender = (): PushSender & { send: ReturnType<typeof vi.fn> } => ({
  send: vi.fn(async () => ({ invalidTokens: [], delivered: true })),
});

describe("runPushJob", () => {
  it("sends once and is idempotent across runs", async () => {
    const { store } = memStore([user()]);
    const sender = okSender();
    const a = await runPushJob({ store, sender, now: NOW });
    const b = await runPushJob({ store, sender, now: NOW });
    expect(a.sent).toBe(1);
    expect(b).toMatchObject({ sent: 0, skippedDuplicate: 1 });
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
  it("releases the claim when the send throws, so the next run retries", async () => {
    const { store, claimed } = memStore([user()]);
    const sender = okSender();
    sender.send.mockRejectedValueOnce(new Error("boom"));
    const a = await runPushJob({ store, sender, now: NOW });
    expect(a.failed).toBe(1);
    expect(claimed.size).toBe(0);
    const b = await runPushJob({ store, sender, now: NOW });
    expect(b.sent).toBe(1);
  });
  it("removes dead tokens", async () => {
    const { store, removed } = memStore([user()]);
    const sender = okSender();
    sender.send.mockResolvedValueOnce({ invalidTokens: ["ExponentPushToken[aaaaaaaa]"], delivered: false });
    await runPushJob({ store, sender, now: NOW });
    expect(removed).toEqual(["ExponentPushToken[aaaaaaaa]"]);
  });
  it("sends nothing in quiet hours or when opted out, and claims nothing", async () => {
    const { store, claimed } = memStore([user(), user({ userId: "u2", enabled: false })]);
    const sender = okSender();
    await runPushJob({ store, sender, now: new Date("2026-11-06T23:00:00Z") });
    await runPushJob({ store, sender, now: NOW }); // u1 sends, u2 opted out
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(claimed.size).toBe(1);
  });
  it("skips users without tokens", async () => {
    const { store } = memStore([user({ tokens: [] })]);
    const sender = okSender();
    expect((await runPushJob({ store, sender, now: NOW })).considered).toBe(0);
  });
});

describe("ExpoPushSender", () => {
  const msg = { kind: "missed_3_days", dedupeKey: "k", title: "t", body: "b", data: { route: "checkin" } } as const;
  it("posts a batch and maps tickets", async () => {
    const f = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }),
        { status: 200 },
      ),
    );
    const r = await new ExpoPushSender(f as unknown as typeof fetch).send(["t1", "t2"], msg);
    expect(r).toEqual({ invalidTokens: ["t2"], delivered: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(JSON.parse(init.body as string)).toHaveLength(2);
  });
  it("throws on HTTP failure so the claim is released", async () => {
    const f = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(new ExpoPushSender(f as unknown as typeof fetch).send(["t"], msg)).rejects.toThrow();
  });
});
