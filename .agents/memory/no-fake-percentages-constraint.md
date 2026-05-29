---
name: No fake numbers / biometrics (HARD brand rule) — and the one principled exception
description: Why FRAME never invents numbers, and the narrow rule that lets the Analyse FRAME REPORT show real measured scores.
---

FRAME never shows a numeric percentage, readiness score, fatigue index, or any *fabricated* number anywhere in UI or coach output. This is a hard product constraint, not a style preference.

**Why:** The product's authority comes from honesty — it only ever asserts what it has real evidence for. A synthetic `%` invented from message/fact counts reads as a fake biometric and a code review flagged it as a brand violation even though it was loosely derived from real data. A number implies precision the system does not have.

**The dividing line is fabrication, not numbers.** Numbers are allowed *only* when they are computed deterministically from genuinely measured signal, with provenance attached. They are forbidden when they are invented by the model, or synthesised from proxy counts (message count, fact count) and dressed up as a biometric.

**How to apply:**
- Interpretive/derived-from-counts signal → categorical language + a *discrete* segmented bar, never a continuous `%`. Examples: Frame-integrity gauge (label + 5 segments), home orb state labels, vocabulary "Tier N/5".
- **Analyse FRAME REPORT is the principled exception.** Its AGGRESSION / COMPOSURE / REACTION SPEED / DEFENSIVE RECOVERY (0–100) and SESSION SCORE (/100) are real: they come from on-device MediaPipe pose metrics computed in `analysis-metrics.ts`, each carrying a `basis` provenance string. The **AI never emits numbers** — it writes only narrative (style profile, hedged fighter parallels, comment, comparison note). `fragmentationRisk` stays categorical. The server enforces this: it requires the four canonical score keys and **recomputes the composite SESSION SCORE itself** (`recomputeSessionScore`) so a tampered client payload can't fabricate the headline number. Per-attribute values stay client-computed because pose runs on-device — that's an architectural reality, not a hole.
- When a user asks for "a single number" outside Analyse (e.g. a FRAME SCORE on Home), still refuse — there's no measured basis there. Honor the intent with punchier interpretive language and flag the tension.
