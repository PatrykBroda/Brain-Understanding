---
name: Mobile auth persistence fallback
description: How mobile authentication should behave when secure device storage is unavailable.
---

A valid server-issued mobile session must become active for the current process even when SecureStore cannot persist its token. Treat authentication and persistence as separate outcomes, retain the token only in memory, and warn that another sign-in may be required after restart. Never fall back to insecure persistent token storage.

**Why:** iOS SecureStore can reject a write after the API has already accepted the user's credentials. Treating that as total authentication failure locks out a valid user and misrepresents what failed.

**How to apply:** Any mobile session-establishment or token-refresh flow should validate the token first, activate valid identity state independently of persistence, and surface persistence failure as a degraded-session notice rather than a rejected login.