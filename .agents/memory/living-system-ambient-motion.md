---
name: Living-system ambient motion
description: How to make a UI feel "subtly alive — breathing, observing, adapting" rather than animated. Restrained over flashy.
---

When the design brief is "feel alive but restrained — like a living system observing rather than an animated AI interface," the trap is reaching for big motion (spinners, sweeping gradients, particle bursts). That reads as "animated." Aliveness is the *combination* of several small, slow, desynchronized loops.

Recipe:

- **Stack 3-5 independent loops** on the scene: a slow background breath (8-12s), a vignette breath (10-14s), a centerpiece text/opacity breath (5-7s), a small indicator pulse (2.5-3.5s), and a slow particle/dust drift (15-25s per particle).
- **Desynchronize.** Different periods are not enough — different *phases* too. Randomize starting offsets (`animationDelay: -${random()}s`) so on reload the system never looks "in step."
- **Low amplitudes.** Opacity deltas in the 0.08-0.15 range. Scale deltas in the 0.01-0.05 range. If you can see the keyframe boundaries, it's too much.
- **CSS keyframes, not RAF.** RAF is for things that respond to input (drag, mouse follow). Ambient motion is fire-and-forget; CSS composites cheaper and survives tab backgrounding sanely.
- **`transform` and `opacity` only.** Anything else causes layout/paint on every frame on mobile.
- **One "heartbeat" element.** A single small indicator dot pulsing at ~2.5s reads as "the system is listening." Without it, the slower loops feel decorative rather than sentient.
- **Drift, don't loop visibly.** Particles should travel off-screen and recycle from off-screen, never visibly snap back. Use `bottom: -2%` start, `translate3d(0, -110vh, 0)` end, `animation-iteration-count: infinite`.

**Why:** the brain reads many slow independent rhythms as biological (breathing room, dust in light, candle flicker). It reads a single fast rhythm as mechanical. The frequency *gap* between the heartbeat dot (~3s) and the room breath (~10s) is what does the heavy lifting.

**How to apply:** entry/splash sequences, ambient hero sections, "thinking" states, idle indicators. Skip on input-heavy surfaces (forms, lists) where motion competes with the user.
