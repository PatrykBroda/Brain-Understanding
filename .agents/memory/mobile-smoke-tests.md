---
name: Mobile smoke tests
description: How the frame-mobile Playwright smoke suite works — auth, structure, and rebuild requirements.
---

# Mobile smoke tests

## Files
- `e2e/mobile-smoke.spec.ts` — 4 tests
- `e2e/global-setup.ts` — seeds two Clerk accounts + DB rows
- `playwright.config.ts` — Nix Chromium path; baseURL defaults to
  http://localhost:80 but the smoke runners override it via `SMOKE_BASE_URL`
  to their isolated smoke-proxy port (mobile: :19000) so runs never touch the
  main workflow ports

## Auth strategy
`@clerk/testing/playwright` ticket strategy (`clerk.signIn()`). No CAPTCHA,
no password form. After injection, `page.goto('/mobile/')` reloads so Expo
Router re-evaluates `isSignedIn`.

**Why:** UI sign-in via form fails with bot-detection in headless Chromium.

## Two test accounts
- `frame-smoke-main@example.com` — has a fighter → redirects to /mobile/home
- `frame-smoke-fresh@example.com` — fighter deleted each run by global-setup → onboarding

## Test 2 is API-only
The onboarding UI crashes in headless Chromium (native animation libs). Test
2 signs in, gets a bearer token, then POSTs directly to `/api/fighter` with
camelCase fields. This guards the real regression (wrong field names) without
needing the UI to render.

## Bearer token
```ts
window.Clerk.session.getToken()
```
Works after `clerk.signIn()` even if the React tree has crashed.

## After any code change to frame-mobile
Must rebuild and restart before running tests:
```
pnpm --filter @workspace/frame-mobile run build
# then restart "artifacts/frame-mobile: expo" workflow
```

## How to apply
Run validation: `mobile-smoke` command, or:
```
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium pnpm run test:mobile-smoke
```
