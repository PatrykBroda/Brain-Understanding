/**
 * Mobile smoke tests – run after every frame-mobile rebuild.
 *
 * Guards four regression categories:
 *
 *  1. home-screen-no-crash   — signed-in user reaches /mobile/home with no
 *                              "e.filter is not a function" TypeError in console.
 *                              (The e.filter crash fired when the facts API
 *                              returned an object instead of an array.)
 *
 *  2. onboarding-POST        — POST /api/fighter with the correct camelCase
 *                              field names succeeds (guard against snake_case
 *                              submission regression).  Tested via API so the
 *                              test is not brittle on headless render issues.
 *
 *  3. competition-CRUD       — POST → GET list → soft-cancel → verify not active.
 *
 *  4. chat-SSE               — /api/coach/chat returns at least one
 *                              {content} or {done} chunk.
 *
 * Auth:
 *   @clerk/testing/playwright `clerk.signIn()` uses the ticket strategy
 *   (no password, no CAPTCHA) so no bot-detection issues.  After injection
 *   we navigate back to /mobile/ to trigger index.tsx's isSignedIn redirect.
 *
 * Two Clerk accounts seeded by global-setup.ts:
 *   - frame-smoke-main@example.com  (has a fighter → home)
 *   - frame-smoke-fresh@example.com (fighter deleted each run → onboarding)
 */
