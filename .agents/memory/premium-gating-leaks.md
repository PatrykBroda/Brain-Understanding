---
name: Premium gating — indirect data leaks
description: When server-gating premium data, unlocked records can still leak gated records through side channels.
---

**Rule:** A per-record entitlement gate (402 on locked IDs) is not enough — audit every response the FREE tier can still reach for embedded cross-record data: compare/baseline query params, history trails, "previous session" fields, aggregation endpoints. Strip or empty them in the free branch server-side.

**Why:** The FRAME+ analysis gate blocked non-latest detail routes, but the latest report still honored `?compareId=<older id>` and always returned a 5-session `signalHistory` — handing free users exactly the session-over-session comparison the paid tier sells. Caught in architect review, not testing.

**How to apply:** When adding any paid gate, grep the gated route family for query params referencing other rows and for fields built from sibling-row queries; return them empty/null for free tier. Client must already tolerate null/empty (locked stubs pattern: real fields nulled, `locked: true`, never fabricated values).

**Client pre-gate rule (knownFree):** A client-side upgrade prompt before an expensive action must only fire when the plan is KNOWN free (`billingStatus?.plan === "free"`), never when billing status is missing/errored — otherwise a failed billing fetch blocks paying subscribers. The server 402 is always the authority; client catch blocks map the 402 (`FRAME_PLUS_REQUIRED`) to the upgrade modal as the fallback path.

**One-free-taster pattern:** A "first X free" allowance should be derived by COUNTING existing rows server-side (0 → allow, ≥1 → 402), not by a flag column — idempotent, un-fakeable, and survives retries. The client pre-gate must mirror the same condition (`knownFree && count≥1`), never plain `knownFree`, or the free taster gets blocked client-side. Smoke-test it by proving the first POST fails on ordinary validation (400, NOT 402 — proof the gate passed), SQL-seeding one row, then asserting the second POST is 402.

**Accepted soft gate exception:** When gated content is a PRESENTATION of data that also powers free features (e.g. athlete facts feeding both the locked DNA radar and the free state panel), the data endpoint may legitimately stay ungated and the lock live client-side only — but this must be a deliberate, documented decision, not an oversight. Test remote-fetch style gates BEFORE any expensive server work (subprocess/download), not after.
