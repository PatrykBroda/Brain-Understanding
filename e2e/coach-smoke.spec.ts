/**
 * Coach web-app smoke tests – cover the React/Vite frontend at `/`.
 *
 * Guards three regression categories:
 *
 *  1. sign-in-home          — signed-in user reaches the FRAME home page
 *                             with no JS errors (CosmicOrb + State label
 *                             rendered, "Enter" CTA present).
 *
 *  2. chat-SSE              — POST /api/coach/chat (cookie auth, no Bearer)
 *                             returns at least one {content} or {done} chunk.
 *
 *  3. profile-no-crash      — /profile loads without JS errors; athlete-state
 *                             panel and bottom nav are present in the DOM.
 *
 *  4. analyse-no-hang       — uploads a short clip to /analyse and asserts the
 *                             processing overlay advances past ~1% and reaches
 *                             a terminal state (FRAME REPORT or an honest error)
 *                             within a bounded window. Guards the regression
 *                             where the on-device pose extractor hung forever at
 *                             ~1% on mobile. Reaching the honest "couldn't lock
 *                             onto a body" error is a valid terminal state — the
 *                             test clip has no detectable body, so that error
 *                             proves the extraction loop ran to completion.
 *
 * Auth:
 *   Same two Clerk accounts provisioned by global-setup.ts.
 *   @clerk/testing/playwright `clerk.signIn()` uses the ticket strategy.
 *   The web coach app uses cookie-based sessions (no Authorization header),
 *   so same-origin fetches from page.evaluate() carry the session automatically.
 *
 * Note on page.waitForURL():
 *   Playwright matches against the FULL URL string (e.g. "http://localhost:80/").
 *   Anchored path regexes like /^\/$/ never match because the URL starts with
 *   "http://". We use URL predicate functions that parse pathname instead.
 */
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { Client } from "pg";
import { TEST_MAIN_EMAIL, TEST_FRESH_EMAIL } from "./global-setup";

// A short, valid VP8/WebM clip (open-source-Chromium decodable). It contains a
// synthetic test pattern with NO detectable body, so a healthy extraction run
// samples frames and terminates in the honest "couldn't lock onto a body"
// error — exactly the terminal state that proves the loop did not hang.
const SAMPLE_VIDEO = path.join(process.cwd(), "e2e", "fixtures", "analyse-sample.webm");

// ─── URL predicate helpers ─────────────────────────────────────────────────

function isHomePath(url: string): boolean {
  return new URL(url).pathname === "/";
}

