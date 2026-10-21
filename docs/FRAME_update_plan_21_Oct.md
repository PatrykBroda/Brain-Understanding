# FRAME update of 21 Oct 2026: implementation plan

This plan responds to Harry Roberts' "FRAME Developer Update, 21 Oct 2026". It is based on reading the code at commit `e920366` ("Harry's 20 Oct fixes").

There are two clients, and most changes need to be made in both:
- **frame-mobile**: the Expo / React Native App Store app.
- **coach**: the React/Vite PWA, served at the web address.

The mobile Analyse tab loads the coach `/analyse` page in a WebView. Video analysis work therefore happens only in `coach`.

File paths are relative to `artifacts/`.

---

## Suggested order of work

| # | Item | Size | Why this position |
|---|------|------|-------------|
| 1 | Login persistence (§1) | S–M | Top priority. The likely fix is small; it may only need a new build. |
| 2 | Chat reliability (§6) | L | Top priority. It has several separate causes. |
| 3 | Home reorder + check-in note (§2) and Home button/Terms (§3) | S | Quick wins |
| 4 | Logos (§7) | S | Needs the asset confirmed first |
| 5 | Mission card text (§9) | S | Quick win |
| 6 | State screen redesign (§5) | M | Needs the orb gesture work |
| 7 | Typography sweep (§4) | L | Touches ~770 style sites. Do it after the screens above settle, to avoid rework. |
| 8 | Athlete selection in video (§8) | L | Partly built already |

---

## Questions for Harry before or during the work

1. **Gold button hex (§3).** Mobile brand gold is `#8A6A2F` (`frame-mobile/constants/colors.ts`). The login screen uses a lighter champagne gold, `#B9A477`. There are also about a dozen one-off golds.
   - Which hex is the approved brand value?
   - Which button is "the home screen gold button"? Mobile Home has no filled gold button; it only has gold text links like "Answer now" and "Set a camp". On the web Home it is the outlined "Work on it with your coach" button.
2. **C3 PNG octagon (§7).** The repo contains an unused clean master, `attached_assets/FRAME_Octagon_Transparent_4096_(1)_*.png`: 4096², really transparent, white spiral octagon. Is this the C3 asset?
   - The PNG added yesterday (`coach/public/frame-octagon-logo*.png`) was cropped from a WhatsApp screenshot. It still contains the chat bubble's circle edge, its strokes are semi-transparent (max alpha 190), and it is low resolution. It should not be used as the final asset.
3. **"Black screenshot of the octagon above the analysing area" (§7).** We believe this is the octagon image in the Analyse header (`coach/src/pages/analyse.tsx:503-511`). It may instead be the logo inside the "Reading footage" overlay. A screenshot would settle it.
4. **Check-in note conflict (§2).** Yesterday's commit removed the "No readiness check-in today…" note from Home and moved it to State. Today's brief puts it back on Home under Fight Readiness, and §5 bans readiness content on State. We'll follow today's brief: on Home, not on State.
5. **"Keep your profile current" (§2).** On mobile it is one entry in the "First use pointers" block, next to "Check in on how you feel". We plan to move the whole block below Readiness History.

---

## §1 Keep users signed in (priority)

**What exists now**
- The banner is shown when `establishSession()` (`frame-mobile/lib/authSession.ts:127-147`) fails to write the token to SecureStore twice. The app then runs "memory-only" and loses the login on restart. The banner text is in `frame-mobile/context/AuthContext.tsx:149-152` and is rendered in `app/_layout.tsx:113-139`.
- `frame-mobile/lib/tokenBackend.ts:6-11` already contains a fix for the bug that produces exactly this symptom. The SecureStore key used to be `"frame:token"`. A colon is an invalid key character, so **every save threw** and every cold start went to sign-in. The key is now `"frame.token"`, and there is a regression test.
- The server token TTL is 90 days (`api-server/src/routes/auth.ts:37`). Only a real 401 from `/auth/refresh` clears the token.

