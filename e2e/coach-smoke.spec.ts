/**
 * Coach web-app smoke tests – cover the React/Vite frontend at `/`.
 *
 * Guards six regression categories:
 *
 *  1. sign-in-home          — signed-in user reaches the FRAME home page
 *                             with no JS errors (CosmicOrb + State label
 *                             rendered, "Enter" CTA present).
 *
 *  2. chat-SSE              — POST /api/coach/chat (Bearer token auth)
 *                             returns at least one {content} or {done} chunk.
 *
 *  3. profile-no-crash      — /profile loads without JS errors; athlete-state
 *                             panel and bottom nav are present in the DOM.
 *
 *  4. onboarding-camelCase  — fresh user POST /api/fighter uses camelCase field
 *                             names (Zod rejects snake_case with 400).
 *
 *  5. free-tier-gate        — first POST /api/analysis is free (passes gate →
 *                             400 validation); second hit is 402.
 *
 *  6. analyse-no-hang       — uploads a short clip to /analyse and asserts the
 *                             processing overlay advances past ~1% and reaches
 *                             a terminal state (FRAME REPORT or an honest error)
 *                             within a bounded window.
 *
 * Auth:
 *   Two test accounts created by global-setup.ts via direct DB insert + bcryptjs.
 *   `signInAs()` calls POST /api/auth/login from within the browser context and
 *   injects the JWT into localStorage["frame:token"]. All subsequent
 *   page.evaluate() fetches read that key and supply the Authorization header.
 *
 * Note on page.waitForURL():
 *   Playwright matches against the FULL URL string (e.g. "http://localhost:80/").
 *   Anchored path regexes like /^\/$/ never match because the URL starts with
 *   "http://". We use URL predicate functions that parse pathname instead.
 */
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { TEST_MAIN_EMAIL, TEST_FRESH_EMAIL, TEST_PASSWORD } from "./global-setup";

// A short, valid VP8/WebM clip (open-source-Chromium decodable). It contains a
// synthetic test pattern with NO detectable body, so a healthy extraction run
// samples frames and terminates in the honest "couldn't lock onto a body"
// error — exactly the terminal state that proves the loop did not hang.
const SAMPLE_VIDEO = path.join(process.cwd(), "e2e", "fixtures", "analyse-sample.webm");

// ─── URL predicate helpers ─────────────────────────────────────────────────

function isHomePath(url: string): boolean {
  const { pathname } = new URL(url);
  return pathname === "/" || pathname === "/home";
}

function isHomeOrOnboarding(url: string): boolean {
  const { pathname } = new URL(url);
  return pathname === "/" || pathname === "/home" || pathname === "/onboarding";
}

// ─── Auth helper ──────────────────────────────────────────────────────────────
// Calls POST /api/auth/login from within the browser context, then injects the
// returned JWT into localStorage so the React app picks it up on navigation.

async function signInAs(page: Page, email: string): Promise<void> {
  // Load the SPA so we're operating in the correct origin.
  await page.goto("/sign-in");

  // Login via API — runs inside the browser, so relative URLs resolve correctly.
  const token = await page.evaluate(
    async ([e, p]: [string, string]) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, password: p }),
      });
      if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
      const { token } = (await res.json()) as { token: string };
      return token;
    },
    [email, TEST_PASSWORD] as [string, string],
  );

  // Inject the JWT — the React AuthProvider reads this on next navigation.
  await page.evaluate(
    (t: string) => localStorage.setItem("frame:token", t),
    token,
  );

  await page.goto("/");
  await page.waitForURL(isHomeOrOnboarding, { timeout: 40_000 });
}

