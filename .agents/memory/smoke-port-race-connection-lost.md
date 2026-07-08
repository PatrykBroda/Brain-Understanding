---
name: Smoke-test port race → CONNECTION LOST
description: Why the coach app intermittently shows "CONNECTION LOST", and how to tell a page-level smoke failure apart from a real regression.
---

The `coach-smoke` and `mobile-smoke` test workflows start their **own** API server on
the same port the main API server workflow uses, but only when that port is free
(i.e. the main server is down). Their runner scripts otherwise *reuse* an
already-running main server and do not tear it down.

**The race:** if the main API server workflow (re)starts while a smoke run's
temporary server still holds the port — or two smoke runs overlap — the loser dies
with `EADDRINUSE`. When the main API server is the loser, it stays down and the
coach frontend renders the global **CONNECTION LOST** gate (the app-level
`useFighter` gate that fires whenever the backend is unreachable).

**Why:** this actually happened during a validation pass that ran both smoke
workflows concurrently right as the main server restarted; the user saw
CONNECTION LOST and a `profile page loads` smoke test failed at the same time.

**How to apply / diagnose:**
- A smoke failure whose captured artifact (screenshot or a11y snapshot) shows the
  global CONNECTION LOST gate ("Retry" button, "couldn't reach the backend" copy)
  is a **backend-availability artifact, not a page regression** — the page's
  component tree never mounted because the app short-circuited at the `useFighter`
  gate. Confirm by checking that Home (which uses the same gate) passed in the same
  run and the page's typecheck is clean.
- Fix the outage by restarting the main API server workflow once the shared port is
  free. Verify with `curl localhost:80/api/healthz` (200) — do **not** trust `ss`
  in this sandbox; it gives false negatives on listening ports.
- Durable mitigations now in place (see `api-server-boot-reliability.md`): the
  api-server no longer runs the test suite on its build/boot path (that ~12s window
  was the main opportunity for the race), and `index.ts` retries `EADDRINUSE`
  (10×1s) so a restart that overlaps a smoke server's port release recovers instead
  of dying. A fuller fix — a dedicated API port for the smoke runners so they can
  never collide — remains a valid follow-up but is not done.
- Durable prevention (not yet done): give the smoke runners a dedicated API port so
  they can never collide with the main server. Offered to the user as a follow-up.

**More failure disguises (same root cause):** a Playwright smoke test that seems
to "hang forever" (no output, exceeds its own test timeout) can simply be
sign-in retrying against a 502 because the services are down/proxied nowhere —
diagnose with `curl localhost:80/api/healthz` FIRST before suspecting the page
under test. Also: never wrap playwright in `stdbuf` (its LD_PRELOAD libstdbuf.so
needs a newer glibc than Nix chromium's wrapper → instant browser-launch
failure), and never `pkill -f <pattern>` where the pattern appears in your own
shell command line — it SIGKILLs your own session; kill by explicit PID from a
`ps` snapshot instead.