function isHomeOrOnboarding(url: string): boolean {
  const { pathname } = new URL(url);
  return pathname === "/" || pathname === "/onboarding";
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function signInWeb(page: Page): Promise<void> {
  await page.goto("/");
  await setupClerkTestingToken({ page });
  await clerk.signIn({ page, emailAddress: TEST_MAIN_EMAIL });
  await page.goto("/");
  // After a successful sign-in the app either stays on / (home) or redirects
  // to /onboarding for first-run users; main test user always has a fighter.
  await page.waitForURL(isHomeOrOnboarding, { timeout: 40_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Sign-in lands on FRAME home — no JS errors
// ─────────────────────────────────────────────────────────────────────────────
test("sign-in lands on FRAME home with no JS errors", async ({ page }) => {
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") jsErrors.push(msg.text());
  });

  await signInWeb(page);

  // Main user has a fighter — should be on home (/), not onboarding
  await page.waitForURL(isHomePath, { timeout: 5_000 });

  // Allow React effects and async queries to settle
  await page.waitForTimeout(2_000);

  // Verify home landmarks are rendered
  // "FRAME" wordmark in the header
  await expect(page.getByText("FRAME").first()).toBeVisible();

  // State section exists (font-mono "State" label)
  await expect(page.getByText("State")).toBeVisible();

  // Doorway CTA present. The label is session-aware: "Enter the frame" for a
  // fresh session, "Continue session" for a returning one (the persistent test
  // account usually has prior history, so it reads "Continue").
  await expect(
    page.getByRole("link", { name: /Enter the frame|Continue session/ })
  ).toBeVisible();

  // No unexpected JS errors (filter out known benign browser noise)
  const criticalErrors = jsErrors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("ResizeObserver") &&
      !e.includes("Non-Error promise rejection") &&
      !e.includes("ERR_FAILED") // R3F WebGL context warnings in headless
  );
  expect(
    criticalErrors,
    `Unexpected JS errors on home:\n  ${criticalErrors.join("\n  ")}`
  ).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Chat SSE delivers at least one content chunk
// ─────────────────────────────────────────────────────────────────────────────
test("chat SSE delivers at least one chunk (cookie auth)", async ({ page }) => {
  await signInWeb(page);
  await page.waitForURL(isHomePath, { timeout: 5_000 });

  // The web coach app uses cookies — no Authorization header required.
  // page.evaluate() runs inside the browser context where the session cookie
  // is already set, so the fetch call carries it automatically.
  const result = await page.evaluate(async () => {
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        credentials: "include",
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
  });

  expect(
    result.ok,
    `SSE did not deliver a chunk (status=${result.status})`
  ).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Profile page loads without JS errors
// ─────────────────────────────────────────────────────────────────────────────
test("profile page loads without JS errors", async ({ page }) => {
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") jsErrors.push(msg.text());
  });

  await signInWeb(page);
  await page.waitForURL(isHomePath, { timeout: 5_000 });

  // Navigate to profile
  await page.goto("/profile");
  await page.waitForTimeout(2_500);

  // Verify profile landmarks
  // Bottom nav is present (the nav renders on every authenticated page)
  const bottomNav = page.locator("nav").last();
  await expect(bottomNav).toBeVisible({ timeout: 8_000 });

  // The page should not have crashed — some profile content should be visible.
  // Profile is now a passport: look for its "Passport" header landmark.
  const hasContent =
    (await page.getByText("Passport", { exact: false }).count()) > 0 ||
    (await page.getByText("Sign out", { exact: false }).count()) > 0;
  expect(hasContent, "Profile page rendered no expected content").toBe(true);

  // No critical JS errors
  const criticalErrors = jsErrors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("ResizeObserver") &&
      !e.includes("Non-Error promise rejection") &&
      !e.includes("ERR_FAILED")
  );
  expect(
    criticalErrors,
    `Unexpected JS errors on profile:\n  ${criticalErrors.join("\n  ")}`
  ).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Onboarding POST uses correct camelCase field names (fresh user)
// ─────────────────────────────────────────────────────────────────────────────
test("onboarding page loads and POST /api/fighter uses camelCase fields", async ({
  page,
}) => {
  // Sign in as the fresh user (fighter deleted by global-setup each run)
  await page.goto("/");
  await setupClerkTestingToken({ page });
  await clerk.signIn({ page, emailAddress: TEST_FRESH_EMAIL });
  await page.goto("/");
  // Fresh user has no fighter — should land on /onboarding
  await page.waitForURL(isHomeOrOnboarding, { timeout: 40_000 });

  const { pathname } = new URL(page.url());

  if (pathname !== "/onboarding") {
    // Fighter wasn't cleaned up (previous run left one) — verify shape and pass
    const bodyRaw = await page.evaluate(async () => {
      const res = await fetch("/api/fighter", { credentials: "include" });
      return res.ok ? res.json() : null;
    });
    if (bodyRaw?.fighter) {
      expect(bodyRaw.fighter).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
      });
    }
    return;
  }

  // Verify the onboarding page rendered something meaningful
  await page.waitForTimeout(1_500);
  const hasOnboardingContent =
    (await page.getByText("FRAME").count()) > 0 ||
    (await page.locator("input, select, button").count()) > 0;
  expect(hasOnboardingContent, "Onboarding page rendered no expected content").toBe(true);

  // POST /api/fighter via same-origin fetch (cookie auth — no Bearer needed on web)
  // The regression we guard against is sending snake_case (e.g. date_of_birth)
  // which Zod rejects with a 400.
  const result = await page.evaluate(async () => {
    try {
      // Check if fighter already exists from a partial previous run
      const check = await fetch("/api/fighter", { credentials: "include" });
      if (check.ok) {
        const { fighter } = await check.json();
        if (fighter !== null) return { already: true, fighter };
      }

      const res = await fetch("/api/fighter", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Web Smoke Fighter",
          dateOfBirth: "1990-06-15",
          art: "bjj",
          primarySport: "bjj",
          level: "white",
          trainingFrequency: "3-4",
          goals: "Improve under pressure",
          weaknesses: "Guard retention",
        }),
      });
      if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
      const data = await res.json();
      return { ok: true, fighter: data.fighter };
    } catch (e: unknown) {
      return { ok: false, status: -1, err: String(e) };
    }
  });

  if ("already" in result && result.already) {
    // Fighter created in a previous incomplete run — verify shape and pass
    expect(result.fighter).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
    return;
  }

  expect(
    result.ok,
    `POST /api/fighter failed (status=${result.status}) — likely snake_case regression.\n  Body: ${result.body ?? result.err ?? ""}`
  ).toBe(true);
  expect(result.fighter).toMatchObject({
    id: expect.any(Number),
    name: "Web Smoke Fighter",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: First analysis is free (one-time taster); the second one is FRAME+
// ─────────────────────────────────────────────────────────────────────────────
//
// The FRESH smoke user is pinned to the free plan by global-setup (which also
// deletes its fighter — cascading away any analyses from earlier runs). The
// entitlement gate counts existing analyses: 0 → allowed through to normal
// validation (400 here, since we send no signals — proof the gate passed),
// ≥1 → 402 { code: "FRAME_PLUS_REQUIRED", feature: "video_analysis" }.
test("free tier: first POST /api/analysis passes the gate, second is 402", async ({
  page,
}) => {
  await page.goto("/");
  await setupClerkTestingToken({ page });
  await clerk.signIn({ page, emailAddress: TEST_FRESH_EMAIL });
  await page.goto("/");
  await page.waitForURL(isHomeOrOnboarding, { timeout: 40_000 });

  const fighterId = await page.evaluate(async () => {
    // The route checks fighter BEFORE entitlement — ensure one exists (the
    // onboarding test usually created it; re-POST is a safe no-op check).
    const check = await fetch("/api/fighter", { credentials: "include" });
    let fighter = check.ok ? (await check.json()).fighter : null;
    if (!fighter) {
      const created = await fetch("/api/fighter", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Web Smoke Fighter",
          dateOfBirth: "1990-06-15",
          art: "bjj",
          primarySport: "bjj",
          level: "white",
          trainingFrequency: "3-4",
        }),
      });
      fighter = created.ok ? (await created.json()).fighter : null;
    }
    return fighter ? (fighter.id as number) : null;
  });
  expect(fighterId, "fresh smoke user has no fighter and POST /api/fighter failed").not.toBeNull();

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    // Make the run idempotent under Playwright retries: clear any analyses
    // this fresh fighter accumulated within THIS run.
    await db.query("DELETE FROM video_analyses WHERE fighter_id = $1", [fighterId]);

    const postAnalysis = () =>
      page.evaluate(async () => {
        const res = await fetch("/api/analysis", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "sparring" }),
        });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* non-JSON body — assertion below will surface it */
        }
        return { status: res.status, body };
      });

    // 1) Zero analyses on record → the free taster: the entitlement gate must
    //    let the request through. It then fails ordinary validation (400 — no
    //    signals in the payload), which is exactly the proof we want: NOT 402.
    const first = await postAnalysis();
    expect(
      first.status,
      `First free analysis should pass the entitlement gate (expected 400 validation, not 402): ${JSON.stringify(first.body)}`
    ).toBe(400);

    // 2) Seed one analysis row (a real one would need a full Claude round-trip;
    //    the gate only counts rows) → the taster is spent.
    await db.query(
      `INSERT INTO video_analyses
         (fighter_id, kind, nervous_system_load, summary, findings, metrics, keyframes)
       VALUES ($1, 'sparring', 'low', 'smoke seed', '[]', '{}', '[]')`,
      [fighterId]
    );

    const second = await postAnalysis();
    expect(
      second.status,
      `Expected 402 once the free analysis is used, got ${second.status}: ${JSON.stringify(second.body)}`
    ).toBe(402);
    expect(second.body).toMatchObject({
      code: "FRAME_PLUS_REQUIRED",
      feature: "video_analysis",
    });
  } finally {
    await db.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Analyse never silently hangs — the extraction loop always terminates
// ─────────────────────────────────────────────────────────────────────────────
//
// The regression this guards: the on-device pose extractor used to stall
// forever at ~1% on mobile (a detached, never-played <video> iOS refuses to
// decode). It was rewritten to a play-through + requestVideoFrameCallback
// sampler with a stall watchdog and honest error paths. This test proves the
// loop ALWAYS reaches a terminal state — a FRAME REPORT or an honest error —
// within a bounded window, and advances past the ~1% point it used to stall at.
test("analyse video processing always terminates (never silently hangs)", async ({
  page,
}) => {
  test.setTimeout(150_000);

  await signInWeb(page);
  await page.waitForURL(isHomePath, { timeout: 5_000 });

  await page.goto("/analyse");
  await page.waitForTimeout(1_500);

  // The Analyse page keeps a single hidden <input type=file> mounted at all
  // times (shared across mobile + desktop layouts). Setting files on it drives
  // the same code path as the visible "Drop footage" control.
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toHaveCount(1);
  await fileInput.setInputFiles(SAMPLE_VIDEO);

  // The cinematic processing overlay appears — proves the pipeline started.
  // Its per-phase titles ("Reading footage" / "Tracking movement" / …) render
  // only inside the overlay, so seeing one confirms we're processing.
  await expect(
    page
      .getByText(/Reading footage|Tracking movement|Detecting patterns|Building the read/)
      .first()
  ).toBeVisible({ timeout: 45_000 });

  // Poll for a terminal state while recording the highest progress % seen.
  // A hang (the old bug) would leave us stuck below ~1% until the deadline,
  // failing the `terminal` assertion below.
  const KNOWN_ERROR =
    /Couldn't read this clip|too large to process|couldn't lock onto|movement model|processing stalled|start video playback/i;
  const deadline = Date.now() + 100_000;
  let maxPct = 0;
  let terminal: "report" | "error" | null = null;
  let errorSeen = false;
  let lockOnBodyError = false;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const text = document.body.innerText;
      const m = text.match(/·\s*(\d+)%/);
      return {
        pct: m ? parseInt(m[1]!, 10) : null,
        hasReport: /FRAME Report/i.test(text),
        knownError:
          /Couldn't read this clip|too large to process|couldn't lock onto|movement model|processing stalled|start video playback/i.test(
            text
          ),
        lockOnBody: /couldn't lock onto/i.test(text),
      };
    });
    if (state.pct != null && state.pct > maxPct) maxPct = state.pct;
    if (state.hasReport) {
      terminal = "report";
      break;
    }
    if (state.knownError) {
      terminal = "error";
      errorSeen = true;
      lockOnBodyError = state.lockOnBody;
      break;
    }
    await page.waitForTimeout(120);
  }

  // (1) The core anti-hang guarantee: a terminal state within the window.
  expect(
    terminal,
    `Analyse never reached a terminal state within the bounded window (maxPct=${maxPct}) — the extraction loop appears to be hanging.`
  ).not.toBeNull();

  // (2) If it errored, it must be one of the HONEST, expected messages — not an
  //     unexpected crash. The stall-watchdog error is itself the anti-hang
  //     mechanism firing, which is an acceptable terminal state.
  if (terminal === "error") {
    const bodyText = await page.locator("body").innerText();
    expect(
      KNOWN_ERROR.test(bodyText),
      `Analyse errored with an unexpected (non-honest) message:\n${bodyText.slice(0, 400)}`
    ).toBe(true);
  }

  // (3) The extraction advanced past the ~1% point the old bug stalled at.
  //     Reaching a FRAME REPORT, or the honest "couldn't lock onto a body"
  //     error, both prove frames were actually sampled to completion — even if
  //     the fast run finished between progress polls and maxPct wasn't caught.
  const provedSampling = terminal === "report" || lockOnBodyError;
  expect(
    maxPct > 1 || provedSampling,
    `Extraction never advanced past ~1% (maxPct=${maxPct}, terminal=${terminal}, errorSeen=${errorSeen}) — the sampler may be stalling at the start.`
  ).toBe(true);
});
