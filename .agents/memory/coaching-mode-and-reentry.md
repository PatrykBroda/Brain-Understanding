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

# Time-aware chat re-entry tiers

Welcome route tiers by gap since the athlete's last message: <2h silent,
[2h,24h) returning, [24h,72h] new-day, >72h lapsed. Boundaries are inclusive on
the stale gate and the new-day gate (`>=`).

**Why (the load-bearing constraint):** the lapsed tier must NEVER claim the
athlete hasn't TRAINED in N days. We only know silence in FRAME, not training
logs — saying "you haven't trained" is a fabrication and breaks the no-fake-data
pillar. Phrase strictly as time "away from the frame", then ask.

**How to apply:** first-contact ("very first time…") must key on real
conversation history (`!last`), NOT `facts.length === 0` — a returning athlete
with sparse facts has still been here before; the tier text handles sparse
models honestly on its own.
