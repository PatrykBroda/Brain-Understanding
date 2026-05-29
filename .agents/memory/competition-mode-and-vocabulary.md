---
name: Competition Mode + vocabulary growth
description: Design decisions behind Competition Mode activation timing and the per-user vocabulary tier.
---

**Competition Mode active window.** `getActiveCompetition()` filters `eventDate >= startOfToday` (NOT `>= now`) on purpose: a competition should stay in active/pressure mode through the entire event day (fight day = 0 days out), not flip off mid-afternoon. Do not "fix" this to use the current timestamp — that would drop the camp on the morning of the competition. Past = strictly before today.
**Why:** A BJJ comp spans the whole day; the athlete is in the tunnel until it's over. Pressure tiers (base/build/sharpen/peak/fight_week) are keyed off `daysToEvent` via `tierFor`.

**Vocabulary tier (grows per user, honestly).** `computeVocabulary(facts)` derives a 0-5 term-density tier from the count of *active* `technical_knowledge` facts (1/3/6/10/15 thresholds). It is persisted to `fighters.vocabularyLevel` only as a high-water mark (never regresses) and injected into both chat + welcome prompts to calibrate how dense the coach's language is.
**Why:** "Vocabulary that grows per user" must be grounded in real recorded knowledge, not a raw message counter — so it tracks concepts the athlete has actually demonstrated, and the profile can show it honestly ("Tier N/5", "Concepts held").

**First-contact entry briefing.** The welcome handler branches on `facts.length === 0`: first contact gets a sharper, funnier archetype read built only from onboarding + spirit animal, and is told NOT to fake deep reads. Steady-state uses the normal briefing.
