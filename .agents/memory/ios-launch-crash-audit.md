---
name: iOS launch-crash audit (frame-mobile)
description: Root causes found for instant iOS launch crashes in the Expo app and the checks that expose them.
---

# iOS instant launch crash — what to check (July 2026 findings)

Rule: a silent JS crash reporter (no module-init probe) means the binary dies **before the JS bundle loads** → look for native-level problems, not JS bugs.

**Why:** the FRAME iOS binary crashed instantly on TestFlight with zero crash-log POSTs despite a working reporter.

**How to apply / findings:**
- `cd artifacts/frame-mobile && npx expo-doctor` — its duplicate-native-module check is the highest-signal test. `expo-auth-session@56.x` (wrong major; SDK 54 wants ~7.0.x) dragged in duplicate `expo-constants`/`expo-linking`/`expo-web-browser` natives → classic instant iOS crash.
- `expo-auth-session` CANNOT be removed: `@clerk/clerk-expo` requires it as a peer (>=5). Fix the version, don't delete.
- `react-native-reanimated` 4.x REQUIRES the New Architecture — never set `newArchEnabled: false` while it's installed (that itself crashes). Worklets (`react-native-worklets` 0.5–0.8) is a required peer of reanimated 4; don't remove it either.
- Unused native packages still link into the binary: `expo-location` with no `NSLocationWhenInUseUsageDescription` risks termination — remove unused native deps rather than leaving them.
- Crash reporter must have a hardcoded fallback domain; if it depends only on `EXPO_PUBLIC_DOMAIN` and the EAS secret is unset, every report is silently dropped and you fly blind.
- `npx expo install --check` / `npx expo install <pkg>` are the canonical ways to align versions with the SDK.
