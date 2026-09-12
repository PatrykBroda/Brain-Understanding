---
name: Legal acceptance vs AI permission
description: Keep account legal acceptance separate from the current mandatory authenticated-use AI permission.
---

Account registration must require explicit acceptance of the current Terms of
Service and Privacy Policy. Permission to share relevant feature data with
Anthropic/Claude or OpenAI remains a separate, versioned choice that is requested
after authentication and before onboarding. A missing, declined, withdrawn, or
stale AI consent state blocks normal authenticated FRAME use until the current
disclosure is accepted.

**Why:** Apple requires informed permission before third-party AI sharing. The
product owner later chose to make current AI permission a condition of using
FRAME at all, while preserving a real choice to decline by leaving legal pages,
sign-out, and permanent account deletion available.

**How to apply:** Keep separate versions/timestamps and UI controls for legal
acceptance and AI permission. Require legal acceptance during registration, then
gate onboarding and authenticated content on current AI consent. Keep Privacy,
Terms, sign-out, consent controls, and permanent account deletion reachable
without AI consent. Provider calls and retries must still independently recheck
current consent immediately before transmission.