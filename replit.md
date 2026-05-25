# Synochi BJJ Coach

A personal Claude-wrapped BJJ + nervous-system coach that uses the user's own Obsidian vault ("SYNOCHI") as its knowledge base and builds an evolving, structured athlete model from every interaction.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port from PORT env)
- `pnpm --filter @workspace/coach run dev` — chat frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Anthropic SDK (coach: claude-sonnet-4-6, memory writer: claude-haiku-4-5)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Tailwind 4 + wouter + TanStack Query
- Streaming: raw SSE (no Orval codegen — SSE can't be generated)

## Where things live

- `artifacts/api-server/src/synochi/` — raw Obsidian vault (7 folders, ~558 notes, source of truth)
- `artifacts/api-server/build-synochi.mjs` — bundler; runs as `prebuild`, regenerates `src/lib/synochi.generated.ts`
- `artifacts/api-server/src/lib/synochi.ts` — coach system prompt (static + dynamic builder; anchoring + gauge/match/check protocol)
- `artifacts/api-server/src/lib/memoryExtractor.ts` — post-turn Claude tool-use call that writes `athlete_facts`
- `artifacts/api-server/src/lib/factsService.ts` — add / supersede / resolve / query active facts
- `artifacts/api-server/src/lib/calibrationBank.ts` — calibration MCQ bank + rotation logic
- `artifacts/api-server/src/routes/` — `coach.ts` (SSE chat + fires memory extraction), `fighter.ts`, `conversation.ts`, `calibration.ts`, `memory.ts`
- `lib/db/src/schema/` — `fighters`, `conversations`, `messages`, `calibrations`, `athlete_facts` (plus legacy `athlete_signals`, unused)
- `artifacts/coach/src/pages/` — `onboarding.tsx`, `home.tsx` (FRAME-style landing with big spinning orb + Enter Frame CTA), `chat.tsx`, `profile.tsx` (fighter info + inline athlete-model panel)
- `artifacts/coach/src/components/` — `message-content.tsx`, `drill-card.tsx`, `nervous-system-orb.tsx` (small header indicator), `cosmic-orb.tsx` (big home-page orb: CSS/SVG topo band drift + glow + crosshair, no Three.js), `bottom-nav.tsx` (Home/Chat/Profile tabs), `calibration-card.tsx`, `memory-sheet.tsx` (legacy right-side panel, no longer mounted — model lives on Profile)

## Architecture decisions

- **Vault baked into the build.** The full SPINE/IDENTITY/PROTOCOLS/Interaction Psychology/Guidance Dynamics layers are included verbatim; MODELS/MECHANISMS are a title+blurb index. ~100K tokens, sent as a single cached system block on every request.
- **System prompt = static (cached) + dynamic (per-fighter).** Static block has `cache_control: ephemeral`. Dynamic block injects fighter profile + all active facts grouped by category + recent calibration answers.
- **Conversation state lives server-side.** Frontend POSTs only the new `content`; the server loads full history from Postgres, calls Anthropic, persists the assistant reply.
- **Structured long-term memory in `athlete_facts`.** Categories: `strength | weakness | technical_knowledge | pattern | preference | event | goal | context`. Each fact has confidence (1-5), status (`active | superseded | resolved`), and source. Superseding preserves history; resolving marks a closed weakness/goal.
- **Memory writer runs after every assistant reply** as a separate Claude call (haiku, tool-use only — `add_fact` / `supersede_fact` / `resolve_fact`). Fire-and-forget: the user already got their reply; updates land before the next turn. Conservative system prompt: only durable observations, prefer supersede over duplicate.
- **Coach is told to anchor every technical claim** in the vault or the athlete's recorded model. Outside that, it names the gap and asks rather than fabricating.
- **Gauge → Match → Check pedagogy.** Before instructing on a new technical topic, the coach checks for a `technical_knowledge` fact on that topic; if none, it asks one short calibration question, then matches delivery depth to the recorded level. After a non-trivial concept it asks one short check.
- **Single fighter, no auth.** Personal tool. `fighters` table is treated as a singleton.
- **Drill prescriptions** as fenced ` ```drill ` JSON blocks; the frontend parses them into drill cards.
- **Calibration MCQs** surface after every 3 user messages; answers go into both `calibrations` AND `athlete_facts` (as low-confidence patterns) so they feed the next prompt.

## Product

Mobile-first 3-tab app (will be wrapped in a mobile shell). All routes gated by `useFighter()`; first-run shows onboarding.

1. **Onboarding** — name, age, art, level, frequency, goals, weaknesses, competes. Seeds the model.
2. **Home (`/`)** — FRAME-MMA-style landing: SYNOCHI / OPERATING SYSTEM wordmark, profile shortcut, big slowly-spinning cosmic orb (CosmicOrb = CSS+SVG: topographic horizontal wave band that translates -50% on a 60s loop for spin illusion, radial sphere shading, 3 concentric rings, pulsing primary-color halo, crosshair ticks), STATE label derived from message count (INITIALISING / DENSE CALM POTENTIAL / WARMING / LOCKED IN), "Narrow the decision tree." tagline, big primary CTA "Enter Frame" → `/chat`.
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

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- See the `database` skill for production DB queries.
