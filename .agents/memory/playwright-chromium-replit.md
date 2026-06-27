---
name: Playwright Chromium in Replit/Nix
description: Why smoke tests must use the Nix system Chromium, never Playwright's bundled browser
---

# Playwright Chromium must be the Nix system browser, not the bundled one

**Rule:** In this Replit/Nix container, Playwright must launch the Nix-provided
system Chromium. `playwright.config.ts` resolves it itself (env override
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` / `CHROMIUM_PATH` first, then auto-discovers
the newest `/nix/store/*-chromium-*/bin/chromium`). Keep `--no-sandbox
--disable-setuid-sandbox` in `launchOptions.args`.

**Never do these** in `post-merge.sh` / smoke scripts / config:
- `playwright install --with-deps` — needs root/apt; **forbidden** in Replit.
- `playwright install chromium` (bundled `chrome-headless-shell`) — it downloads
  fine but **crashes immediately on launch**: `browserType.launch: Target page,
  context or browser has been closed` followed by `kill ESRCH`. It is missing
  system shared libs that only `--with-deps` would install.
- Removing the `executablePath` override from `playwright.config.ts`.

**Why:** Repeated attempts to "fix" Chromium discovery by switching to the
bundled browser or `--with-deps` each broke every smoke test. The bundled
browser cannot run here; the Nix Chromium ships with its libraries wired up.
Auto-discovery (glob newest `-chromium-` store path) is the durable form — it
survives Nix store-hash bumps, which is the legitimate goal those breaking
changes were chasing.

**How to apply:** Put the browser resolution in `playwright.config.ts` (not just
the shell scripts), so it holds even when a future merge rewrites
`post-merge.sh`. If smoke tests suddenly fail every test with a launch/closed
error, this is the cause — check whether something reintroduced the bundled
browser.

**Never gate the production deployment build with e2e/Playwright tests.** An
artifact's production `build` (and its `postbuild` hook, which pnpm runs
automatically) executes in the Cloud Run build sandbox, which has NO Nix system
Chromium and NO system libs — Playwright falls back to its bundled
`chrome-headless-shell` and dies with `libglib-2.0.so.0: cannot open shared
object file`, failing the whole publish even though every artifact built fine.
e2e smoke tests belong in the merge gate (`post-merge.sh`) and as validation
commands, never in an artifact's `postbuild`. Fast browser-less unit tests in
`postbuild` are tolerable, but the principle holds: the production build should
build, not run test suites.
