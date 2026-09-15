# FRAME AI data map

This is the source of truth for every AI-powered path in the mobile and coach
web clients. It must stay aligned with the `/ai-consent` response, the in-app
permission sheet, the server guard, the public privacy policy, App Privacy
answers, and App Review notes.

## The processors and the consent contract

FRAME may use **Anthropic (Claude)** and **OpenAI**, depending on the selected
feature and provider, with requests potentially routed through **Replit's AI
integration infrastructure**. Before an account has accepted the current disclosure,
nothing is sent to either processor. Consent is account-scoped and records the
accepted disclosure version and timestamp. A missing timestamp, decline,
withdrawal, or older version places the authenticated account behind the
consent gate: FRAME does not provide normal authenticated use until the
current disclosure is accepted. Authentication, legal pages, consent
GET/PATCH, sign-out, and permanent account deletion remain reachable so the
account can recover or be removed.

The permission sheet renders the exact `sharedData` and `notShared` arrays
returned by `GET /ai-consent`:

### May be sent

- chat messages and the conversation context needed to answer them
- training data, session reflections, movement signals, scores, session type and clip duration
- athlete profile and context, including sport, experience, goals, weaknesses and relevant performance observations
- images or videos attached to chat, and selected session-analysis video stills, where applicable to the requested feature
- other user-provided information included in the request or needed to provide the feature

### Not sent

- your email address and account ID unless technically required to operate the service
- raw source clips selected for session analysis; session analysis uses selected stills and derived movement data where applicable

The server owns these categories. If a disclosure changes, its version changes
and the account must review and accept the sheet again.

## AI paths

### Coach chat (mobile and web)

The user-authored chat message and the conversation context needed to answer it
may be sent to Anthropic/Claude and/or OpenAI. An attached image or video may
also be sent where applicable. Raw chat attachments are uploaded to and retained
by FRAME before they are associated with the message; that upload is not itself
an AI request. When the message is sent, its selected attachment may be sent to
the configured AI provider. The clients check `GET /ai-consent` before the
first send, show the disclosure, and use `PATCH /ai-consent` with
`{"accepted":true}` before resuming the pending message. A decline does not
authorize authenticated FRAME use; it leaves the account at the consent gate
until the current disclosure is accepted. Sign-out, consent controls, legal
pages, and permanent account deletion remain available.

Chat coaching can also produce planning, memory, spirit-animal, and other
coaching results. The server checks current consent before the AI route and
before consent-dependent memory extraction; a client-side check is not the
security boundary.

### Video and session analysis

The request to FRAME can contain session type, user-entered focus, clip
duration, pose-derived movement signals and scores, detected movement events,
and selected still keyframes. For session analysis, the source clip is not
included in the `/analysis` request; the client sends derived signals and
selected stills where available.

After current consent is confirmed, the minimum relevant context and selected
stills may be sent to Anthropic/Claude and/or OpenAI for the requested
performance analysis. FRAME stores the resulting report, metrics, and
submitted keyframes in the user's account until the analysis or account is
deleted. The analysis route enforces consent before making an AI request.

## Server enforcement and user controls

The server's authenticated route gate and reusable
`requireAiConsent`/`hasAiConsentForUser` guard protect coach chat, analysis,
planner generation, and consent-dependent memory work. They return
`AI_CONSENT_REQUIRED` when consent is absent or stale; the client must not
treat a hidden or bypassed UI as authorization. The immediate provider-boundary
checks remain in place immediately before provider calls.

Declining the sheet, withdrawing permission, or becoming stale after a
disclosure-version change returns the account to the consent gate. Profile
shows the current state, links to the privacy policy, and lets the user review
or accept the current disclosure. Withdrawal blocks future AI paths and
authenticated FRAME use; existing account data and reports remain until the
user deletes them or the account. Authentication, legal pages, consent
GET/PATCH, sign-out, and permanent account deletion remain available while
the account is gated.