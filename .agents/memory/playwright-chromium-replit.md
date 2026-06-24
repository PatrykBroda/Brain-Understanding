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

**Why:** Three separate task agents each "fixed" Chromium discovery by switching
to the bundled browser or `--with-deps`, and each one broke every smoke test.
The bundled browser cannot run here; the Nix Chromium ships with its libraries
wired up. Auto-discovery (glob newest `-chromium-` store path) is the durable
form — it survives Nix store-hash bumps, which was the legitimate goal behind
those breaking changes.

**How to apply:** Put the browser resolution in `playwright.config.ts` (not just
the shell scripts), so it holds even when a future merge rewrites
`post-merge.sh`. If smoke tests suddenly fail every test with a launch/closed
error, this is the cause — check whether something reintroduced the bundled
browser.
