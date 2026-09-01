---
name: Native paywall route settling
description: Why global native upsells must wait until onboarding has fully transitioned into authenticated tabs.
---

Only present a global post-login paywall after the authenticated tab route is active. A saved fighter profile alone is not proof that navigation has finished settling.

**Why:** On native iOS, the entitlement and fighter state can resolve while onboarding is still the route beneath the modal. Pushing the paywall at that moment leaves onboarding in the back stack, so dismissing the paywall appears to restart the questionnaire even though the profile saved successfully.

**How to apply:** Any global modal triggered by auth/server state should also require the intended base route. For post-onboarding upsells, wait for the authenticated tabs rather than firing from onboarding, sign-in, the root redirect, or another modal.