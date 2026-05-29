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

## Brand guards that must not regress
- Categorical load only: LOW / MODERATE / ELEVATED / HIGH. **Never** percentages,
  readiness scores, or fake biometrics anywhere — including the loading UI (the
  cinematic overlay uses a non-numeric phase bar on purpose; do not re-add `%`).
- No emojis: the prompt forbids them AND `analysisService.normaliseFindings`
  strips emoji codepoints server-side as a defensive guard before persisting.
  **Why:** "no emojis / no fake %" are hard product rules, not soft preferences.

## Gotchas
- `disposeExtract` must release the video decoder (pause + removeAttribute("src")
  + load()), not just revoke the object URL — repeated analyses leak decoder/GPU
  memory on mobile otherwise. PoseLandmarker is a reused singleton (not closed
  per run) by design.
- Express json body limit is 20mb (app.ts) — key frames fit; keep them bounded.
- athlete_facts from an analysis use source `video:<analysisId>` and are only
  written for non-low-severity findings.
