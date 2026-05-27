---
name: FRAME two-layer system prompt + no-fake-biometrics state
description: How to structure a "feels alive but holds identity" coach-style system prompt as two explicit layers, and how to derive interpretive UI state from real memory signal without inventing scores.
---

For a coach/operator-style product where the AI must adapt tone radically (banter ↔ technical ↔ flat ↔ hyped) without losing its identity, write the system prompt as two NAMED layers, not as one mixed list of instructions:

- **Layer 1 — Immutable philosophy.** Purpose, posture, what it feels like, what it is NEVER, value priority order, what it observes, the few canonical signal phrases it owns. Marked "NEVER changes, regardless of register, mood, channel."
- **Layer 2 — Adaptive expression.** Vocabulary, humour, pacing, sentence length, intensity, banter, looseness. Marked "DOES change, dynamically, in real time." Includes register-mirroring rules and a "when in doubt, lean LOOSER" tiebreak.

**Why naming the layers matters:** without explicit naming, the model treats every line as equally tunable and either over-polishes the voice (Layer 1 bleeds into Layer 2's slot) or drifts the philosophy under casual register (Layer 2 erodes Layer 1). The named contract gives the model a place to put each instruction. The closing sentence — "you can be loose AND composed, you can banter AND be precise, the two-layer system is exactly what makes that possible" — measurably tightens behaviour on edge turns.

**How to apply:**
- Open with a strong identity sentence ("You are X. X is not a productivity assistant, motivational coach, or generic AI chatbot."). Negation up front prevents drift into helper-bot defaults.
- Put framework/vault grounding rules AFTER the two layers, not before — anchoring is downstream of identity.
- Don't repeat voice instructions in both layers and a separate "Voice & register" section. Pick one location (Layer 2) or it splits brain.

**Never-fake state companion rule (for the UI side):** if you surface a "state" label on a home/ambient screen, only ship interpretive words ("Stable", "Loaded", "Recovering", "Tight", "Volatile", "Composed", "Overextended", "Dormant") — never percentages, readiness scores, fatigue indices, or "82% recovered" style readouts. Derive each label deterministically from actual recorded memory signal (keyword scan over recent fact rows) with first-match-wins ordering. When you have no signal, return "Stable" or "Dormant" honestly; never fabricate. Expose the derivation source via a `title=` tooltip — visible provenance is what makes the label feel observed rather than rolled.

**Why:** fake numeric biometrics on a coach-style product collapse trust on the first wrong reading. Interpretive words have no "correct value" to be wrong about — they're observations, and observations age gracefully when memory is shallow. The user explicitly named this as the failure mode that "instantly destroys trust."
