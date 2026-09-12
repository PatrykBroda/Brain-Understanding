---
name: Legal acceptance vs AI permission
description: Require both at registration, with separate controls and versioned records.
---

Account registration must require explicit acceptance of the current Terms of
Service and Privacy Policy. Permission to share relevant feature data with
Anthropic/Claude or OpenAI remains a separate, versioned choice that must also be
accepted before an account is created. Registration must persist current AI
permission atomically with the new user. A missing, declined, withdrawn, or stale
AI consent state still blocks normal authenticated FRAME use until the current
disclosure is accepted.

**Why:** Apple requires informed permission before third-party AI sharing. The
product owner explicitly chose to prevent account creation without current AI
permission, rather than creating the account and requesting permission afterward.
Legal acceptance and AI permission must not be implied by one another.

**How to apply:** Keep separate versions/timestamps and UI controls for legal
acceptance and AI permission. Require both on every registration surface and
reject missing AI permission before creating a user; never call an authenticated
consent endpoint before the account exists. Registration clients must submit the
exact disclosure version they displayed, and the server must reject stale
versions rather than recording current consent for unseen wording. Keep the
authenticated global gate, withdrawal flow, and provider-boundary rechecks so
stale or withdrawn permission still fails closed.