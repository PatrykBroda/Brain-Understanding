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
- Durable prevention (not yet done): give the smoke runners a dedicated API port so
  they can never collide with the main server. Offered to the user as a follow-up.
