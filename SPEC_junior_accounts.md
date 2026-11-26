# SPEC: Junior accounts, Join a gym, gym performance boards

Status: DRAFT for Harry Roberts. Branch `junior-accounts`, all behind `JUNIOR_PORTAL_ENABLED`. Nothing here is legal advice and no legal rule has been invented: every age, consent and retention value is a config constant marked `TODO(Harry)` in `artifacts/api-server/src/lib/junior/accountConfig.ts`, and defaults are deliberately conservative.

In the UI these are called **junior accounts** (never "child accounts").

## 1. Model

Everyone has a normal FRAME account. Parent, coach, gym admin and junior are extra layers on top of it, switchable in-app.

- A junior account = `children` record (existing) + `junior_accounts` row (birth date, age band, status, AI/chat flags) + parent link + `junior_consents` row.
- **Parent link** is the existing `guardian_links` table (child_id, user_id, status). This is the "parent_links" of the brief; no second table was added. A junior cannot edit it: every `/junior/*` route except `/junior/junior-me` and `/junior/config` is blocked for junior logins (middleware allowlist).
- **Junior flag**: `users.is_junior`. The login email is a reserved address `username@junior.frame.invalid`; normal registration rejects that domain. The junior signs in with the username.
- **Age band**: `under_13`, `13_15`, `16_17`, stored at creation.
- **Consent record**: who (guardian user), when, version (`junior-consent-draft-1`), age band, exact statement shown. Append-only, `withdrawn_at` for future use.
- **Status**: `pending_setup` (invite not yet used), `active`, `paused`, `parent_managed` (no login, parent runs it).

## 2. Config constants (all TODO(Harry))

| Constant | Default | Meaning |
|---|---|---|
| `JUNIOR_ACCOUNT_MIN_AGE` | 6 | youngest age a parent can create a junior account for |
| `JUNIOR_LOGIN_MIN_AGE` | 13 | own login only from this age; below it the parent manages the account |
| `JUNIOR_MAX_AGE` | 17 | 18+ needs their own FRAME account |
| `JUNIOR_CONSENT_VERSION` / statement | draft-1 | parent consent wording, needs legal text |
| `JUNIOR_INVITE_TTL_MS` | 7 days | invite code lifetime |
| `JUNIOR_AI_CHAT_ENABLED` (env) | off | global switch for AI coach / chat for juniors |
| `BOARD_REQUIRES_OPT_IN` | true | juniors appear on a gym board only if the parent opted in |
| `STAR_MIN_SESSIONS` | 2 | sessions in the week to be a Star of the Week candidate |

## 3. What is built

- **Join a gym** (any account): public gym search (id, name, city only; rate limited 40/min), request to join as an adult member or as a parent for a junior (10/hour), status pending / approved / declined, cancel while pending, leave once approved. Gym coach/admin approves or declines in the existing approvals list.
- **Junior creation**: name + date of birth + consent, then username/password (13+) or an invite code the junior redeems. Under 13: parent-managed, no login.
- **Controls**: pause (blocks login and any live token), reset password, delete (removes login, record, consent, attendance), export (JSON incl. consent record, no hashes).
- **Restrictions**: junior logins can only call their own summary; cannot search gyms, message anyone, change the parent link, or delete themselves. Not in public search. AI coach/chat blocked unless the global flag AND the per-junior flag are on (both default off; the parent cannot turn it on while the global flag is off).
- **Parent summary**: sessions, training minutes, streak (weeks), last active, up to 5 coach notes that the coach explicitly shared. Private coach notes and mood entries are never included.
- **Gym performance** (coach and gym admin of THAT gym only; anyone else gets 403 with no data): top by minutes / sessions / streak, most improved vs the prior equal-length window, attendance rate, Star of the Week candidates. Filters: week (7d), month (28d), term (84d). Only approved members. Juniors shown as "First L.". Parents see only their own child's rank (number out of N). Board visibility is a parent toggle, default off.

## 4. Not built (flagged)

- Converting an existing child record into a junior account (today: create new).
- Adult own-rank endpoint (adults can only opt in/out of the staff board).
- A full junior-login app; the junior sees a minimal "my week" view only.
- Real consent wording, retention schedule, email notifications.
- Nothing was device-tested; web build only.

## 5. Questions for Harry Roberts

1. **Minimum age.** Is 6 right for creating a junior account? Is 13 right for an own login (the UK digital age of consent is 13; US COPPA is under-13)? Should the upper bound be 17?
2. **AI / chat.** Keep AI coach and chat off for juniors entirely, or allow it for 16-17 with parent opt-in? Any content rules if allowed? Can juniors ever message anyone (coach, other juniors)? Today: no.
3. **What the parent sees.** Is the summary (sessions, minutes, streak, last active, shared coach notes) the right scope? Should the parent see the junior's own training log or goals for 16-17s, or less as they get older? Should a 16-17 be able to hide anything?
4. **Lock / delete.** Should pause be reversible by the parent only (today yes)? On delete, do we hard-delete everything (today yes) or keep anonymised aggregates / a safeguarding record for a period? Can the junior ask for deletion themselves?
5. **App Store / Google Play child rules.** Do we need the Kids Category / Families policy, a gated parent area, an age rating change, or a declared "directed to children" status? Does a parent-created sub-account satisfy Apple's account-creation and account-deletion rules?
6. **GDPR-K / COPPA.** Which regime applies per market (UK GDPR Art. 8, EU member state ages 13-16, COPPA)? Is the parent's logged-in tick-box consent enough, or do we need verifiable parental consent (e.g. a card check)? Who is controller for gym-held data? Do we need a DPIA?
7. **Gym boards.** Is opt-in (default off) the right default? Is "First name + initial" acceptable, or first name only / initials only? Are public-facing rankings of under-18s acceptable at all, or staff-only as built?
8. **Gym search.** Is exposing gym name and city to all logged-in users (including parents of juniors) fine?
9. **Safeguarding.** Required reporting path, coach vetting (DBS) badge, and whether the join approval must record a vetting check.
10. **Consent text.** Final wording, versioning and re-consent when it changes.
