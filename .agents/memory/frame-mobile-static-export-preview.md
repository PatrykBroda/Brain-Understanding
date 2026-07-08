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

# post-merge.sh must NOT install Playwright browsers with --with-deps

`pnpm exec playwright install chromium --with-deps` fails in Replit: `--with-deps`
switches to root and runs apt, which Replit forbids ("you don't need sudo"). It aborts
post-merge (exit 1), which then blocks every future merge's setup.

**How to apply:** keep `scripts/post-merge.sh` to `pnpm install` + `pnpm --filter db push`.
Smoke tests resolve Chromium themselves via `scripts/run-mobile-smoke.sh` (bundled-first,
then a dynamic Nix `/nix/store/*/bin/chromium` glob), so post-merge never needs to install
a browser.

# Gitignored dist/ goes stale after a merge cascade → serves an old bundle

`artifacts/frame-mobile/dist/` is gitignored (a local build artifact, never committed).
After parallel task branches merge, the locally-served `dist/` can be an OLD build whose
JS predates a source fix — the `mobile-smoke` suite then fails against the stale bundle
(e.g. an already-fixed `e.filter is not a function` crash) even though source is correct.

**How to apply:** if a mobile smoke test fails on a bug the source already fixed, rebuild
`dist/` (`expo export -p web --output-dir dist`) before assuming a real regression. The
served bundle hash in the stack trace vs the on-disk `dist/_expo/static/js/web/entry-*.js`
hash tells you whether it's stale.

# Web export API base is same-origin, NOT the baked EXPO_PUBLIC_DOMAIN

On web, `_layout.tsx` sets the API base from `window.location.origin` at runtime;
the build-time `EXPO_PUBLIC_DOMAIN` absolute URL is only the native fallback.
**Why:** the baked domain routed all browser traffic through the real proxy to the
MAIN API server, silently defeating smoke-stack isolation (smoke API saw ~0 requests)
and coupling mobile smoke tests to the main workflow's health.
**How to apply:** never reintroduce an absolute build-time API URL for the web export;
same-origin keeps dev preview, prod, and isolated smoke proxies all working.
Also: `app/index.tsx` shows a CONNECTION LOST + RETRY screen on fighter-query error —
errors must never be misread as "no fighter" (that redirected real users to onboarding).