**Most likely cause, in order**
1. The build on users' phones predates the key fix. Check the TestFlight/App Store build date against this code. `app.json` has version `1.2` and no `buildNumber`.
2. SecureStore still throws on some devices. Nothing records why, because `establishSession` swallows the error.
3. On a cold start while the phone is locked or launching in the background, the restore read can fail ("unreadable"). The app then routes to `/sign-in`, which looks like a sign-out.
4. A real 401: `SESSION_SECRET` differs between autoscale instances or was rotated, or the database was reset.

**Plan**
1. Confirm the shipped build. If it predates the fix, bump `buildNumber`/`version` and ship. Nothing was ever saved under the old key, so no migration is needed.
2. Log the actual SecureStore error message, with platform and OS, via the existing `reportStartup`/crash log path in `authSession.ts`. That way any remaining failures have a cause.
3. On cold start, treat "unreadable" as *not yet loaded* rather than signed out.
   - Show the boot screen and retry the read with backoff, and again on AppState `active`.
   - Only route to `/sign-in` when there is truly no token.
   - Change: `AuthContext.tsx:91-127` and `app/index.tsx:51-52`.
4. Make sure the token is deleted only by an explicit Log out or a real 401 from `/auth/refresh`, never by network or 5xx errors. Mobile already behaves this way; add a test.
5. Server: confirm that `SESSION_SECRET` is one fixed secret across all deployments.
6. Web (coach): `localStorage` write failures are currently swallowed (`coach/src/context/auth-context.tsx:136-140`). Report them the same way.
7. Keep the memory-only fallback as a true last resort; it's an intentional security choice, see `.agents/memory/mobile-auth-persistence-fallback.md`. Once steps 1–3 land, the banner should stop appearing. Per Harry, the fix is the cause, not hiding the message.
8. Housekeeping: `.agents/memory/clerk-removal.md` still says the key is `frame:token` and the TTL is 30 days. Correct it so nobody reintroduces the bug. `replit.md` also still says 30 days.

**Done when** login survives: force-quit, swipe away, phone reboot, launch while locked, and an app update. The banner no longer appears in normal use.

---

## §2 Reorder the Home screen

**What exists now**

Mobile `frame-mobile/app/(tabs)/home.tsx` order:
1. hero/name (419-468)
2. CompetitionBanner (470)
3. onboarding questions (472-489)
4. Today's Focus (491-500)
5. FirstUsePointers, which contains "Keep your profile current" (502-515)
6. Fight Readiness (517-609)
7. Readiness History (611-631)
8. Competition Context (634-666)

Web `coach/src/pages/dashboard.tsx` has the same shape, plus the gold "Work on it with your coach" button at 540-546.

The note "No readiness check-in today. This read comes from what you have told FRAME so far. A check-in sharpens it." is generated server-side in `api-server/src/lib/dailyContext.ts:391-397`. It is rendered by `DisclosureNotice` (`frame-mobile/components/TodayCards.tsx:13-37`), which is only used on State. On web, `DisclosureNotice` (`coach/src/components/today-cards.tsx:11-36`) exists but is never rendered.

**Plan (both clients)**
1. Final order:
   1. hero/name/rank + CompetitionBanner (if a camp is set)
   2. Today's Focus
   3. Fight Readiness score + metrics
   4. `DisclosureNotice` with the "Check in now" action (opens the check-in form in place)
   5. Readiness History
   6. FirstUsePointers ("Keep your profile current")
   7. Competition Context
2. Show the note only when there is no check-in today, using the existing `no_checkin_today` disclosure code.
3. The old in-card empty text in Fight Readiness ("NO CHECK-IN TODAY. LAST CHECK-IN … THAT IS NOT TODAY'S READINESS") becomes redundant. Remove it so the message isn't shown twice.
4. The onboarding questions card isn't in Harry's list. Keep it directly under the hero, since it only shows until answered. Confirm with Harry.
5. Change the action label from "CHECK IN NOW" to "Check in now", as part of §4.

## §3 Home button colour and the Terms label

1. **Gold button.** Once Harry confirms the hex:
   - add a single token: mobile `constants/colors.ts` (`gold`), web `--primary` in `coach/src/index.css:87,130`;
   - point the Home button at it;
   - then replace hard-coded `#8A6A2F` values in a follow-up sweep. There are 126 on mobile, many as local `const ACCENT`.
   - Don't invent a value.
