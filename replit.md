# Synochi BJJ Coach

A personal Claude-wrapped BJJ + nervous-system coach that uses the user's own Obsidian vault ("SYNOCHI") as its knowledge base and builds an evolving, structured athlete model from every interaction.

Multi-user via Replit-managed Clerk (email+password + Google/Apple/GitHub SSO). Each Clerk user owns one fighter row; all data is partitioned by `users.clerkUserId` (FK `fighters.userId`). Signed-out users see the public `PublicLandingPage`; signed-in users see the FRAME home → onboarding (JIT) → app. To rename the Clerk sign-in header / consent screen branding ("Sign in to <app name>"), use the workspace Auth pane.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port from PORT env)
- `pnpm --filter @workspace/coach run dev` — chat frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` (Clerk vars auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Anthropic SDK (coach: claude-sonnet-4-6, memory writer: claude-haiku-4-5)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Tailwind 4 + wouter + TanStack Query
- Streaming: raw SSE (no Orval codegen — SSE can't be generated)

## Where things live

- `artifacts/api-server/src/synochi/` — raw Obsidian vault (7 folders, ~558 notes, source of truth)
- `artifacts/api-server/build-synochi.mjs` — bundler; runs as `prebuild`, regenerates `src/lib/synochi.generated.ts`
- `artifacts/api-server/src/lib/synochi.ts` — FRAME system prompt: two-layer architecture (Layer 1 immutable philosophy + Layer 2 adaptive expression), then SYNOCHI vault as anchored knowledge framework, gauge/match/check protocol, drill block contract, hard rules
- `artifacts/api-server/src/lib/memoryExtractor.ts` — post-turn Claude tool-use call that writes `athlete_facts`
- `artifacts/api-server/src/lib/factsService.ts` — add / supersede / resolve / query active facts
- `artifacts/api-server/src/lib/calibrationBank.ts` — calibration MCQ bank + rotation logic
- `artifacts/api-server/src/routes/` — `coach.ts` (SSE chat + fires memory extraction), `fighter.ts`, `conversation.ts`, `calibration.ts`, `memory.ts`, `planner.ts` (weekly plan CRUD + item completion)
- `artifacts/api-server/src/lib/plannerService.ts` — weekly plan generator (Claude tool-use OR OpenAI JSON mode, picked from active conversation's `aiProvider`), validation (every item must cite a real fact id or calibration key, ≥5 items, ≥3 distinct categories, refuse-and-retry once), `weekly_plans` upsert per ISO-Monday-UTC week
- `artifacts/api-server/src/lib/competitionService.ts` — Competition Mode: `getActiveCompetition` (soonest active comp with `eventDate >= startOfToday` so it stays live through the whole event day), `pressureFor` (daysToEvent/daysToWeighIn + tier), `tierFor` (base/build/sharpen/peak/fight_week by 42/14/7/3 days), `competitionPromptBlock` (tier-scaled sternness injected into coach context). Routes in `routes/competition.ts` (GET active+pressure, GET list, POST, PATCH, DELETE soft-cancel)
- `artifacts/api-server/src/lib/vocabulary.ts` — `computeVocabulary(facts)` derives a 0-5 term-density tier from count of active `technical_knowledge` facts (1/3/6/10/15 thresholds); persisted to `fighters.vocabularyLevel` as a high-water mark and injected into chat + welcome prompts to calibrate language density
- `lib/db/src/schema/` — `users` (PK `clerkUserId`), `fighters` (FK `userId` → users.clerkUserId, unique → 1 fighter per user), `conversations`, `messages`, `calibrations`, `athlete_facts`, `weekly_plans` + `weekly_plan_item_completions` (plus legacy `athlete_signals`, unused)
- `artifacts/api-server/src/middlewares/authMiddleware.ts` — `requireAuth` mounted globally (except `/healthz`) sets `req.clerkUserId`; `getUserFighter(req)` JIT-creates the `users` row then returns this user's fighter (or null). All routes use `getUserFighter(req)` instead of singleton lookup.
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — Clerk FAPI proxy mounted at `/api/__clerk` before body parsers.
- `artifacts/coach/src/pages/landing.tsx` — public landing for signed-out users (FRAME branding + Sign in / Create account CTAs)
- `artifacts/coach/src/pages/sign-in.tsx`, `sign-up.tsx` — Clerk `<SignIn>` / `<SignUp>` mounted at `/sign-in/*?` and `/sign-up/*?` (wildcard required for OAuth sub-paths).
- `artifacts/coach/src/pages/` — `onboarding.tsx`, `home.tsx` (FRAME-style landing with big spinning orb + Enter Frame CTA), `chat.tsx`, `profile.tsx` (fighter info + inline athlete-model panel), `planner.tsx` (weekly plan list with checkable items, source line per item, `?` help overlay)
- `artifacts/coach/src/components/` — `message-content.tsx`, `drill-card.tsx`, `nervous-system-orb.tsx` (small header indicator), `cosmic-orb.tsx` (big home-page orb: pure CSS biological dark sphere — radial shading + soft bloom + breath scale + atmospheric drift, no crosshair/rings/topo/RAF, 9 state variants tuned as nervous-system temperatures), `bottom-nav.tsx` (Home/Chat/Profile/Planner tabs, `grid-cols-4`), `calibration-card.tsx`, `memory-sheet.tsx` (legacy, no longer mounted)
- `artifacts/coach/src/hooks/use-frame-state.ts` — interpretive state derivation: keyword regex over recent 12 active facts → one of Dormant/Stable/Loaded/Recovering/Tight/Volatile/Composed/Overextended, first-match-wins, honest fallbacks, `source` string exposed via title tooltip for provenance. No fake biometrics, no numeric scores.

## Architecture decisions

- **Two-layer prompt architecture.** Layer 1 (immutable philosophy: identity, posture, NEVER list, value priority, signal phrases) sits above Layer 2 (adaptive expression: register mirroring, banter default-on, sentence cadence). Named explicitly in the prompt so the model has a place to put each instruction — Layer 1 stays still while Layer 2 breathes. FRAME is the persona, SYNOCHI is the knowledge framework underneath. See `.agents/memory/frame-two-layer-architecture.md`.
- **No-fake-biometrics state.** The home orb label only ever shows interpretive words (Stable/Loaded/Recovering/Tight/Volatile/Composed/Overextended/Dormant) derived deterministically from real recorded `athlete_facts`. Never percentages, readiness scores, fatigue indices. Provenance is surfaced via `title=` tooltip. Restraint over engagement is a HARD product constraint — no streaks, no counters, no dopamine loops.
- **Vault baked into the build.** The full SPINE/IDENTITY/PROTOCOLS/Interaction Psychology/Guidance Dynamics layers are included verbatim; MODELS/MECHANISMS are a title+blurb index. ~100K tokens, sent as a single cached system block on every request.
- **System prompt = static (cached) + dynamic (per-fighter).** Static block has `cache_control: ephemeral`. Dynamic block injects fighter profile + all active facts grouped by category + recent calibration answers.
- **Conversation state lives server-side.** Frontend POSTs only the new `content`; the server loads full history from Postgres, calls Anthropic, persists the assistant reply.
- **Structured long-term memory in `athlete_facts`.** Categories: `strength | weakness | technical_knowledge | pattern | preference | event | goal | context`. Each fact has confidence (1-5), status (`active | superseded | resolved`), and source. Superseding preserves history; resolving marks a closed weakness/goal.
- **Memory writer runs after every assistant reply** as a separate Claude call (haiku, tool-use only — `add_fact` / `supersede_fact` / `resolve_fact`). Fire-and-forget: the user already got their reply; updates land before the next turn. Conservative system prompt: only durable observations, prefer supersede over duplicate.
- **Coach is told to anchor every technical claim** in the vault or the athlete's recorded model. Outside that, it names the gap and asks rather than fabricating.
- **Gauge → Match → Check pedagogy.** Before instructing on a new technical topic, the coach checks for a `technical_knowledge` fact on that topic; if none, it asks one short calibration question, then matches delivery depth to the recorded level. After a non-trivial concept it asks one short check.
- **Auth via Replit-managed Clerk.** Web app uses cookie session (no `Authorization` headers, no `getToken()` in browser code). Server: `clerkMiddleware(publishableKeyFromHost)` → `requireAuth` global on `/api/*` except `/healthz`. Client: `ClerkProvider` wraps app, `publishableKey = publishableKeyFromHost(window.location.hostname, VITE_CLERK_PUBLISHABLE_KEY)`, `proxyUrl = VITE_CLERK_PROXY_URL` (empty in dev, set in prod — do NOT gate on `PROD`). Tailwind v4: `@layer theme, base, clerk, components, utilities;` before `@import "tailwindcss"`, and `tailwindcss({ optimize: false })` in `vite.config.ts`. Sign-in/up styled via `clerkAppearance` (dark theme + FRAME variables).
- **One fighter per user.** `fighters.userId` is `unique notNull` referencing `users.clerkUserId` cascade. `getUserFighter()` JIT-creates the users row on first authed call so fresh sign-ups onboard cleanly. `insertFighterSchema` omits `userId` — the server injects it.
- **Drill prescriptions** as fenced ` ```drill ` JSON blocks; the frontend parses them into drill cards.
- **Calibration MCQs** surface after every 3 user messages; answers go into both `calibrations` AND `athlete_facts` (as low-confidence patterns) so they feed the next prompt.
- **Competition Mode.** A fighter can schedule a comp (event date / weigh-in / target+current weight / notes). When a comp is active (`eventDate >= startOfToday` — stays live through the whole event day), a tier-scaled red `CompetitionBanner` shows the countdown on Home + Chat (reached via the banner or the Profile "Competition mode" link — no bottom-nav tab), and a sternness directive is injected into the coach prompt that ramps base→build→sharpen→peak→fight_week as the date nears. No fake biometrics, no hype — pressure lives in the standard held, not in volume.
- **Coaching depth (prompt + UI).** (1) Tap-to-simplify: heavy terms in coach replies are dotted-underline tappable, opening a one-line plain-English gloss from a curated `lib/glossary.ts` (deterministic — only terms we have a real definition for). (2) Vocabulary growth: `computeVocabulary` term-density tier (see vocabulary.ts) rises with recorded technical knowledge and steers prompt language density; shown on Profile as "Tier N/5" + "Concepts held". (3) Sharper first-contact: the welcome briefing branches on zero facts into a funnier archetype read that refuses to fake deep knowledge. (4) `synochi.ts` prompt has explicit "Adaptive friction scaling" (how hard to push is a dial set by state/model, not mood) and "Frame integrity" (protect structural composure; one load-bearing fix at a time) sections.

## Product

Mobile-first 3-tab app (will be wrapped in a mobile shell). All routes gated by `useFighter()`; first-run shows onboarding.

1. **Onboarding** — name, age, art, level, frequency, goals, weaknesses, competes. Seeds the model.
2. **Home (`/`)** — quiet, dark, restrained: FRAME / CALIBRATION SYSTEM wordmark, profile shortcut (shield icon), biological CosmicOrb centered, interpretive STATE label (Dormant/Stable/Loaded/Recovering/Tight/Volatile/Composed/Overextended, derived honestly from recorded facts, tooltip shows source), doorway-style "Enter" CTA (border-y only, no fill, no shadow) → `/chat`. No tagline, no counters, no engagement loops.
3. **Chat (`/chat`)** — ChevronLeft back to Home, fighter name + nervous-system orb in header, quick actions (Analyse session, Build drill, Fix my game, Competition prep, Regulate, Reflect), persistent history, periodic calibration prompts. Mobile flex layout (footer in flow, not fixed) with BottomNav at end.
4. **Profile (`/profile`)** — fighter avatar/stats/goals/weaknesses + athlete-model grouped by category (Weaknesses, Strengths, Technical knowledge, Recurring patterns, Coaching preferences, Active goals, Recent events, Life context) with confidence and source per fact. Refreshes ~1.5s after each chat reply.
5. **Bottom nav** — Home / Chat / Profile tabs, wouter Links, `env(safe-area-inset-bottom)` aware, active tab in primary color.
6. Coach speaks in the vault's voice, references `[[concepts]]`, anchors claims to the framework or the athlete's recorded model, and emits drill blocks when prescribing.

## User preferences

- No emojis in UI or in coach output.
- Coach never breaks character / never refers to itself as Claude/AI.
- Voice: direct, structural, no padding, no flattery.

## Gotchas

- After editing the vault content under `artifacts/api-server/src/synochi/`, the prebuild script regenerates `synochi.generated.ts` automatically on next `dev`/`build`.
- Composite libs (`lib/db`) emit `.d.ts` — after schema changes, `pnpm run typecheck:libs` (or `pnpm run typecheck`) before checking artifact typecheck.
- Streaming endpoint is `POST /api/coach/chat` with body `{ content: string }` and returns SSE `data: {content|done|error}` events.
- Drill blocks must be valid JSON inside ` ```drill ... ``` ` fences — the parser silently skips invalid ones.
- Memory extraction runs ~3-12s after stream end. Frontend invalidates the `memory` query 1.5s after `isStreaming` flips off; opening the panel sooner just shows the previous state.
- `athlete_signals` table still exists for back-compat but is no longer written to; all new memory goes into `athlete_facts`.
- Clerk auth: do not add NODE_ENV/PROD gates around `proxyUrl` or `publishableKey`; do not hard-code the proxy path; do not use `<UserButton>` (skill forbids it — we have a custom Sign out button on Profile). Sign-in/up routes must be `path="/sign-in/*?"` and `"/sign-up/*?"` verbatim (the `/*?` wildcard catches OAuth callbacks). DB was wiped during the auth migration (no per-user backfill of prior singleton data).
- Planner keys weeks by `isoMondayUTC()` (Monday 00:00 UTC). One plan per fighter per week; regenerate wipes existing completions because new item keys won't match. Completing an item writes a `pattern` fact with `source = "planner:item:<key>"` (confidence 2); un-completing resolves any planner-sourced facts for that key. Generator routes through the active conversation's `aiProvider` (Claude → tool_use, OpenAI → response_format json_object). Validation refuses any plan that has items without a real fact id / calibration key, fewer than 5 items, or fewer than 3 distinct categories — retries once before erroring.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- See the `database` skill for production DB queries.
