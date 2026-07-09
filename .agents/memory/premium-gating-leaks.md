---
name: Premium gating — indirect data leaks
description: When server-gating premium data, unlocked records can still leak gated records through side channels.
---

**Rule:** A per-record entitlement gate (402 on locked IDs) is not enough — audit every response the FREE tier can still reach for embedded cross-record data: compare/baseline query params, history trails, "previous session" fields, aggregation endpoints. Strip or empty them in the free branch server-side.

**Why:** The FRAME+ analysis gate blocked non-latest detail routes, but the latest report still honored `?compareId=<older id>` and always returned a 5-session `signalHistory` — handing free users exactly the session-over-session comparison the paid tier sells. Caught in architect review, not testing.

**How to apply:** When adding any paid gate, grep the gated route family for query params referencing other rows and for fields built from sibling-row queries; return them empty/null for free tier. Client must already tolerate null/empty (locked stubs pattern: real fields nulled, `locked: true`, never fabricated values).
