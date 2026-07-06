---
name: Mobile pose frame extraction (browser / iOS Safari)
description: How to sample video frames for on-device MediaPipe pose so it works on mobile Safari instead of hanging.
---

# Sampling video frames for on-device pose on mobile

**Rule:** To feed frames to MediaPipe (or any on-device video model) in a browser —
especially iOS Safari — **play the video through and sample presented frames via
`requestVideoFrameCallback`** (with an `rAF` + `currentTime`-poll fallback). Do NOT
use a detached, never-played `<video>` sampled by setting `currentTime` and waiting
for `seeked`.

**Why:** iOS Safari will not decode a `<video>` that was never played or is
`display:none`. Its `seeked` event then never fires, so a seek-based sampler hangs
forever — observed as the Analyse feature stuck at ~1% on phones. `play()` must also
be started **inside the user gesture** (the file-picker task); iOS blocks
programmatic `play()` outside a gesture.

**How to apply:**
- Attach the video off-screen but still laid out (tiny size + near-zero opacity,
  NOT `display:none`), `muted` + `playsinline` + `webkit-playsinline`.
- Call `play()` before any `await` so it stays in the gesture task; load the model
  in parallel.
- Add a stall watchdog (e.g. fail if media time stops advancing for ~6s) and throw
  an **honest** error — never return fabricated/empty results silently.
- Give `detectForVideo` a **strictly increasing** timestamp that persists across
  analyses (the landmarker is usually a module-level singleton, so a per-call
  counter reset would go backwards on the 2nd video).
- Any displacement/energy metric computed between sampled frames must be normalised
  by the real `dt` (to a nominal window like 0.25s). Play-through sampling gives
  uneven gaps per device; without normalisation the derived scores drift vs desktop,
  breaking the no-fabricated-numbers contract.
- Clean up on every path (success and each error): revoke the object URL, pause,
  detach `src`, `load()`, and remove the element from the DOM.
