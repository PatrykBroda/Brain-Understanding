---
name: Global auth schema readiness
description: Schema migration requirements for database reads performed by authentication middleware.
---

Before deploying an auth middleware change that reads user-table fields, ensure the development schema has been synchronized and that the production schema will receive the same additive change through Publish. Because authentication middleware runs on every signed-in request, a missing column can turn all authenticated routes into server errors, including consent and account routes.

**Why:** A password-session revocation check queried a new nullable column that was present in source schema but absent in production, causing authenticated requests to fail with HTTP 500 before reaching their routes.

**How to apply:** Keep the Drizzle schema and migration aligned, let the normal post-merge setup synchronize development, and use Replit Publish to apply the production schema diff. Never add startup-time DDL or mutate the production schema directly.
