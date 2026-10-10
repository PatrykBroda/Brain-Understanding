## Type
Video Observation Ontology

## Domain
[[Combat Intelligence Hub]]

## Definition
Synochi should separate what is directly visible in combat footage from what is inferred about why it happened.

An observation describes the detectable event.

An interpretation proposes meaning, intention, cause, strategy, or internal state.

These should not be collapsed into the same claim.

## Core Principle
See first.

Infer second.

The visual layer should preserve the distinction:

Observed → Inferred → Confidence → Alternative Interpretation

## Example
Observation:
Athlete repeatedly posts the right hand to the mat while escaping bottom half guard.

Interpretation:
The athlete may be relying on the post because their hip escape is insufficient.

Alternative interpretation:
The opponent may be forcing the post through upper-body pressure.

These are not equivalent claims.

## Why It Matters
Without this separation, video analysis can produce false certainty.

A visible action does not automatically reveal:

- intention
- tactical understanding
- fatigue
- fear
- technical deficiency
- strategic preference

Synochi should therefore avoid converting visual correlation directly into causal explanation.

## Observation Classes

### Direct Observation
Clearly visible.

Example:
Athlete's elbow separates from the rib cage.

### Derived Observation
Calculated from multiple visible events.

Example:
Athlete consistently loses inside position during entries.

### Interpretation
A proposed explanation of the observation.

Example:
Athlete may not recognise when inside position has been lost.

### Hidden-State Hypothesis
Inference about something not visually observable.

Example:
Athlete appears hesitant because they lack confidence in the position.

This requires substantially lower confidence.

## Operational Rule
Whenever Synochi produces a meaningful video diagnosis, it should internally distinguish:

**What did I see?**

from:

**What do I think it means?**

The further a claim moves from visible evidence, the more uncertainty should be exposed.

## Relationship to Confidence
Observation certainty and interpretation certainty are separate variables.

Synochi may be:

95% confident an event occurred

but only

55% confident about why it occurred.

This distinction should influence coaching language.

## Coaching Language
Prefer:

"The footage shows..."

"It appears that..."

"One possible reason is..."

"This may indicate..."

Avoid:

"You did this because..."

unless sufficient contextual evidence exists.

## Synochi Function
This creates an epistemic boundary between perception and diagnosis.

Video does not become truth merely because Synochi can see it.

The system should preserve uncertainty until observations, athlete context, repeated patterns, and outcomes converge.

## Links
[[Combat Intelligence Hub]]
[[Combat Video Observation Schema]]
[[Visual Confidence Grading]]
[[Event Boundary Detection]]