# FRAME AI data map

This is the source of truth for every AI-powered path in the mobile and coach
web clients. It must stay aligned with the `/ai-consent` response, the in-app
permission sheet, the server guard, the public privacy policy, App Privacy
answers, and App Review notes.

## The processors and the consent contract

FRAME may use **Anthropic (Claude)** and **OpenAI**, depending on the selected
feature and provider. Before an account has accepted the current disclosure,
nothing is sent to either processor. Consent is account-scoped and records the
accepted disclosure version and timestamp. A missing timestamp, withdrawal, or
older version blocks an AI request on the server.

The permission sheet renders the exact `sharedData` and `notShared` arrays
returned by `GET /ai-consent`:

### May be sent

- chat messages and the conversation context needed to answer them
- training data, session reflections, movement signals, scores, session type and clip duration
- athlete profile and context, including sport, experience, goals, weaknesses and relevant performance observations
- uploaded images or selected video stills, where applicable to the requested feature
- other user-provided information included in the request or needed to provide the feature

### Not sent

- your email address and account ID unless technically required to operate the service
- raw video files; analysis uses selected stills and derived movement data where applicable

The server owns these categories. If a disclosure changes, its version changes
and the account must review and accept the sheet again.

## AI paths

### Coach chat (mobile and web)

The user-authored chat message and the conversation context needed to answer it
may be sent to Anthropic/Claude and/or OpenAI. An attached image or video may
also be sent where applicable. Attachments are uploaded to FRAME first; that
upload is not an AI request. The clients check `GET /ai-consent` before the
first send, show the disclosure, and use `PATCH /ai-consent` with
`{"accepted":true}` before resuming the pending message. Declining leaves the
composer, attachments, and non-AI features usable.

Chat coaching can also produce planning, memory, spirit-animal, and other
coaching results. The server checks current consent before the AI route and
before consent-dependent memory extraction; a client-side check is not the
security boundary.

### Video and session analysis

The request to FRAME can contain session type, user-entered focus, clip
duration, pose-derived movement signals and scores, detected movement events,
and selected still keyframes. The raw video is processed on the device/web
client and is not included in the analysis request.

After current consent is confirmed, the minimum relevant context and selected
stills may be sent to Anthropic/Claude and/or OpenAI for the requested
performance analysis. FRAME stores the resulting report, metrics, and
submitted keyframes in the user's account until the analysis or account is
deleted. The analysis route enforces consent before making an AI request.

## Server enforcement and user controls

The server's reusable `requireAiConsent`/`hasAiConsentForUser` guard protects
coach chat, analysis, planner generation, and consent-dependent memory work.
It returns `AI_CONSENT_REQUIRED` when consent is absent or stale; the client
must not treat a hidden or bypassed UI as authorization.

Users can decline the sheet and continue using non-AI features. Profile shows
the current state, links to the privacy policy, and lets the user withdraw
permission. Withdrawal blocks future AI paths; existing account data and
reports remain until the user deletes them or the account.