---
name: PWA service-worker shared-origin scope
description: Why the coach PWA service worker must deny-list /api, /mobile, /healthz in navigateFallback.
---

# Coach PWA service-worker scope on a shared origin

The `coach` artifact is served at `/` but its origin is SHARED (via the path-routing
proxy) with the Expo app at `/mobile/` and the API at `/api` (+ `/healthz`). A
service worker registered from `/` claims scope `/` — i.e. the WHOLE origin.

**Rule:** `vite-plugin-pwa` `workbox.navigateFallbackDenylist` must exclude every
sibling artifact's path, otherwise the SW serves the coach's `index.html` for
navigations into `/mobile` or `/api`, hijacking those surfaces offline/after install.

**Gotcha:** match BOTH the bare path and subpaths — use `^/api(?:\/|$)`, not
`^/api\/`. A trailing-slash-only regex misses `/api` and `/mobile` with no slash.

**Why:** caught in code review — `^/mobile\/` let a navigation to bare `/mobile`
fall through to the coach SPA shell.

**How to apply:** whenever a new artifact is added on this origin, add its path to
the denylist. Keep the SW production-only (`devOptions.enabled: false`) so it never
interferes with dev cache-control.
