---
name: pnpm workspace package installs
description: Why the generic Node package installer fails when adding dependencies to an artifact package in this monorepo
---

The generic Node language-package installer invokes `pnpm add` at workspace root without `-w`. pnpm rejects this with `ERR_PNPM_ADDING_TO_ROOT`, and passing `-w` as a package token is rejected by the installer. For an artifact-specific dependency, target the package explicitly with a filtered pnpm add.

**Why:** Two generic-installer attempts could not express the target package; the filtered install worked without making a misleading root dependency.

**How to apply:** When adding a dependency to a monorepo artifact, check its package manifest and use a package-targeted install rather than retrying the generic installer at root.