import { test, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { TEST_MAIN_EMAIL, TEST_FRESH_EMAIL } from "./global-setup";

const BASE = "/mobile";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/`);
  await setupClerkTestingToken({ page });
  await clerk.signIn({ page, emailAddress: email });
  // Reload so index.tsx re-evaluates isSignedIn and issues the Expo Router redirect
  await page.goto(`${BASE}/`);
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 40_000 });
}

async function getBearerToken(page: Page): Promise<string> {
  const token = await page.evaluate<string | null>(async () => {
    const c = (
      window as unknown as {
        Clerk?: { session?: { getToken?: () => Promise<string | null> } };
      }
    ).Clerk;
    return (c?.session?.getToken?.()) ?? null;
  });
  if (!token) throw new Error("Could not retrieve Bearer token from Clerk session");
  return token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Home screen — no "e.filter" crash
// ─────────────────────────────────────────────────────────────────────────────
test("home screen renders — no JS crash", async ({ page }) => {
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") jsErrors.push(msg.text());
  });

  await signIn(page, TEST_MAIN_EMAIL);

  // Main user has a fighter → index redirects to /mobile/home
  await page.waitForURL(/\/home/, { timeout: 5_000 });

  // Allow React + async effects to settle
  await page.waitForTimeout(2_000);

  // The specific regression we guard against:
  // facts API returned an object; Array.prototype.filter threw "e.filter is not a function"
  const filterCrash = jsErrors.find(
    (e) =>
      e.includes("e.filter") ||
      (e.toLowerCase().includes("typeerror") && e.toLowerCase().includes("filter"))
  );
  expect(
    filterCrash,
    `"e.filter" TypeError detected — facts API likely returned wrong shape.\n  Errors: ${jsErrors.join(" | ")}`
  ).toBeUndefined();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Onboarding POST uses correct camelCase field names
// ─────────────────────────────────────────────────────────────────────────────
test("onboarding completes for fresh user", async ({ page }) => {
  // Sign in as a user with no fighter (fighter deleted by global-setup)
  await signIn(page, TEST_FRESH_EMAIL);

  const token = await getBearerToken(page);

  // Verify the fresh user truly has no fighter (the redirect should be to onboarding)
  // If global-setup deleted it, the API should return null
  const checkRes = await page.request.get("/api/fighter", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(checkRes.ok(), `GET /api/fighter failed: ${checkRes.status()}`).toBe(true);
  const checkBody = await checkRes.json();
  // fighter is null → the user is fresh
  // fighter is non-null → it wasn't cleaned up; skip POST to avoid duplicate
  if (checkBody.fighter !== null) {
    // Already has a fighter from a previous incomplete run — don't double-create.
    // Just verify it has the expected shape, then pass.
    expect(checkBody.fighter).toMatchObject({
      id: expect.any(Number),
      name: expect.any(String),
    });
    return;
  }

  // POST /api/fighter — simulate onboarding form submission with camelCase fields.
  // The regression we guard against is sending snake_case (dateOfBirth → date_of_birth),
  // which Zod rejects with a 400.
  const createRes = await page.request.post("/api/fighter", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: {
      name: "Smoke Fighter",
      dateOfBirth: "1990-06-15",
      art: "bjj",
      primarySport: "bjj",
      level: "white",
      trainingFrequency: "3-4",
      goals: "Improve under pressure",
      weaknesses: "Guard retention",
    },
  });
  expect(
    createRes.ok(),
    `POST /api/fighter failed (${createRes.status()}) — likely snake_case field name regression.\n  Body: ${await createRes.text()}`
  ).toBe(true);
  const { fighter } = await createRes.json();
  expect(fighter).toMatchObject({
    id: expect.any(Number),
    name: "Smoke Fighter",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Competition CRUD round-trips
// ─────────────────────────────────────────────────────────────────────────────
test("competition CRUD — POST → GET → PATCH → DELETE", async ({ page }) => {
  await signIn(page, TEST_MAIN_EMAIL);
  await page.waitForURL(/\/home/, { timeout: 5_000 });

  const token = await getBearerToken(page);
  const eventName = `Smoke-Comp-${Date.now()}`;

  // POST: Create competition
  const createRes = await page.request.post("/api/competition", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { eventName, discipline: "BJJ", eventDate: "2026-12-15T10:00:00.000Z" },
  });
  expect(createRes.ok(), `POST /api/competition failed: ${createRes.status()}`).toBe(true);
  const { competition: created } = await createRes.json();
  expect(created).toMatchObject({ eventName, discipline: "BJJ" });
  const compId: number = created.id;
  expect(typeof compId).toBe("number");

  // GET: Verify in list
  const listRes = await page.request.get("/api/competition", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(listRes.ok()).toBe(true);
  const { competitions } = await listRes.json();
  const found = (competitions as Array<{ id: number }>).find((c) => c.id === compId);
  expect(found).toBeTruthy();

  // PATCH: Edit the competition (rename + new date) and verify it persists
  const editedName = `${eventName}-edited`;
  const patchRes = await page.request.patch(`/api/competition/${compId}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { eventName: editedName, eventDate: "2026-12-20T10:00:00.000Z" },
  });
  expect(patchRes.ok(), `PATCH /api/competition/${compId} failed: ${patchRes.status()}`).toBe(true);
  const { competition: updated } = await patchRes.json();
  expect(updated).toMatchObject({ id: compId, eventName: editedName });
  expect(new Date(updated.eventDate).toISOString()).toBe("2026-12-20T10:00:00.000Z");

  // DELETE (soft-cancel)
  const cancelRes = await page.request.delete(`/api/competition/${compId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(cancelRes.ok(), `DELETE /api/competition/${compId} failed: ${cancelRes.status()}`).toBe(true);
  const cancelBody = await cancelRes.json();
  expect(cancelBody.ok).toBe(true);

  // GET active: Cancelled comp must not be active
  const activeRes = await page.request.get("/api/competition/active", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const activeBody = await activeRes.json();
  if (activeBody.competition) {
    expect(activeBody.competition.id).not.toBe(compId);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Chat SSE delivers at least one content chunk
// ─────────────────────────────────────────────────────────────────────────────
test("chat SSE delivers at least one chunk", async ({ page }) => {
  await signIn(page, TEST_MAIN_EMAIL);
  await page.waitForURL(/\/home/, { timeout: 5_000 });

  const token = await getBearerToken(page);

  const result = await page.evaluate(
    async ({ t }) => {
      try {
        const res = await fetch("/api/coach/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${t}`,
          },
          body: JSON.stringify({ content: "ping" }),
        });
        if (!res.ok) return { ok: false, status: res.status };

        const reader = res.body?.getReader();
        if (!reader) return { ok: false, status: 0 };

        const decoder = new TextDecoder();
        let buf = "";
        const start = Date.now();

        while (Date.now() - start < 50_000) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          if (buf.includes('"content"') || buf.includes('"done"')) {
            reader.cancel().catch(() => {});
            return { ok: true, status: res.status };
          }
        }
        reader.cancel().catch(() => {});
        return { ok: false, status: res.status, buf: buf.slice(0, 200) };
      } catch (e: unknown) {
        return { ok: false, status: -1, err: String(e) };
      }
    },
    { t: token }
  );

  expect(result.ok, `SSE did not deliver a chunk (status=${result.status})`).toBe(true);
});
