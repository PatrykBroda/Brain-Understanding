
## Purpose

This node defines how Synochi should build a temporary working model of an opponent based on repeated reactions during a match, round, or observed sequence.

The goal is not to label the opponent permanently.

The goal is to identify what they are currently showing and adapt accordingly.

## Core Principle

Synochi should ask:

“What does this opponent repeatedly do when presented with the same problem?”

Opponent behaviour becomes useful when reactions begin to repeat.

## Profiling Structure

Athlete Action
→ Opponent Reaction
→ Repetition
→ Response Pattern
→ Tactical Adjustment

## Observable Response Patterns

Synochi should look for repeated tendencies such as:

- Always posting with the same hand
- Turning consistently in one direction
- Retreating under forward pressure
- Driving forward when threatened
- Giving underhooks
- Overcommitting to frames
- Standing quickly from guard
- Protecting one limb before another
- Repeatedly conceding the same angle
- Reacting late to secondary attacks

## Temporary Model

Opponent models should remain context-specific.

Synochi should distinguish between:

- Strong repeated pattern
- Emerging tendency
- Single reaction
- Unknown behaviour

A temporary match-level model should not automatically become a permanent truth about the opponent.

## Pattern Confidence

### Low Confidence

Observed once or under unclear conditions.

### Moderate Confidence

Repeated in similar situations.

### High Confidence

Appears consistently across several comparable exchanges.

Higher confidence should justify stronger tactical adaptation.

## Reaction Prediction

When confidence increases, Synochi may begin predicting likely opponent responses.

Example:

Athlete applies passing pressure.

Opponent has repeatedly turned away.

Prediction:

Back exposure is increasingly likely when pressure reaches the same threshold.

Synochi can then prioritise preparation for that branch.

## Exploitation Rule

A repeated tendency should only be exploited when:

- The pattern is sufficiently reliable
- The athlete has a strong response available
- The adjustment does not create excessive risk
- The opportunity fits the current tactical context

## Adaptation

Synochi should update the opponent model when behaviour changes.

An opponent may alter strategy after being punished for a repeated reaction.

The system should therefore monitor:

Previous Pattern
→ Opponent Adjustment
→ New Evidence
→ Model Update

## False Pattern Warning

Synochi should avoid overfitting to:

- One unusual exchange
- Fatigue-specific behaviour
- Injury-related behaviour
- Boundary effects
- Score-driven desperation
- Single technical mistake

Context matters.

## Athlete Interaction

Opponent responses may depend on the athlete’s specific threats.

The same opponent may react differently against different styles.

Synochi should therefore model:

This opponent
against
this athlete
in
this context

rather than assuming universal behaviour.

## Competition Use

Opponent response profiling may influence:

- Branch selection
- Tempo changes
- Entry choice
- Threat sequencing
- Dilemma construction
- Tactical risk
- Game-plan adjustment

## Design Objective

Synochi should learn opponent behaviour quickly enough to improve decision quality within the same competitive context.

The goal is adaptive tactical intelligence.

## Links

[[Combat Intelligence Hub]]

[[Reaction Chain Mapping]]

[[Decision Point Recognition]]

[[Dilemma Construction]]

[[Trilemma Construction]]

[[Branch Reliability]]