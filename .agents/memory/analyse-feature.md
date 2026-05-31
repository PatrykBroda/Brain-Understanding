---
name: Analyse feature (footage → nervous-system read)
description: How the video Analyse pipeline is split client/server and the brand guards it must keep
---

# Analyse feature

The "Analyse" tab turns uploaded footage into a FRAME nervous-system read.

## Architecture split (deliberate)
- **All video + pose processing happens in the browser.** MediaPipe PoseLandmarker
  runs client-side; the server never receives or decodes video. The server only
  receives computed metrics/signals + a handful of base64 key frames (skeleton
  already baked in) and runs the Claude narrative.
  **Why:** keeps video off the server (privacy + cost + no heavy server deps), and
  the same overlaid image the user sees is exactly what Claude sees.
- **Load is computed client-side and is fixed.** `nervousSystemLoad` is decided in
  `lib/analysis-metrics.ts`, sent to the server, and the AI prompt says DO NOT
  OVERRIDE — Claude only narrates around it. If you change load logic, change it
  there, not in the prompt.

## FRAME REPORT numbers are real (the one allowed exception)
- The shareable FRAME REPORT shows AGGRESSION/COMPOSURE/REACTION SPEED/DEFENSIVE
  RECOVERY (0–100) + SESSION SCORE (/100). These are computed deterministically
  from on-device pose metrics in `analysis-metrics.ts`, each with a `basis`
  provenance string. The **AI writes only narrative** (style profile, hedged
  fighter parallels, comment, comparison note) and is told the numbers are fixed —
  it must never emit numbers. `fragmentationRisk` stays categorical.
- **Server enforces the honesty contract**, it does not trust the client blindly:
  the route requires the four canonical score keys (`hasCanonicalScores`) and
  **recomputes the composite SESSION SCORE server-side** (`recomputeSessionScore`,
  mirroring the client weighting) so the headline number can't be a fabricated
  free-floating value. Per-attribute values stay client-computed only because
  pose runs on-device. See `no-fake-percentages-constraint.md` for the rule.

## Brand guards that must not regress
- Load is categorical only: LOW / MODERATE / ELEVATED / HIGH. The cinematic
  loading overlay uses a non-numeric phase bar on purpose; do not re-add `%`
  there. Fabricated/proxy-count numbers remain forbidden everywhere outside the
  measured FRAME REPORT scores above.
- No emojis: the prompt forbids them AND `analysisService` strips emoji codepoints
  server-side as a defensive guard before persisting.
  **Why:** "no emojis / no fabricated numbers" are hard product rules, not soft preferences.

## Gotchas
- `disposeExtract` must release the video decoder (pause + removeAttribute("src")
  + load()), not just revoke the object URL — repeated analyses leak decoder/GPU
  memory on mobile otherwise. PoseLandmarker is a reused singleton (not closed
  per run) by design.
- Express json body limit is 20mb (app.ts) — key frames fit; keep them bounded.
- athlete_facts from an analysis use source `video:<analysisId>` and are only
  written for non-low-severity findings.

## Frontend error contract (ApiError)
`jsonFetch` throws a structured `ApiError` (kind/title/causes/retryable + timeout via AbortController). Its base `Error.message` is deliberately set to `title: causes` because legacy callers (onboarding, profile-edit, planner, chat upload) only read `err.message` — if you ever make `message` just the title, those screens lose actionable backend detail. Richer UIs (Analyse error card) read the structured fields directly.
