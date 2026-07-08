---
name: Smoke runners — always-fresh servers, pid1 port squatting
description: Why smoke runners use randomized per-run ports + pidfile teardown, and why raw TCP checks / fixed ports fail on Replit
---

**Rule:** smoke runners must never reuse an already-listening server; every run starts fresh services on randomized per-run ports (coach 18100-18899, mobile 19100-19899) and kills survivors recorded in `/tmp/{coach,mobile}-smoke.pids` (kill_tree — pnpm wraps node children).

**Why:**
- Reusing a leftover server silently tests STALE code (pass/fail against outdated builds).
- Replit's pid1 supervisor opens a localhost forward for ANY port it sees an app bind and can hold it forever — previously-used fixed ports become permanently unbindable (EADDRINUSE), and even a brief bind-probe poisons a port. So "kill by port then rebind same port" is not viable; randomized ports are.
- pid1's forward listener ACCEPTS TCP and answers HTTP 502 before a real server binds → raw `/dev/tcp` port checks are meaningless both for "already running" detection and readiness. Readiness must be HTTP-based (status < 500).
- `exec pnpm playwright ...` at the end of a runner skips the EXIT trap → servers survive. Don't exec; let the trap clean up.

**How to apply:** any new smoke/e2e runner in this repo: randomized ports + pidfile teardown + wait-for-HTTP + no exec before the cleanup trap. Also note curl `-w '%{http_code}' || echo 000` yields "000000" on failure — use `|| code=000` instead.
