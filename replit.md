# Synochi BJJ Coach

A personal Claude-wrapped BJJ + nervous-system coach that uses the user's own Obsidian vault ("SYNOCHI") as its knowledge base and builds an evolving athlete model from interactions and calibration data.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port from PORT env)
- `pnpm --filter @workspace/coach run dev` — chat frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Anthropic SDK (claude-sonnet-4-6)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Tailwind 4 + wouter + TanStack Query
- Streaming: raw SSE (no Orval codegen — SSE can't be generated)

## Where things live

- `artifacts/api-server/src/synochi/` — raw Obsidian vault (7 folders, ~558 notes, source of truth)
- `artifacts/api-server/build-synochi.mjs` — bundler; runs as `prebuild`, regenerates `src/lib/synochi.generated.ts`
- `artifacts/api-server/src/lib/synochi.ts` — coach system prompt (static + dynamic builder)
- `artifacts/api-server/src/lib/calibrationBank.ts` — calibration question bank + rotation logic
- `artifacts/api-server/src/routes/` — `coach.ts` (SSE chat), `fighter.ts`, `conversation.ts`, `calibration.ts`
- `lib/db/src/schema/` — `fighters`, `conversations`, `messages`, `calibrations`, `athlete_signals`
- `artifacts/coach/src/pages/` — `onboarding.tsx`, `chat.tsx`
- `artifacts/coach/src/components/` — `message-content.tsx` (markdown + drill block parser), `drill-card.tsx`, `nervous-system-orb.tsx`, `calibration-card.tsx`

## Architecture decisions

- **Vault baked into the build.** The full SPINE/IDENTITY/PROTOCOLS/Interaction Psychology/Guidance Dynamics layers are included verbatim; MODELS/MECHANISMS are a title+blurb index. ~100K tokens, sent as a single cached system block on every request so Claude prompt-caching keeps it cheap.
- **System prompt = static (cached) + dynamic (per-fighter).** Static block has `cache_control: ephemeral`. Dynamic block injects fighter profile, accumulated athlete signals, and recent calibration answers.
- **Conversation state lives server-side.** Frontend POSTs only the new `content`; the server loads full history from Postgres, calls Anthropic, persists the assistant reply.
- **Single fighter, no auth.** This is a personal tool. `fighters` table is treated as a singleton (first row).
- **Drill prescriptions as fenced ` ```drill ` JSON blocks** in the assistant stream — the frontend parses them out and renders structured drill cards.
- **Calibration MCQs surface after every 3 user messages in-session** — answers create `athlete_signals` rows that feed the next system prompt.

## Product

A coaching chat at `/`:
1. First-time users get an onboarding form (name, age, art, level, frequency, goals, weaknesses, competes).
2. After that, the chat opens with quick actions (Analyse session, Build drill, Fix my game, Competition prep, Regulate, Reflect), a nervous-system orb, persistent history, and periodic calibration prompts.
3. Coach speaks in the vault's voice, references `[[concepts]]` from the framework, and emits drill blocks when prescribing.

## User preferences

- No emojis in UI or in coach output.
- Coach never breaks character / never refers to itself as Claude/AI.
- Voice: direct, structural, no padding, no flattery.

## Gotchas

- After editing the vault content under `artifacts/api-server/src/synochi/`, the prebuild script regenerates `synochi.generated.ts` automatically on next `dev`/`build`.
- Composite libs (`lib/db`) emit `.d.ts` — after schema changes, `pnpm run typecheck:libs` (or `pnpm run typecheck`) before checking artifact typecheck.
- Streaming endpoint is `POST /api/coach/chat` with body `{ content: string }` and returns SSE `data: {content|done|error}` events.
- Drill blocks must be valid JSON inside ` ```drill ... ``` ` fences — the parser silently skips invalid ones (and treats them as text mid-stream).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- See the `database` skill for production DB queries.
