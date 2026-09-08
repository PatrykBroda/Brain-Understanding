# FRAME AI analysis data map

This document is the submission source of truth for the current analysis flow.
It must stay aligned with the in-app disclosure, server allowlist, public privacy
policy, App Store privacy answers, and App Review notes.

## Device to FRAME server

The analysis request can contain the session type, user-entered focus, clip
duration, pose-derived movement signals and scores, detected movement events,
and up to six selected still keyframes. The raw video file is processed on the
device/web client and is not included in the analysis request.

FRAME stores the resulting report, metrics, and submitted keyframes in the
user's account until the user deletes the analysis or account.

## FRAME server to Anthropic Claude

After current, versioned consent is confirmed, FRAME sends:

- Up to four selected still keyframes.
- Movement signals, scores, session type, duration, detected key-moment labels,
  and the user's requested analysis focus.
- Combat sport, experience level, training frequency, combat archetype, and
  performance facts limited to strengths, weaknesses, technical knowledge,
  recurring patterns, and training goals.

FRAME strips the user's email, account ID, full name, age, gym/team, biography,
height, weight, free-form profile goals/weaknesses, and life-context/event or
coaching-preference facts from the Claude analysis context. The raw video file
is not sent to Anthropic.

## Consent and control

Consent is account-scoped and records the accepted disclosure version and
timestamp. A missing timestamp, withdrawal, or older disclosure version blocks
the analysis endpoint before an AI request can be made. Users can decline
without losing other app functions and can withdraw from Profile.