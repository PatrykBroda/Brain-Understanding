---
name: Legal acceptance vs AI permission
description: Require both at registration, with separate controls and versioned records.
---

Account registration must require explicit acceptance of the current Terms of
Service and Privacy Policy. Permission to share relevant feature data with
Anthropic/Claude or OpenAI remains a separate, versioned choice that must also be
accepted before an account is created. Entering credentials and accepting the
legal terms only opens the full AI disclosure; registration occurs only from the
disclosure's explicit acceptance action. Closing or declining creates no account.
Registration must persist current AI permission atomically with the new user. AI
permission cannot be withdrawn while keeping an active account. Existing accounts
with missing or stale permission stay blocked until acceptance; users who no
longer agree can sign out or permanently delete the account.

**Why:** Apple requires informed permission before third-party AI sharing. The
product owner explicitly chose to prevent account creation without current AI
permission, rather than creating the account and requesting permission afterward,
and chose account deletion rather than in-place permission withdrawal. Legal
acceptance and AI permission must not be implied by one another.

**How to apply:** Keep separate versions/timestamps and UI controls for legal
acceptance and AI permission. Require both on every registration surface and
reject missing AI permission before creating a user; never call an authenticated
consent endpoint before the account exists. Registration clients must submit the
exact disclosure version they displayed, and the server must reject stale
versions rather than recording current permission for unseen wording. Consent
updates are accept-only. Keep the authenticated global gate and provider-boundary
rechecks so missing or stale permission still fails closed.