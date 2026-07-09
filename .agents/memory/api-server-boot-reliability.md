---
name: api-server boot reliability
description: Why the api-server build path must not run tests, and why listen() retries EADDRINUSE.
---

# api-server boot reliability

Recurring symptom: users hit 502s on login and every feature, intermittently — the api-server process was down.

## Rule 1 — never run tests on the api-server build/boot path
Do NOT add a `postbuild` (or any) hook that runs the vitest suite to `artifacts/api-server`.

**Why:** `dev` is `build && start` and prod build is `pnpm run build`, so a `postbuild: pnpm -w run test:api-server` ran all ~163 tests on EVERY boot. Two failure modes:
- Slow boot (~12s build+test before `listen`) left port 8080 free long enough for the smoke workflows (`run-coach-smoke.sh` / `run-mobile-smoke.sh`) — which start their OWN server on 8080 when the port is free — to grab it. The main server then died with `EADDRINUSE` and the app 502'd until manual restart.
- Any single failing/flaky test made `build` fail, so `start` never ran → server never came up at all.

**How to apply:** tests belong to the dedicated `test` / `api-server-tests` workflows + the validation system, never the build. Consequence to accept: prod deploys are no longer test-gated by the build step itself.

## Rule 3 — concurrent api-server builds must not share one dist/
Two smoke runners (or a smoke runner + the dev workflow) building the api-server at the same time corrupt each other: one build `rm`s and rewrites `dist/` while the other's `node` is importing it, yielding a truncated `index.mjs` and `SyntaxError: Unexpected end of input` at boot (health check sees HTTP 000 until timeout).

**Why:** the validation system runs coach-smoke and mobile-smoke in parallel; both ran `pnpm --filter api-server run dev` (= build && start) into the same in-place `dist/`.

**How to apply:** `build.mjs` + the `start` script honor `API_SERVER_DIST`; each smoke runner sets its own dir (`/tmp/{coach,mobile}-smoke-api-dist`). The synochi prebuild writes its generated file atomically (tmp + rename) for the same reason. Any new runner that boots the api-server must set its own `API_SERVER_DIST`.

## Rule 2 — listen() must handle EADDRINUSE, not assume a callback error arg
`app.listen(port, cb)`'s callback is a `listening` listener and receives NO error argument — so `app.listen(port, (err) => { if (err) … })` is dead code and `EADDRINUSE` surfaces as an unhandled `error` event that crashes the process.

**Why:** on restart the previous instance can take a moment to release the port; crashing immediately leaves the app down until a manual restart.

**How to apply:** attach `server.on("error", …)` and retry `EADDRINUSE` a bounded number of times (currently 10×1s) before `process.exit(1)`; non-EADDRINUSE errors still exit immediately. This masks the restart-handoff race but NOT a true zombie (an old instance that never releases 8080 keeps serving stale code — a workflow-supervisor concern, not fixable in app code).
