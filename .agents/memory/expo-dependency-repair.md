---
name: Expo dependency relinking after interrupted installs
description: Recovery when Expo package installation fails after changing manifests or Metro sees temporary package paths.
---

After adding an Expo native module, if the Expo CLI install wrapper reports a missing post-install helper, check that the intended dependency and lockfile entry were written. Run pnpm install --frozen-lockfile to finish linking packages, then restart the managed Expo workflow once. A Metro ENOENT for a temporary package path during relinking is not by itself evidence of an app-source bug.

**Why:** In this workspace the Expo wrapper failed after the package and lockfile had changed; a frozen workspace install restored package links and the Expo workflow started normally.

**How to apply:** Use this sequence after Expo dependency installation leaves the dev workflow unable to resolve temporary package paths; do not repeatedly restart Metro while pnpm is still changing node_modules.
