---
name: Welcome-style LLM endpoint concurrency
description: Pattern for any "fire-once-per-context" LLM endpoint that persists its output and can be triggered by React effects.
---

When an endpoint (a) is auto-triggered from a React useEffect on mount, (b) calls an LLM (multi-second latency), and (c) persists the result as a durable row, a `useRef` guard on the client is NOT enough. It only covers one mounted instance — StrictMode double-mount, navigation back-and-forth, multi-tab, and retries all bypass it.

**Rule:** server must enforce idempotency itself. Two-part pattern:

1. **Advisory lock per logical key** (e.g. `pg_try_advisory_lock(namespace, conversationId)`). If not acquired, return `{message: null, reason: "in-progress"}` immediately — never queue.
2. **Re-check after generation, before insert.** Read the latest row again; if a different writer inserted between your initial read and now, drop your result (`reason: "raced"`). Without this, an LLM call that takes 5s can land its row *after* a fresh user message and arrive out of order in the visible history.

**Why:** the LLM call window is wide enough that "racing with the user" is a normal-traffic case, not a stress test. The advisory lock prevents duplicate welcomes; the recheck prevents out-of-order welcomes after a user sneaks in a real message during generation.

**How to apply:** any endpoint that fits the shape "auto-fired on UI entry → calls model → inserts assistant/system row". Keep client `useRef` guard for cheap best-effort, but never rely on it for correctness.
