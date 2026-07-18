---
name: Coaching mode + time-aware chat re-entry
description: Two FRAME coach features and the honesty constraints that govern them.
---

# Coaching mode (Explorer / Builder / Competitor / Performer)

`computeCoachingMode` lives in the shared `lib/archetypes` so the server prompt
and the client Profile panel describe the mode identically. It is derived from
REAL data only — a scheduled competition, recorded experience level, model size
(active fact count) — never mood or fabricated metrics. First-match precedence:
competition → advanced → intermediate-or-model≥8 → explorer.

**Why:** "same system, different coach" — the friction posture is a dial set by
evidence, layered ON TOP of adaptive friction scaling and the competition tier,
not replacing them. Injecting it inside `buildDynamicContext` means it covers
both the welcome route and the chat stream automatically (both call that fn).

**How to apply:** the prompt block tells the model NEVER to announce the mode
("you're in Builder mode") — it only changes how hard it pushes.

# Welcome behavior: one deterministic message, then fully passive

The time-aware re-entry tiers (<2h/24h/72h AI-generated welcomes) were REMOVED
in July 2026 by explicit user request. The welcome route now inserts ONE fixed,
deterministic 5-paragraph message only when the fighter has no messages at all
(checked across all their conversations, guarded by a fighter-keyed advisory
lock against double-insert). After that the coach never initiates — it only
responds.

**Why:** the user wants FRAME passive — no proactive nudges, no re-entry
banter, no AI-variable first impressions. One controlled welcome, then silence
until spoken to. Do NOT reintroduce tiered/AI-generated welcome or re-entry
copy.

**Durable honesty constraint (keep if proactive copy ever returns):** never
claim the athlete hasn't TRAINED in N days — we only know silence in FRAME,
not training logs. Phrase any gap strictly as time "away from the frame".
