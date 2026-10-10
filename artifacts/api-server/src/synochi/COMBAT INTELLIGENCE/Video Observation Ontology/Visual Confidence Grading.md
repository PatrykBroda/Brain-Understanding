
## Purpose

This node defines how Synochi should judge the reliability of what it believes it can see in combat footage.

Video analysis should never treat unclear visual evidence as certain.

## Core Principle

Before Synochi reasons from an observation, it should estimate how confidently that observation can actually be made.

Confidence should reflect the quality of the visual evidence, not how plausible the interpretation feels.

## Confidence Factors

Synochi should consider:

- Camera angle
- Image quality
- Distance from action
- Motion blur
- Obstruction
- Lighting
- Whether relevant limbs are visible
- Whether grips or contact points can be seen
- Whether the full sequence is captured
- Whether the action occurs partly outside frame

## Confidence Levels

### High Confidence

The relevant action is clearly visible.

Examples:

- Takedown entry is fully visible
- Opponent clearly posts with right hand
- Guard pass completion is unobstructed
- Submission finish is visually clear

### Moderate Confidence

The main action is visible but some important detail is partially obscured.

Examples:

- Grip appears likely but hand placement is partly hidden
- Hip position is visible but leg configuration is unclear
- Transition is visible but initiation is partially missed

### Low Confidence

Important information is missing or ambiguous.

Examples:

- Bodies obscure the relevant grip
- Camera angle hides knee position
- Exchange moves out of frame
- Clip begins after the important setup
- Motion blur prevents reliable identification

## Unknown State

When evidence is insufficient, Synochi should explicitly preserve:

Unknown

rather than selecting the most likely answer.

Unknown is valid information.

## Observation Rule

Confidence should attach to the observation itself.

Example:

Observation:
Opponent appears to establish an underhook.

Confidence:
Moderate.

Interpretation:
This may contribute to the positional reversal.

The interpretation should not carry greater certainty than the observation supporting it.

## Confidence Propagation

Low-confidence observations should reduce confidence in downstream reasoning.

Low-confidence observation
→ weaker pattern evidence
→ weaker diagnosis
→ less prescriptive intervention

Synochi should not allow uncertain visual input to become a high-confidence coaching conclusion.

## Multiple Evidence Sources

Confidence may increase when video evidence aligns with:

- Athlete report
- Coach report
- Repeated footage
- Another camera angle
- Similar events from other sessions

However, additional evidence should support rather than overwrite what the footage itself shows.

## False Precision

Synochi should avoid overly precise claims when footage does not justify them.

Prefer:

“The athlete appears to lose inside position during the transition.”

over:

“The athlete loses the left underhook exactly because of a 20-degree hip-angle error.”

unless the visual evidence genuinely supports that level of specificity.

## Confidence and Feedback

When confidence is low, Synochi may:

- Ask for another angle
- Request a longer clip
- Ask the athlete what they felt
- Present multiple plausible explanations
- Avoid prescribing a specific technical correction

## Design Objective

Synochi should remain useful without pretending to see more than the footage actually reveals.

The goal is calibrated visual intelligence:

Clear evidence
→ strong confidence

Ambiguous evidence
→ preserved uncertainty

## Links

[[Combat Intelligence Hub]]

[[Combat Video Observation Schema]]

[[Observation vs Inference]]

[[Event Boundary Detection]]