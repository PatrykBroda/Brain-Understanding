
## Purpose

This node defines how Synochi should reason when important parts of a combat exchange are hidden, off-camera, obstructed, or otherwise unavailable.

Missing visual information should be treated explicitly rather than silently filled in.

## Core Principle

Synochi should never convert an unseen detail into a confident observation.

When information is missing, the system should preserve the gap.

## Common Occlusion Sources

- Bodies blocking relevant limbs
- Camera angle hiding grips
- Referee obstruction
- Cage or ropes obstructing view
- Action moving outside frame
- Low-resolution footage
- Motion blur
- Poor lighting
- Cropped clips
- Sequence beginning too late
- Sequence ending too early

## Missing Detail Categories

### Hidden Grip

Hand or grip relationship cannot be confirmed.

### Hidden Limb Position

Arm, leg, knee, or foot position is partially or fully obscured.

### Hidden Hip Relationship

Hip angle, rotation, or positional relationship cannot be seen reliably.

### Hidden Head Position

Head placement or direction is unclear.

### Missing Setup

The clip begins after the initiating action has already occurred.

### Missing Outcome

The clip ends before the exchange resolves.

## Handling Rule

When a critical detail is missing, Synochi should use one of three states:

### Known

Clearly visible.

### Probable

Not fully visible, but surrounding evidence strongly supports the conclusion.

### Unknown

Evidence is insufficient.

Unknown should remain unknown.

## Example

Visible:

Athlete is reversed from top half guard.

Hidden:

Exact underhook battle is obscured.

Synochi should not state:

“The athlete lost the underhook.”

unless that is actually visible.

Preferred:

“The reversal occurs after upper-body control deteriorates, but the exact grip relationship is obscured.”

## Inference Restraint

Occlusion should reduce downstream confidence.

Missing Detail
→ Lower Observation Confidence
→ Lower Diagnostic Confidence
→ Less Prescriptive Coaching

## Alternative Hypotheses

When important detail is hidden, Synochi may preserve multiple plausible explanations.

Example:

Possible causes:

- Underhook loss
- Head-position loss
- Base disruption

The system should avoid selecting one without sufficient evidence.

## Request for Better Evidence

When useful, Synochi may recommend:

- Longer clip
- Earlier start point
- Later end point
- Different camera angle
- Higher-resolution footage
- Athlete description of the exchange

## Partial Analysis

Missing detail does not make the entire clip useless.

Synochi should analyse what remains observable while clearly separating:

Observed
from
Unknown

## Design Objective

Synochi should remain useful under imperfect video conditions without inventing unseen information.

The goal is robust analysis with explicit evidence boundaries.

## Links

[[Combat Intelligence Hub]]

[[Combat Video Observation Schema]]

[[Visual Confidence Grading]]

[[Observation vs Inference]]

[[Event Boundary Detection]]