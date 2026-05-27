---
name: No-flash route → overlay transition
description: How to make a fullscreen "loading/transition" overlay appear instantly on route entry with no flash of the destination page underneath.
---

When the user navigates to a route that should *immediately* show a fullscreen transition/loading overlay (entry sequence, splash, ritual), the overlay must be visible on the **first paint** of the destination route. Otherwise the user sees a fraction of a second of the route's real content, then the overlay slams down. Even one frame of flash kills the "instant" feel.

Rules:

1. **`useState(true)` initial** for the overlay-active flag in the destination route component. Never `useState(false)` plus an effect-driven flip.
2. **No data gates.** Do not write `{overlayActive && data && <Overlay/>}` — if `data` comes from a query that misses the cache by one tick, the overlay misses the first paint. If the overlay needs data, render it without and pass data as it arrives, or render a degraded version.
3. **Fully painted background.** The overlay's root must paint its own background (solid colour or gradient) at `position: fixed; inset: 0; z-50`. Translucent/blur-only overlays still let the route flash through.
4. **Avoid Suspense above it** unless the suspense fallback *is* the overlay. A suspending child below the overlay is fine; a suspending parent that hides the whole route during navigation defeats step 1.
5. **Cleanup before unmount.** Cancel any pending dismiss/auto-dismiss timers in a master cleanup effect so `setState` doesn't fire after the route unmounts when the user navigates away mid-overlay.

**Why:** the user reports "the loading screen needs to appear as soon as I press the button" almost always means a one-frame flash, not actual latency. Fix the render path, not the perceived timing.

**How to apply:** any wouter/react-router transition where the destination shows a splash, ritual, calibration, onboarding step, or loading state that should feel continuous with the click.
