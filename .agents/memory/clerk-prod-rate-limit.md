---
name: Clerk "Too many requests" on published app
description: Why the published Replit-managed Clerk app 429s on sign-up, and why the fix is re-publish (not code).
---

# Clerk "Too many requests" (429) on the published app

Symptom: real users on the PUBLISHED `.replit.app` app see "Too many requests. Please try again in a bit." on sign-up / sign-in. Production deployment logs show `POST /api/__clerk/v1/client/sign_ups` returning `429` with a very fast response time (~28ms). Telltale timeline: an earlier production sign-up succeeds end-to-end, then a later one (even ~90 min later, not a rapid retry) fast-rejects with 429.

## What it means
This is the signature of the **development (test) Clerk instance's strict usage caps** being hit — which means the deployed build is effectively running on test keys (`pk_test`/`sk_test`) instead of live keys. Replit-managed Clerk uses test keys in dev and swaps to live keys at publish time, but the frontend bakes `VITE_CLERK_PUBLISHABLE_KEY` at BUILD time, so a deployment that predates live-key provisioning keeps serving the test key until re-published. Live Clerk keys have no MAU limit and generous rate limits, so a properly-published app should not 429 normal users.

## The rule
**Do NOT treat this as a code bug.** The canonical Replit-managed Clerk wiring (client `publishableKeyFromHost` + unconditional `proxyUrl`, server `clerkMiddleware` + `clerkProxyMiddleware`, `/sign-in/*?` & `/sign-up/*?` routes) being intact means the bug is operational, not code.

**Why:** diffing this app's auth wiring against the clerk-auth `setup-and-customization.md` showed zero divergence, yet prod still 429'd — proving the problem sits in which keys the deployment runs, not in code. A `@clerk/*` SDK bump is irrelevant: the deployed app loads Clerk's HOSTED runtime (`clerk-js`/`ui`) through the proxy CDN, and rate limits are enforced server-side at Clerk, independent of the bundled React-binding version.

**How to apply:** when you see 429 on the published app's sign-up, (1) re-publish the app so the live keys bake into the build; (2) have the user verify in Publishing → Overview → Adjust settings that prod `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` are `pk_live`/`sk_live`; (3) have a fresh user retry on the `.replit.app` URL and confirm `sign_ups` returns 200 in the deployment logs. Never hand-edit/rotate the Clerk secrets (auto-managed; manual edits break the swap) and never push the user toward the external Clerk dashboard.
