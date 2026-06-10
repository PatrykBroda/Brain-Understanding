---
name: Clerk proxy URL — runtime computation
description: VITE_CLERK_PROXY_URL must never be a build-time env var; compute it from window.location at runtime instead.
---

## Rule
Do NOT use `import.meta.env.VITE_CLERK_PROXY_URL` for the Clerk proxy URL. Compute it at runtime:

```ts
const isDevDomain =
  window.location.hostname === "localhost" ||
  window.location.hostname.endsWith(".replit.dev");
const clerkProxyUrl = isDevDomain
  ? undefined
  : `${window.location.origin}/api/__clerk`;
```

**Why:** If `VITE_CLERK_PROXY_URL` is not set as a deployment secret (it often isn't), the production build gets `proxyUrl=undefined`. Clerk then talks directly to `frontend-api.clerk.dev`, which is a third-party domain on `.replit.app`. Browsers block those third-party cookies, so `getAuth(req)` gets `hasSessionId: false / hasUserId: false` → 401 → "Session not verified" on the published site.

**How to apply:** Anywhere `ClerkProvider` receives `proxyUrl`. In `artifacts/coach/src/App.tsx` — replace the `import.meta.env.VITE_CLERK_PROXY_URL` line with the runtime computation above.

The proxy middleware (`clerkProxyMiddleware.ts`) is a no-op in dev (`NODE_ENV !== 'production'`), so `undefined` on dev domains is correct — Clerk talks directly to Clerk FAPI in dev.
