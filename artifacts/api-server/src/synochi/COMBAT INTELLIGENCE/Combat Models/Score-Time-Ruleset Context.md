
## Purpose

This node defines how Synochi should modify combat recommendations based on score, time remaining, and competition rules.

A technically good action may become tactically poor when competition context changes.

## Core Principle

Combat decisions should never be evaluated independently of the rules environment.

## Context Inputs

Synochi should consider:

- Current score
- Score differential
- Time remaining
- Advantages
- Penalties
- Submission-only format
- Overtime rules
- Boundary rules
- Legal and illegal techniques
- Stalling criteria

## Score Context

### Athlete Ahead

Priority may shift toward:

- Control
- Risk reduction
- Positional stability
- Safe progression
- Denying opponent initiative

### Athlete Behind

Priority may shift toward:

- Higher-value scoring routes
- Submission threats
- Increased tempo
- Greater tactical risk
- Reduced emphasis on low-value control

## Time Context

### Early Match

Greater opportunity for patient system development.

### Mid Match

Tactical direction becomes clearer.

### Late Match

Score and urgency can dramatically alter optimal decisions.

## Ruleset Influence

The same position may have different value under different rulesets.

Example:

A position that produces control but no scoring may be valuable in submission-only but tactically weaker in a points format when the athlete is behind.

## Dynamic Priority

Synochi should continuously update:

Position Value
+
Score
+
Time
+
Ruleset
=
Current Tactical Priority

## Design Objective

Synochi should understand that combat intelligence is contextual.

The best decision is the best decision for this moment, not in isolation.

## Links

[[Combat Intelligence Hub]]

[[Threat Hierarchy]]

[[Risk-Reward Evaluation]]

[[Position-Specific Objective]]

[[Tempo and Pace Control]]