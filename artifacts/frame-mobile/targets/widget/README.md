# FRAME home-screen widget (not wired into a build)

Done: JSON payload (`lib/widgetData.ts`, tested), writer (`lib/widgetBridge.ts`, no-op until the native
module exists, called from Home), SwiftUI widget source (`FrameWidget.swift`, never compiled).

Not done (needs Xcode/EAS + Apple account; deliberately NOT added to app.json so prebuild keeps working):
1. `pnpm add @bacons/apple-targets`, add it to app.json `plugins`, and add `expo-target.config.js`
   here with `type: "widget"` and entitlement `com.apple.security.application-groups: ["group.app.replit.frame"]`.
2. Enable the same App Group on the main app (`ios.entitlements`) and in the Apple developer portal.
3. Add a small local Expo module `FrameWidgetBridge` with `setItem(appGroup, key, json)`
   (`UserDefaults(suiteName:)`) and `reload()` (`WidgetCenter.shared.reloadAllTimelines()`).
4. New EAS build; verify on a device.
