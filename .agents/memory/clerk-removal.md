---
name: Custom JWT auth — post-Clerk architecture
description: Durable decisions for the in-house email+password system that replaced Clerk. Guards future additions to auth, new route protection, and cross-account cache isolation.
---

# Custom JWT auth — post-Clerk architecture

**Why Clerk was removed:** Clerk verification codes never arrived on TestFlight (iOS). Full removal accepted data loss (small beta) over debugging a third-party DNS/delivery issue.

## Token contract
- All API requests carry `Authorization: Bearer <token>` — no cookies.
- JWT: HS256, 90-day TTL (`TOKEN_TTL` in `routes/auth.ts`), signed with `SESSION_SECRET`. Sliding: clients swap it via `POST /api/auth/refresh` on every launch. Only a real 401 from `/auth/refresh` (or an explicit Log out) clears the saved token — never offline/5xx/timeouts.
- Storage: `localStorage["frame:token"]` (coach web and the frame-mobile web build), `expo-secure-store["frame.token"]` (native mobile, `AFTER_FIRST_UNLOCK`). SecureStore rejects `:` in keys ("Invalid key") — the old `frame:token` native key made every save throw, so every cold start went to sign-in. Never put a colon back in the native key (see `frame-mobile/lib/tokenBackend.ts`).
- `verifyToken()` in `routes/auth.ts` is the single decoding entry point; `requireAuth` middleware calls it and sets `req.userId`.
- Tokens are not currently revocable. Password change (next feature) must reissue a token and discard the old one. TTL (90d, sliding) bounds an unused token.

## Users table PK
- PK is now `id` (UUID text), NOT `clerk_user_id`.
- Fields: `id`, `email` (unique), `hashed_password` (bcryptjs, 10 rounds).
- Users created ONLY via `POST /api/auth/register` — no JIT auto-create fallback.
- A valid JWT with no matching `users` row is stale/invalid → `getUserFighter()` returns null. Fail closed.

## Auth security controls
- **Password policy**: minimum 8 characters, enforced server-side via `validatePassword()`.
- **Rate limiting**: `rateLimitCheck()` in `routes/auth.ts` — injectable `Map` store for test isolation. Login: 10 attempts / 15 min per IP. Register: 5 attempts / 15 min per IP.
- **Generic failure messages**: login always returns "Incorrect email or password" whether the account exists or not; rate-limit error is generic ("Too many requests").
- **Timing attack guard**: login always runs `bcrypt.compare` even for unknown accounts (compares against a fake hash) to prevent timing-based account enumeration.

## Cross-account cache isolation
- Both web (`App.tsx`) and mobile (`_layout.tsx`) include `UserScopedQueryReset`.
- It calls `queryClient.clear()` when `userId` changes (sign-out or identity switch).
- Mobile query keys are currently identity-free — this reset is the primary isolation guard. New queries should scope keys by `userId` as defence-in-depth.

## Smoke test auth pattern
- `e2e/global-setup.ts` creates test accounts via bcryptjs + direct DB insert (no API server dependency at setup time).
- `signInAs(page, email)` in smoke spec calls `/api/auth/login` from within the browser context, then injects token via `localStorage.setItem("frame:token", token)`.
- All `page.evaluate()` fetch calls include `Authorization: Bearer <token>` — no `credentials: "include"`.
- The web chat SSE fetch in `use-chat.ts` injects the bearer token via `authHeaders()` (exported from `lib/api.ts`).

## How to apply
- New protected routes: use `req.userId` (set by `requireAuth`). Look up user via `usersTable.id`.
- New smoke fixtures: add `upsertUser(db, email)` calls in `e2e/global-setup.ts`.
- DB changes: `pnpm --filter @workspace/db run generate` then `pnpm --filter @workspace/db run migrate`.

## Upgrade from old Clerk schema
Migration `0000_nostalgic_madame_masque.sql` includes a DO block that detects the old Clerk schema
(`clerk_user_id` column in users) and drops all tables before creating the JWT schema. This is
self-contained — run `pnpm --filter @workspace/db run migrate` on any starting state (fresh, Clerk, or JWT).
Data loss on Clerk upgrade is intentional (credentials unportable). `scripts/reset-schema.sql` is a
manual alternative for operators who prefer an explicit pre-step.