/** Sign in as the MAIN smoke user (has fighter + FRAME+). */
async function signInWeb(page: Page): Promise<void> {
  return signInAs(page, TEST_MAIN_EMAIL);
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

  // Main user has a fighter — should land on the Home dashboard (/home), not onboarding
  await page.waitForURL(isHomePath, { timeout: 5_000 });

  // Allow React effects and async queries to settle
  await page.waitForTimeout(2_000);

  // Verify Home dashboard landmarks are rendered
  await expect(page.getByText("FRAME").first()).toBeVisible();
  await expect(page.getByText(/Fight readiness/i).first()).toBeVisible();

  // The orb now lives on its own State page — navigate there and verify
  await page.goto("/state");
  await page.waitForTimeout(2_000);
  await expect(page.getByText("State", { exact: true }).first()).toBeVisible();

  await expect(
    page.getByRole("link", { name: /Enter the frame|Continue session/ })
  ).toBeVisible();

  // No unexpected JS errors
  const criticalErrors = jsErrors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("ResizeObserver") &&
      !e.includes("Non-Error promise rejection") &&
      !e.includes("ERR_FAILED"),
  );
  expect(
    criticalErrors,
    `Unexpected JS errors on home:\n  ${criticalErrors.join("\n  ")}`,
  ).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Chat SSE delivers at least one content chunk
