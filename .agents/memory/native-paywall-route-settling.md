---
name: Native onboarding route safety
description: Why global upsells must wait for tabs and onboarding must guard against rendering after a successful profile save.
---

Only present a global post-login paywall after the authenticated tab route is active. The onboarding route must also redirect away whenever a fighter already exists or its current profile save has succeeded.

**Why:** On native iOS, a successful fighter save and navigation effects can settle in different renders. The app has reproduced a successful profile POST followed by another onboarding POST in the same session. Paywall timing alone is not sufficient protection; the form itself must refuse a second completion.

**How to apply:** Any global modal triggered by auth/server state should require the intended base route. Any one-time setup screen should treat an existing server entity or a completed local save as authoritative and redirect instead of rendering the form again.