2. **Terms label.** Change the visible "Terms" to "Terms of Use (EULA)" in:
   - `frame-mobile/app/sign-in.tsx:93`
   - `coach/src/components/auth-layout.tsx:44`
   - `coach/src/pages/profile.tsx:385`

   Also make these consistent:
   - mobile Profile "TERMS OF SERVICE" (`profile.tsx:941`)
   - sign-up links (`frame-mobile/app/sign-up.tsx:164,177`, `coach/src/pages/sign-up.tsx:171`)

   The paywall already says "TERMS OF USE (EULA)".

---

## §4 Standardise typography

**What exists now.** The grey "military/code" font is **Space Mono**: small, uppercase, wide tracking, grey (#555–#777).
- Mobile: 227 `fontFamily: "SpaceMono"` declarations across 27 files. They are inline StyleSheet entries with no shared component. The heaviest files are profile (38), planner (31), home (26), competition (17) and WeeklyMission (13).
- Web: 543 `font-mono` uses across 41 files, usually `font-mono text-[9-10px] uppercase tracking-[0.3em] text-foreground/40`.

The target style is the Home sentence "No readiness check-in today…": **Outfit, 14/21, `#cfcfcf`, sentence case, no letter-spacing.**

**Plan**
1. Define shared text styles once:
   - Mobile: `constants/typography.ts` exporting `label`, `caption`, `meta`, `sectionTitle`, `body`. All use Outfit and white/near-white, with hierarchy set by size (11–16) and weight (400/500/600), and `letterSpacing: 0`.
   - Web: utilities in `coach/src/index.css` (`.text-label`, `.text-caption`, `.text-meta`, `.text-section`) using `font-sans`, with no tracking and no uppercase.
2. Sweep screen by screen: replace each Space Mono style with the matching shared style.
   - Rewrite literal ALL-CAPS strings and `.toUpperCase()` calls to sentence case. Keep names and acronyms (FRAME, HR, BJJ, MMA, EULA) as they are.
   - Leave text that is already white in that style alone.
3. Coloured choice boxes (`AnswersSection` `ChipSelector` on mobile, `answers-section.tsx` / `calibration-card.tsx` on web, Camp session chips): change only their font. Keep their borders, colours and selection behaviour.
4. Once nothing uses them, remove Space Mono from font loading (`frame-mobile/app/_layout.tsx:305-315`, `coach/src/index.css:1`). Also remove the unused Inter / Oswald / JetBrains Mono loads in `coach/index.html:40`.
5. Add a lint check that fails on new `SpaceMono` / `font-mono` / `uppercase tracking-` uses, so the old style doesn't creep back.
6. Check every screen on a small phone (iPhone SE size), since sentence-case Outfit is wider per character than tracked caps would suggest.

---

## §5 Redesign the State screen

**What exists now.** Mobile `frame-mobile/app/(tabs)/state.tsx`:
- header: octagon `frame-logo.png` + FRAME wordmark PNG + "STATE · CALIBRATION SYSTEM"
- `OrbGL` (react-three-fiber, `pointerEvents="none"`)
- "STATE" caption, state name, date line, cue
- `DisclosureNotice`
- a Fight Readiness row
- CONTINUE, with top and bottom border lines

The orb is shrunk by 175px whenever the check-in note shows, and by 24px for the date (`state.tsx:102-113`). That is why it got smaller.

Web `coach/src/pages/state.tsx` is similar. It has a `FrameWordmark` header (FRAME AI), a readiness link and "Check in now", and gradient divider lines.

**Plan (both clients)**
1. Remove the date line, `DisclosureNotice`, the Fight Readiness row and the web "Check in now". Leave no readiness wording anywhere on the screen.
2. Header: remove the FRAME/FRAME AI wordmark and keep only the octagon. On web the header currently has no separate octagon, so add the confirmed C3 PNG (§7).
3. Orb size: remove the 175/24px deductions and raise the cap from 400 so the orb fills the freed space. On web, keep the grid row that already lets it fill.
4. Orb interaction:
   - On mobile, wrap the orb in a `GestureDetector` (react-native-gesture-handler 2.28 + Reanimated 4, both installed).
     - **Pan** moves the orb with a spring back to centre on release, kept inside the screen.
     - **Tap** shows a short tip bubble for the current state.
   - Remove `pointerEvents="none"` from the wrapper, or put the gesture on a sibling overlay that covers the canvas.
   - On web, do the same with pointer events.
   - Tips: write 3–4 short lines per state in `STATE_TIPS`, next to `STATE_CUE`, and rotate through them on each tap. Copy needs Harry's sign-off.
5. Below the orb, top to bottom:
   - "State"
   - the state name (e.g. "Volatile"), in the state's colour
   - one or two sentences on *why* this state and colour are showing (server `state.source` from `dailyContext.ts:97-157`) and *what to do next* (the existing cue)
   - Continue, with no border lines on mobile and no gradient lines on web
6. Apply the §4 typography.
7. Don't change `deriveState()` or any State logic; this is display only.

---

## §6 Chat speed and reliability (priority)

**Causes found, most likely first**
1. **A very large prompt on a cold cache.** The whole SYNOCHI vault (~342K chars, ~85K tokens) is in the system prompt on every turn, with a 5-minute cache. After any idle gap, the first reply token waits on an ~85K-token cache write: tens of seconds, and ~24s has been seen in production. Server retries and the OpenAI fallback can push it past the client's 60s first-token watchdog, which then shows "MESSAGE NOT DELIVERED".
2. **Nothing is sent while the user waits.** There's no SSE heartbeat, so idle connections can be dropped by the proxy or iOS during the silent wait.
3. **The server ignores client disconnects.** When the client gives up, the server keeps generating and saves the reply. Mobile never reloads history, so the user sees a failure for a reply that exists. Retry then starts a *second* generation in parallel, so duplicate replies are possible.
4. **The retry budget is longer than the client waits.** It allows 40s of retries plus a fresh 40s for the fallback, with no per-attempt timeout (`api-server/src/lib/aiRetry.ts:82-83`, `routes/coach.ts:620`).
5. **Mobile does an extra `GET /ai-consent` before every send** (`frame-mobile/app/(tabs)/chat.tsx:483-507`). It adds latency and another way to fail, and its error bubble has no retry. Node's default `keepAliveTimeout` of 5s makes the first request after a long pause likely to hit a stale connection on iOS.
6. **`done` is sent only after the reply is saved to the database.** A slow insert therefore looks like a failure.
7. **Mobile accepts a reply cut off mid-stream as complete**, with no error, so truncation goes unnoticed.

**Plan**

*Server* (`api-server/src/routes/coach.ts`, `src/index.ts`, `lib/aiRetry.ts`)
1. Write an SSE heartbeat (`: ping\n\n`) every 10s from header flush to end.
2. Abort the provider stream when the client disconnects (`req.on("close")` → `AbortController` → `signal`). Keep saving the partial reply if any content arrived.
3. Put retries and the fallback under one shared deadline, below the client's 60s, and add a per-attempt timeout.
4. Send `{done}` before the database insert (or in parallel), and make the insert failure path not emit a client error after a complete stream.
5. Accept a client-generated `clientMessageId` and store it on the user message.
   - A repeat with the same id attaches to the in-flight turn, or returns the saved reply.
   - It never starts a second generation.
6. Cut first-token latency:
   - measure cache read/create tokens per turn; logging already exists;
   - switch the static block to the 1-hour cache TTL;
   - add a lightweight warm-up when a user opens Chat;
   - trim the full vault so only the relevant notes are retrieved (`vaultRetrieval.ts` already selects deep nodes). Do this last; it's the biggest lever, but it changes coaching quality and needs Harry's eye.
7. Set `server.keepAliveTimeout` (e.g. 65s) and `headersTimeout` above the proxy's.

*Clients* (`frame-mobile/app/(tabs)/chat.tsx` + `lib/api.ts`; `coach/src/hooks/use-chat.ts`)
1. Clear processing indicator: keep the octagon `TypingIndicator`, add a "Thinking…" label, and after ~15s change it to "Still working on this…" so a slow reply doesn't look stuck.
2. Before showing "Message not delivered", re-fetch `/conversation/active`. If the reply landed, show it instead of an error. Do the same on app foreground (AppState `active` / `visibilitychange`).
3. Keep the failed user message in the thread with a Retry button.
   - Retry reuses the same `clientMessageId`, so it can't duplicate.
   - Disable the button while a retry is running.
4. Cache the `/ai-consent` result instead of fetching before every send. Give its error bubble a Retry button.
5. If content arrived and then the stream dropped, mark the reply "Reply interrupted" with a Retry button instead of treating it as complete.
6. Web: stop showing "Connection dropped" for 401/403/500; map them to accurate messages.

*Header*
- Centre the login screen's FRAME wordmark (`FrameLogo`, the SVG used by `EntryBrand` / `auth-layout.tsx`) at the top of Chat.
  - Mobile: replace `frame-wordmark.png` at `chat.tsx:802`.
  - Web: replace `FrameWordmark` (octagon + "FRAME AI") at `coach/src/pages/chat.tsx:267`.
- Also replace the old FRAME AI wordmark on Home (`frame-mobile/app/(tabs)/home.tsx:453-457`, `coach/src/pages/dashboard.tsx:426`) and in `AiAnalysisConsentModal`.

**Verification**
- Test:
  - a cold cache (first message after more than 5 minutes idle);
  - a 100+ message conversation;
  - network throttling (iOS Network Link Conditioner: 3G and Edge);
  - backgrounding the app mid-reply;
  - airplane mode during send;
  - double-tapping Retry.
- Pass criteria: no duplicate replies, no "not delivered" for replies that were saved, and the indicator is always visible while pending.
- Add server tests for heartbeat, abort and idempotency next to the existing `__tests__`.

---

## §7 Logos in loading and video analysis

**What exists now**
- Web Analyse header (`coach/src/pages/analyse.tsx:503-511`): an octagon image cropped from a screenshot. This is the likely "black screenshot" Harry wants deleted.
- The "Reading footage" overlay (`analyse.tsx:2755-2768`) uses the same cropped PNG.
- "Loading read" (`analyse.tsx:1667, 2581`) and the opponent report (`opponent-report.tsx:41`) use the code-drawn `FrameOctagon`. It is equal-radius, not Harry's spiral; this is the "AI-rendered" one.
- The login → app transition uses code-drawn spinners:
  - web `App.tsx:31-41` `BootScreen` (`FrameOctagon`)
  - mobile `app/_layout.tsx:178-186` (`OctagonSpinner`)
- Web Camp (`planner.tsx:78-85`) uses `frame-logo.png`, which has an opaque black background.

**Plan**
1. Once Harry confirms the C3 asset:
   - Make @1x/@2x/@3x copies by **scaling the original only**: trim transparent padding and resize, with no redrawing.
   - Put them in `coach/public/` and `frame-mobile/assets/images/`.
   - Replace the screenshot-cropped `frame-octagon-logo*.png` files.
2. Delete the octagon `<img>` in the Analyse header (`analyse.tsx:503-511`) entirely.
3. "Reading footage" overlay and "Loading read" spinners: use the C3 PNG, keeping its proportions with a slow pulse or rotation on the image itself. Remove `FrameOctagon` from the analysis screens.
4. Login → app transition: web `BootScreen` and mobile `LoadingScreen`/`BootLoader` show the C3 PNG instead of the drawn spinners.
5. Replace the opaque `frame-logo.png` on web Camp with the C3 PNG.
6. Then check whether `FrameOctagon` / `OctagonSpinner` are still used (chat typing indicator, bottom nav, camp). Ask Harry whether those should become the C3 PNG too, so there's a single octagon throughout.
7. Check every placement on black and on the hero image for any visible rectangle.

---

## §8 Athlete selection in video analysis

**What exists now** (from yesterday's commit)
- Before upload, a "Who is who" form (`analyse.tsx:1024-1106`) has a left/right toggle and two short descriptions. These are sent as `athleteContext` and appear in the AI prompt (`api-server/src/lib/athleteContext.ts`).
- A "Which one is you?" picker (`components/person-picker.tsx`) lets you tap the blue or red skeleton. It is only shown when an automatically chosen frame has two upright, separated people. That's rare in BJJ, which is mostly on the floor and overlapping.
- The AI returns `identity.confident`; when false, the review question asks "which one are you?".

**Gaps**
- The description and side **do not affect which person is measured**. The scores always come from the best-tracked body (`people[0]`) unless the picker appears. The AI may then describe one person while the numbers belong to the other.
- There is no way to pause on a chosen frame. When the picker can't appear, the app silently guesses.
- When the AI isn't sure who is who, nothing is re-analysed; the answer is only saved as a note.

**Plan**
1. **Pause and tap.** After the video is chosen, show a scrubbable player: "Pause on a clear moment and tap yourself."
   - On tap, run pose detection on that frame and pick the body nearest the tap.
   - Match it to a tracked person by timestamp and position, using the existing tracks and colour fingerprints in `pose-people.ts`.
   - Highlight the chosen person so the user can confirm.
   - Move the optional "what you're wearing" field into this same step, next to the frame.
2. **Use the choice for the measurement.** Pass the chosen track into `splitAthlete` so the scores, keyframes (athlete blue, opponent red) and AI narrative are all about the same person.
3. **Fallbacks**
   - If the tap hits no body, use the side + clothing colour to choose the track. Use the hip position at that frame, plus matching the description's colour to the tracker's colour fingerprint.
   - If that fails, send the tap point + timestamp + description to the AI as text, and mark the selection "unverified".
4. **Send the selection with the request.**
   - Add `athleteSelection { timeSec, x, y, method: "tap" | "side" | "auto", trackMatched: boolean }` to the request (`coach/src/lib/api.ts`).
   - Validate it in `api-server/src/routes/analysis.ts` alongside `sanitiseAthleteContext`, store it in `metrics`, and state it in the prompt's "Who is who" section.
   - Add a test that the selection actually reaches the prompt, so the control can never be decorative.
5. **Ask, don't switch.**
   - If two people are tracked and the user hasn't chosen, require the tap step instead of silently using `people[0]`.
   - If the AI returns `identity.confident = false`, don't present the read as final. Show "Which one are you?" with the same pause-and-tap step, then re-run the analysis for the chosen person.

---

## §9 Fight Camp mission card text

**What exists now**
- Mobile `frame-mobile/components/WeeklyMission.tsx:396-405` puts the summary line (`sourceLabel`) and the schedule (`suggestedDays`) side by side in one row.
- The summary has `numberOfLines={1}`, so it is cut off with an ellipsis, and a long schedule squeezes it further. They use Space Mono 8 in `#444`.
- Web `coach/src/components/camp-mission.tsx:454-590` has no clamp, but uses the same side-by-side footer.

**Plan**
1. Remove `numberOfLines={1}`. Stack the summary and schedule vertically: summary first and wrapping fully, schedule on its own line beneath. The card grows to fit.
2. Do the same on web: stack the footer into a column on narrow screens.
3. Apply the §4 white typography; the current `#444` at 8pt is also hard to read.
4. Check every mission card at 320pt width (iPhone SE) and with the largest iOS text size.

---

## Completion checklist (from Harry's brief)
- [ ] Login survives an app restart, swipe-away, reboot and update; the banner no longer appears in normal use
- [ ] Home sections are in the specified order, with the check-in note under Fight Readiness
- [ ] State has the larger draggable/tappable orb, no date, no readiness content and no FRAME AI wordmark
- [ ] Chat sends reliably, shows a processing indicator, retries without duplicates, and uses the new centred wordmark
- [ ] Both video logo defects are fixed using the confirmed C3 PNG
- [ ] The athlete selection reaches both the measurement and the AI analysis
- [ ] All mission summaries are fully readable on small screens
- [ ] Typography is consistent across the app, and the coloured choice boxes are unchanged apart from their font