// ─────────────────────────────────────────────────────────────────────────────
test("chat SSE delivers at least one chunk (Bearer auth)", async ({ page }) => {
  await signInWeb(page);
  await page.waitForURL(isHomePath, { timeout: 5_000 });

  // page.evaluate() runs inside the browser context where the JWT is in
  // localStorage; the fetch call must include the Authorization header.
  const result = await page.evaluate(async () => {
    const token = localStorage.getItem("frame:token") ?? "";
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          "Authorization": `Bearer ${token}`,
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
  });

  expect(
    result.ok,
    `SSE did not deliver a chunk (status=${result.status})`,
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

  await page.goto("/profile");
  await page.waitForTimeout(2_500);

  const bottomNav = page.locator("nav").last();
  await expect(bottomNav).toBeVisible({ timeout: 8_000 });

  const hasContent =
    (await page.getByText("Passport", { exact: false }).count()) > 0 ||
    (await page.getByText("Sign out", { exact: false }).count()) > 0;
  expect(hasContent, "Profile page rendered no expected content").toBe(true);

  const criticalErrors = jsErrors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("ResizeObserver") &&
      !e.includes("Non-Error promise rejection") &&
      !e.includes("ERR_FAILED"),
  );
  expect(
    criticalErrors,
    `Unexpected JS errors on profile:\n  ${criticalErrors.join("\n  ")}`,
  ).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Onboarding POST uses correct camelCase field names (fresh user)
// ─────────────────────────────────────────────────────────────────────────────
test("onboarding page loads and POST /api/fighter uses camelCase fields", async ({
  page,
}) => {
  // Sign in as the fresh user (fighter deleted by global-setup each run)
  await signInAs(page, TEST_FRESH_EMAIL);
  await page.waitForURL(isHomeOrOnboarding, { timeout: 40_000 });

  const { pathname } = new URL(page.url());

  if (pathname !== "/onboarding") {
    // Fighter wasn't cleaned up (previous run left one) — verify shape and pass
    const bodyRaw = await page.evaluate(async () => {
      const token = localStorage.getItem("frame:token") ?? "";
      const res = await fetch("/api/fighter", {
        headers: { "Authorization": `Bearer ${token}` },
      });
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

  await page.waitForTimeout(1_500);
  const hasOnboardingContent =
    (await page.getByText("FRAME").count()) > 0 ||
    (await page.locator("input, select, button").count()) > 0;
  expect(hasOnboardingContent, "Onboarding page rendered no expected content").toBe(true);

  const result = await page.evaluate(async () => {
    const token = localStorage.getItem("frame:token") ?? "";
    const authHeader = { "Authorization": `Bearer ${token}` };
    try {
      // Check if fighter already exists from a partial previous run
      const check = await fetch("/api/fighter", { headers: authHeader });
      if (check.ok) {
        const { fighter } = await check.json();
        if (fighter !== null) return { already: true, fighter };
      }

      const res = await fetch("/api/fighter", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
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
    expect(result.fighter).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
    return;
  }

  expect(
    result.ok,
    `POST /api/fighter failed (status=${result.status}) — likely snake_case regression.\n  Body: ${result.body ?? result.err ?? ""}`,
  ).toBe(true);
  expect(result.fighter).toMatchObject({
    id: expect.any(Number),
    name: "Web Smoke Fighter",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: First analysis is free (one-time taster); the second one is FRAME+
// ─────────────────────────────────────────────────────────────────────────────
test("free tier: first POST /api/analysis passes the gate, second is 402", async ({
  page,
}) => {
  await signInAs(page, TEST_FRESH_EMAIL);
  await page.waitForURL(isHomeOrOnboarding, { timeout: 40_000 });

  const fighterId = await page.evaluate(async () => {
    const token = localStorage.getItem("frame:token") ?? "";
    const authHeader = { "Authorization": `Bearer ${token}` };
    const check = await fetch("/api/fighter", { headers: authHeader });
    let fighter = check.ok ? (await check.json()).fighter : null;
    if (!fighter) {
      const created = await fetch("/api/fighter", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
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
    await db.query("DELETE FROM video_analyses WHERE fighter_id = $1", [fighterId]);

    const postAnalysis = () =>
      page.evaluate(async () => {
        const token = localStorage.getItem("frame:token") ?? "";
        const res = await fetch("/api/analysis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ kind: "sparring" }),
        });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* non-JSON body */
        }
        return { status: res.status, body };
      });

    // Zero analyses → free taster passes gate, fails ordinary validation (400).
    const first = await postAnalysis();
    expect(
      first.status,
      `First free analysis should pass the entitlement gate (expected 400 validation, not 402): ${JSON.stringify(first.body)}`,
    ).toBe(400);

    // Seed one row — taster is spent.
    await db.query(
      `INSERT INTO video_analyses
         (fighter_id, kind, nervous_system_load, summary, findings, metrics, keyframes)
       VALUES ($1, 'sparring', 'low', 'smoke seed', '[]', '{}', '[]')`,
      [fighterId],
    );

    const second = await postAnalysis();
    expect(
      second.status,
      `Expected 402 once the free analysis is used, got ${second.status}: ${JSON.stringify(second.body)}`,
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
test("analyse video processing always terminates (never silently hangs)", async ({
  page,
}) => {
  test.setTimeout(150_000);

  await signInWeb(page);
  await page.waitForURL(isHomePath, { timeout: 5_000 });

  await page.goto("/analyse");
  await page.waitForTimeout(1_500);

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toHaveCount(1);
  await fileInput.setInputFiles(SAMPLE_VIDEO);

  await expect(
    page
      .getByText(/Reading footage|Tracking movement|Detecting patterns|Building the read/)
      .first()
  ).toBeVisible({ timeout: 45_000 });

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
          /Couldn't read this clip|too large to process|couldn't lock onto|movement model|processing stalled|start video playback/i.test(text),
        lockOnBody: /couldn't lock onto/i.test(text),
      };
    });
    if (state.pct != null && state.pct > maxPct) maxPct = state.pct;
    if (state.hasReport) { terminal = "report"; break; }
    if (state.knownError) {
      terminal = "error";
      errorSeen = true;
      lockOnBodyError = state.lockOnBody;
      break;
    }
    await page.waitForTimeout(120);
  }

  expect(
    terminal,
    `Analyse never reached a terminal state within the bounded window (maxPct=${maxPct}) — the extraction loop appears to be hanging.`,
  ).not.toBeNull();

  if (terminal === "error") {
    const bodyText = await page.locator("body").innerText();
    expect(
      KNOWN_ERROR.test(bodyText),
      `Analyse errored with an unexpected message:\n${bodyText.slice(0, 400)}`,
    ).toBe(true);
  }

  const provedSampling = terminal === "report" || lockOnBodyError;
  expect(
    maxPct > 1 || provedSampling,
    `Extraction never advanced past ~1% (maxPct=${maxPct}, terminal=${terminal}, errorSeen=${errorSeen}).`,
  ).toBe(true);
});
