---
name: AI consent at provider boundaries
description: Consent enforcement rules for direct, background, streaming, and retried third-party AI calls.
---

Current-version AI consent must be checked immediately before every third-party provider call, including each attempt in a retry loop. Route-entry checks are useful for fast rejection but are not sufficient, and background helpers must not accept a trusted “already checked” bypass.

**Why:** A user can withdraw consent while a request is preparing context, streaming, waiting for background work, or between validation retries. Reusing an earlier result can transmit data after withdrawal even though the UI says withdrawal blocks future sharing.

**How to apply:** Keep an early interactive-route guard, then re-read consent at each Anthropic/OpenAI call boundary. Background helpers always perform their own check. On the client, lock sends synchronously before awaiting consent status so repeated taps cannot create duplicate provider requests.