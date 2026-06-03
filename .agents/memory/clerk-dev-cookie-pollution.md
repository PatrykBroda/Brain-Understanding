---
name: Clerk dev 401 — cookie pollution & third-party cookies
description: Why a signed-in dev user can get all-null getAuth (401 on every /api/*) even when keys/instance/secret are all correct.
---

# Symptom

Signed-in user gets 401 on every `/api/*`; `getAuth(req)` returns
`{ tokenType: "session_token", ...everything null, isAuthenticated: false }`
with NO reason. All config checks pass.

# How to rule out config FIRST (do this before suspecting a code bug)

These were ALL verified correct in the real incident — don't re-chase them blindly,
but this is the checklist that proves it's not config:
- `CLERK_PUBLISHABLE_KEY` == `VITE_CLERK_PUBLISHABLE_KEY` (same instance).
- Secret belongs to the SAME instance: fetch FAPI JWKS (`https://<slug>.clerk.accounts.dev/.well-known/jwks.json`)
  and Backend API JWKS (`https://api.clerk.com/v1/jwks` with `Authorization: Bearer $CLERK_SECRET_KEY`)
  — the `kid`s must match. `GET /v1/users/<sub>` with the secret → 200 proves the user lives in that instance.
- Decode the `__session` cookie payload: `iss`/`azp`/`sub` correct, `exp` in the future at request time.

# Root cause (the real one)

Two compounding dev-only browser-state issues, NOT a server bug:

1. **Duplicate, parent-domain-scoped stale cookies.** Long-lived `*.replit.dev` dev
   domains accumulate Clerk cookies at TWO scopes after auth migrations / key churn.
   Every Clerk cookie (`__session`, `__session_<suffix>`, `__client_uat*`, `__clerk_db_jwt*`)
   appears twice — one STALE (e.g. days-expired) on a parent domain (`.replit.dev`) and one
   FRESH on the subdomain. The browser sends the parent-domain (stale) copy FIRST, so it
   **shadows** the fresh one. Clerk reads the expired token → signed-out / handshake that
   can't complete → all-null. Tell-tale in logs: same cookie name listed 2x; two decoded
   `__session` payloads, `sessions[0]` expired & `sessions[1]` fresh.

2. **Dev does not proxy Clerk → FAPI is third-party.** In dev the Clerk proxy is a no-op,
   so the browser talks to the real `<slug>.clerk.accounts.dev` (a different domain = THIRD
   PARTY). **Incognito blocks third-party cookies by default**, so incognito sign-in fails in
   dev and is NOT a valid test. Production proxies Clerk to first-party (`/api/__clerk`), so
   prod is unaffected.

# Fix

Client-side only: clear ALL `replit.dev` cookies (including parent-domain ones) or use a
fresh browser profile in a NORMAL (non-incognito) window, then sign in. Positive signal that
the fix worked: the signed-in route mounts (an authenticated `/api/*` call succeeds instead
of 401).

**Why:** the server config is canonical and correct; the failure is polluted browser cookie
state on the shared dev domain. Do NOT hack Clerk cookie reading or add a custom verify path —
the clerk-auth skill forbids it and it would mask a non-bug.

# Debugging tip

The browser does NOT auto-poll `/api/fighter` (React Query won't refetch behind the error
screen), so you need the user to reload to get a request. A clean browser request may hit a
different server PID than the one you're tailing — trust the browser console signal
(`THREE.Clock` = Home mounted) over hunting for the `/api/fighter` 200 across rotated logs.
