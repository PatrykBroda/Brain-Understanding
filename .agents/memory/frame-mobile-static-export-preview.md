---
name: frame-mobile static-export preview
description: How the frame-mobile Expo artifact is previewed/verified in this workspace, and why gated screens can't be screenshotted unauthenticated.
---

# frame-mobile is previewed as a WEB STATIC EXPORT, not a live Metro dev server

The `artifacts/frame-mobile` workflow runs `node serve-static.mjs`, which serves the
pre-built `dist/` folder. It does **not** rebuild on file change.

**How to apply:**
- After editing mobile source, code changes do NOT show in the preview until you run
  `pnpm --filter @workspace/frame-mobile run build` (writes `dist/`), then restart the
  `artifacts/frame-mobile: expo` workflow.
- The web export build takes **longer than the 2-min bash timeout** — run it in the
  background (`nohup ... &`) and poll, or it gets killed mid-build leaving a partial `dist/`.
- Real verification gate is `pnpm --filter @workspace/frame-mobile run typecheck` (NOT
  `build` for pass/fail signal, though build must succeed for the preview to update).

# Auth-gated mobile screens redirect to the public landing when signed out

Directly navigating the preview to a gated route (e.g. `/competition`) bounces to the
FRAME landing page because the app is Clerk-gated. So you **cannot screenshot-verify the
signed-in screens** (home banner, chat message rendering, competition screen) without
real credentials — rely on typecheck + code review for those.

**Why:** confirms routing + auth guard work, but is a hard limit on visual QA here.
