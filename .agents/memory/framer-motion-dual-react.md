---
name: Framer-motion dual React in pnpm workspaces
description: Why motion.* components crash silently with "useContext on null" in this monorepo and what to use instead.
---

When a React component using `motion.div` (or any framer-motion primitive) renders, you may see a console error:

> Invalid hook call. Hooks can only be called inside of the body of a function component.
> TypeError: Cannot read properties of null (reading 'useContext')
> at MotionDOMComponent (node_modules/.vite/deps/framer-motion.js)

The whole subtree wrapped in `motion.*` then fails to render (often swallowed by an upstream error boundary, so the page looks "fine" except one element is missing — extremely confusing).

**Why:** pnpm's symlinked node_modules + Vite's dependency pre-bundling can resolve two separate React copies — one for the app, one nested under framer-motion's own resolution. React's internal dispatcher is null in the second copy, so any hook call inside framer-motion blows up.

**How to apply:** Do not introduce `framer-motion` `motion.*` components in this workspace. Use plain `<div>` + CSS `@keyframes` in a `<style>` block or in `index.css`. CSS animations cover everything we've needed (fade/scale/translate/breath/glow). If framer-motion is unavoidable in the future, the proper fix is a Vite `resolve.dedupe: ['react','react-dom']` plus `optimizeDeps.include: ['framer-motion']` — but pure CSS has been simpler and zero-runtime-cost every time.
