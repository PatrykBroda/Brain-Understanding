---
name: SSE coach-chat resilience
description: Why the coach chat could hang on "SENSING" forever and the rules that keep streamed turns recoverable.
---

# SSE coach-chat resilience

The coach reply streams over SSE (`POST /api/coach/chat` → `data: {content|done|error}`). The "stuck SENSING forever" bug was NOT an AI failure (prod logged all 200s) — it was a client with no liveness guard plus a silent success path.

## Rules that must hold
- **A stream that closes WITHOUT a `{done:true}` sentinel is a FAILURE, not a silent success.** The reader's `done` only means the socket closed; the app-level completion signal is the `{done:true}` event. Treat reader-close-before-done (and any `{error}` event) as an interrupted turn: surface an in-character message + a Retry, and clear the empty pending bubble. Never leave a `pending:true, content:""` assistant bubble — that is the visible "SENSING" hang.
- **The fetch needs an inactivity watchdog (AbortController), not just user-stop.** Use a generous first-token window (prod first-token has been seen up to ~24s) and a shorter idle window once bytes flow. Re-arm on every chunk; clear in `finally`. Classify `timedOut` BEFORE the generic `AbortError` branch so a watchdog abort isn't mistaken for a user Stop.

## Retry dedup gotcha
**Why:** the server inserts the user message UP FRONT (before streaming) and, in its catch block, persists a partial assistant reply when `assembled.length > 0`. So a failed turn leaves an orphaned user row (and sometimes a partial assistant row) in the DB.
**How to apply:** retry re-sends the same text. To avoid duplicate history the server reuses an immediately-preceding identical *unanswered* user row (text-only turns, ordered `createdAt DESC, id DESC`). This cleanly covers the dominant case (no content streamed before the hang). It does NOT cover partial-text-then-drop: you cannot auto-delete the persisted partial assistant because nothing distinguishes a failed partial from a completed reply by content alone — deleting on a content match would erase legitimate replies. Accept the partial lingering in history rather than risk that.

## Latency lever
Static system block (~100K tokens) is `cache_control: ephemeral` (5-min TTL) — caching is structural, the dynamic per-fighter block follows it uncached. The real per-turn cost driver is the uncached deep-vault retrieval injected into the dynamic block; it is score-sorted, so trimming node count (8→6) shrinks first-token latency with negligible knowledge loss. Log `stream.finalMessage().usage.cache_read/creation_input_tokens` to confirm the cache is actually warm.
