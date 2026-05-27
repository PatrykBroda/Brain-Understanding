---
name: Inline <style> keyframes timing trap
description: Why a screenshot can show an element as missing even though it renders fine in a live browser.
---

If you put `<style>{`@keyframes ...; .frame-rise-in { animation: ... both; }`}</style>` at the bottom of a JSX tree and apply `frame-rise-in` to an element with `from { opacity: 0 }`, there is a window where:

1. The element's class is in the DOM.
2. The `<style>` element hasn't been parsed yet OR `animation-fill-mode: both` is holding the from-state through the delay.
3. A screenshot taken in that window captures `opacity: 0` and the element looks missing.

This silently burned an hour debugging "the CTA is not rendering" — the element was there the whole time, just at opacity 0.

**Why:** `animation-fill-mode: both` means the `from` keyframe is applied during `animation-delay` (before play). Combined with a slow CSS apply or a screenshot tool that fires earlier than expected, you get an invisible-but-mounted element.

**How to apply:**
- For elements that MUST be visible immediately (CTAs, primary content), do not gate them behind a CSS entry animation with `opacity: 0` initial state. Render them at final visibility and let them animate only if you can tolerate them being invisible for ~1s.
- If you must animate in, prefer a tiny delay (≤0.1s) and a short duration, OR put the keyframes in `index.css` (parsed once at app boot) instead of an inline `<style>` block at the end of the component tree.
- When debugging "element not rendering," always test by inlining `style={{ outline: '2px solid red' }}` — confirms in one shot whether the element is in the DOM at all vs. invisible vs. truly absent.
