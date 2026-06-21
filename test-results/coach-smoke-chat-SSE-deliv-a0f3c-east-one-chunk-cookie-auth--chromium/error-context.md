# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: coach-smoke.spec.ts >> chat SSE delivers at least one chunk (cookie auth)
- Location: e2e/coach-smoke.spec.ts:85:5

# Error details

```
Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://localhost/
Call log:
  - navigating to "http://localhost/", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This page isn’t working" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: localhost
      - text: is currently unable to handle this request.
    - generic [ref=e10]: HTTP ERROR 502
  - button "Reload" [ref=e13] [cursor=pointer]
```

# Test source

```ts
  1   | /**
  2   |  * Coach web-app smoke tests – cover the React/Vite frontend at `/`.
  3   |  *
  4   |  * Guards three regression categories:
  5   |  *
  6   |  *  1. sign-in-home          — signed-in user reaches the FRAME home page
  7   |  *                             with no JS errors (CosmicOrb + State label
  8   |  *                             rendered, "Enter" CTA present).
  9   |  *
  10  |  *  2. chat-SSE              — POST /api/coach/chat (cookie auth, no Bearer)
  11  |  *                             returns at least one {content} or {done} chunk.
  12  |  *
  13  |  *  3. profile-no-crash      — /profile loads without JS errors; athlete-state
  14  |  *                             panel and bottom nav are present in the DOM.
  15  |  *
  16  |  * Auth:
  17  |  *   Same two Clerk accounts provisioned by global-setup.ts.
  18  |  *   @clerk/testing/playwright `clerk.signIn()` uses the ticket strategy.
  19  |  *   The web coach app uses cookie-based sessions (no Authorization header),
  20  |  *   so same-origin fetches from page.evaluate() carry the session automatically.
  21  |  */
  22  | import { test, expect, type Page } from "@playwright/test";
  23  | import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
  24  | import { TEST_MAIN_EMAIL } from "./global-setup";
  25  | 
  26  | const BASE = "";
  27  | 
  28  | // ─── Auth helper ──────────────────────────────────────────────────────────────
  29  | 
  30  | async function signInWeb(page: Page): Promise<void> {
> 31  |   await page.goto(`${BASE}/`);
      |              ^ Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://localhost/
  32  |   await setupClerkTestingToken({ page });
  33  |   await clerk.signIn({ page, emailAddress: TEST_MAIN_EMAIL });
  34  |   await page.goto(`${BASE}/`);
  35  |   // After a successful sign-in the app either stays on / (home) or redirects
  36  |   // to /onboarding for first-run users; main test user always has a fighter.
  37  |   await page.waitForURL(/^\/$|^\/onboarding/, { timeout: 40_000 });
  38  | }
  39  | 
  40  | // ─────────────────────────────────────────────────────────────────────────────
  41  | // Test 1: Sign-in lands on FRAME home — no JS errors
  42  | // ─────────────────────────────────────────────────────────────────────────────
  43  | test("sign-in lands on FRAME home with no JS errors", async ({ page }) => {
  44  |   const jsErrors: string[] = [];
  45  |   page.on("pageerror", (err) => jsErrors.push(err.message));
  46  |   page.on("console", (msg) => {
  47  |     if (msg.type() === "error") jsErrors.push(msg.text());
  48  |   });
  49  | 
  50  |   await signInWeb(page);
  51  | 
  52  |   // Main user has a fighter — should be on home (/), not onboarding
  53  |   await page.waitForURL(/^\/$/, { timeout: 5_000 });
  54  | 
  55  |   // Allow React effects and async queries to settle
  56  |   await page.waitForTimeout(2_000);
  57  | 
  58  |   // Verify home landmarks are rendered
  59  |   // "FRAME" wordmark in the header
  60  |   await expect(page.getByText("FRAME").first()).toBeVisible();
  61  | 
  62  |   // State section exists (font-mono "State" label)
  63  |   await expect(page.getByText("State")).toBeVisible();
  64  | 
  65  |   // "Enter" CTA present
  66  |   await expect(page.getByText("Enter").first()).toBeVisible();
  67  | 
  68  |   // No unexpected JS errors (filter out known benign browser noise)
  69  |   const criticalErrors = jsErrors.filter(
  70  |     (e) =>
  71  |       !e.includes("favicon") &&
  72  |       !e.includes("ResizeObserver") &&
  73  |       !e.includes("Non-Error promise rejection") &&
  74  |       !e.includes("ERR_FAILED") // R3F WebGL context warnings in headless
  75  |   );
  76  |   expect(
  77  |     criticalErrors,
  78  |     `Unexpected JS errors on home:\n  ${criticalErrors.join("\n  ")}`
  79  |   ).toHaveLength(0);
  80  | });
  81  | 
  82  | // ─────────────────────────────────────────────────────────────────────────────
  83  | // Test 2: Chat SSE delivers at least one content chunk
  84  | // ─────────────────────────────────────────────────────────────────────────────
  85  | test("chat SSE delivers at least one chunk (cookie auth)", async ({ page }) => {
  86  |   await signInWeb(page);
  87  |   await page.waitForURL(/^\/$/, { timeout: 5_000 });
  88  | 
  89  |   // The web coach app uses cookies — no Authorization header required.
  90  |   // page.evaluate() runs inside the browser context where the session cookie
  91  |   // is already set, so the fetch call carries it automatically.
  92  |   const result = await page.evaluate(async () => {
  93  |     try {
  94  |       const res = await fetch("/api/coach/chat", {
  95  |         method: "POST",
  96  |         headers: {
  97  |           "Content-Type": "application/json",
  98  |           Accept: "text/event-stream",
  99  |         },
  100 |         credentials: "include",
  101 |         body: JSON.stringify({ content: "ping" }),
  102 |       });
  103 |       if (!res.ok) return { ok: false, status: res.status };
  104 | 
  105 |       const reader = res.body?.getReader();
  106 |       if (!reader) return { ok: false, status: 0 };
  107 | 
  108 |       const decoder = new TextDecoder();
  109 |       let buf = "";
  110 |       const start = Date.now();
  111 | 
  112 |       while (Date.now() - start < 50_000) {
  113 |         const { done, value } = await reader.read();
  114 |         if (done) break;
  115 |         buf += decoder.decode(value, { stream: true });
  116 |         if (buf.includes('"content"') || buf.includes('"done"')) {
  117 |           reader.cancel().catch(() => {});
  118 |           return { ok: true, status: res.status };
  119 |         }
  120 |       }
  121 |       reader.cancel().catch(() => {});
  122 |       return { ok: false, status: res.status, buf: buf.slice(0, 200) };
  123 |     } catch (e: unknown) {
  124 |       return { ok: false, status: -1, err: String(e) };
  125 |     }
  126 |   });
  127 | 
  128 |   expect(
  129 |     result.ok,
  130 |     `SSE did not deliver a chunk (status=${result.status})`
  131 |   ).toBe(true);
```