---
name: No fake percentages / biometrics (HARD brand rule)
description: Why FRAME never shows numeric % readiness/integrity scores and how to express derived signal instead.
---

FRAME never shows a numeric percentage, readiness score, fatigue index, or any fake-biometric number anywhere in UI or coach output. This is a hard product constraint, not a style preference.

**Why:** The product's authority comes from honesty — it only ever asserts what it has real evidence for. A synthetic `%` invented from message/fact counts reads as a fake biometric and a code review flagged it as a brand violation even though it was derived from real data. The number implies precision the system does not have.

**How to apply:** When you have a real derived signal (e.g. model density from recorded facts + reps), express it as interpretive categorical language plus a *discrete* segmented bar — never a continuous percentage width or a number with a `%`. Example: Frame integrity gauge = label (Dormant/Forming/Taking shape/Holding/Solid/Tempered) + 5 discrete segments, no `%`. Same principle drives the home orb state labels and the vocabulary tier shown as "Tier N/5" (small bounded count, not a percentage).
