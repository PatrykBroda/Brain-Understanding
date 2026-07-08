---
name: Mobile smoke testing (frame-mobile static export)
description: How to reliably run/validate the frame-mobile Playwright smoke suite and why runs can silently serve stale UI.
---

- frame-mobile is previewed/tested as a **static web export** (`dist/`), NOT a live Metro server. Editing mobile source (e.g. `app/(tabs)/*.tsx`) does not change what the smoke suite sees until you rebuild: `pnpm --filter @workspace/frame-mobile run build`.
- `scripts/run-mobile-smoke.sh` now has a freshness gate: it rebuilds dist automatically when any mobile source file (app/components/lib/hooks/context/assets/constants + config files) is newer than `dist/index.html`, and fails loudly if the rebuild fails. Runner output states "STALE BUNDLE … REBUILT" or "dist/ CONFIRMED CURRENT". Manual pre-rebuild is no longer required before smoke runs (still needed for the preview workflow). `serve-static.mjs` reads dist from disk per request, so a fresh rebuild is picked up without restarting the static server.
- `expo export -p web` is slow (often >2 min) and clears `dist/` at the start. If a run is interrupted mid-export you get an EMPTY `dist/`; before assuming failure, check `ps aux | rg expo` for a still-running export, and never start a second concurrent export — they collide and one exits leaving an empty dist.
- Capturing smoke output via `nohup ... >log 2>&1 &` frequently yields an EMPTY log (pnpm/playwright output swallowed, worsened by the script's `exec`). Do NOT read an empty log as "no tests ran". The authoritative post-run signal is `test-results/.last-run.json` (`{"status":"passed","failedTests":[]}`) — verify its mtime is fresh. The HTML report at `/tmp/playwright-report` is not always regenerated.

**Why:** validated a mobile UI fix and burned time chasing empty logs + an empty dist that were really a still-running/collided `expo export`, not a real failure.

**How to apply:** to validate a mobile source change: run the suite via the `mobile-smoke` workflow (the runner rebuilds a stale dist itself; budget a few extra minutes when it does) → read `test-results/.last-run.json`. Note: detached `setsid`/`nohup` runs from the shell get killed between tool calls — use the workflow.
