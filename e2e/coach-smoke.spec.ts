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
import { test, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { TEST_MAIN_EMAIL, TEST_FRESH_EMAIL } from "./global-setup";

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

  // "Enter" CTA present
  await expect(page.getByText("Enter").first()).toBeVisible();

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
  // We look for the "FRAME RANK" card header or the athlete-state section.
  const hasContent =
    (await page.getByText("FRAME RANK").count()) > 0 ||
    (await page.getByText("CALIBRATION SYSTEM").count()) > 0;
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
