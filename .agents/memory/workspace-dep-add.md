---
name: Adding workspace deps in this monorepo
description: pnpm add fails for @workspace/* packages — edit package.json manually then pnpm install
---

Rule: to add a `@workspace/*` lib as a dependency of another workspace package, do NOT use `pnpm add` (it tries the npm registry and fails). Edit the consumer's `package.json` by hand with `"@workspace/<name>": "workspace:*"`, then run `pnpm install`.

**Why:** `pnpm add @workspace/ontology` errored against the registry even with the workspace protocol available; manual edit + install is the reliable path in this repo.

**How to apply:** any time a lib in `lib/*` gains a new consumer (artifact or another lib). For lib→lib imports also add the TS project reference per the pnpm-workspace skill.
