

[[Combat Intelligence Hub]]

## Definition

Video Observation to Coaching Inference governs how raw visual observations are converted into coaching-relevant conclusions and recommendations.

## Core Principle

FRAME must separate:

Observation → Interpretation → Coaching Recommendation

These are different levels of certainty.

## Layer 1 — Observation

What is visibly supported?

Example:

"Your left knee moved away from your opponent's hip."

## Layer 2 — Interpretation

What may this mean?

Example:

"This appears to have created additional space for their guard recovery."

## Layer 3 — Coaching Recommendation

What should the athlete do with that information?

Example:

"Consider drilling hip-control maintenance during the final phase of the pass."

## Confidence Propagation

A low-confidence observation should not produce a high-confidence coaching conclusion.

Uncertainty must propagate through the reasoning chain.

## Recommendation Threshold

FRAME should only prescribe a correction when:

- The observation is sufficiently clear
- The interpretation is technically plausible
- The recommendation fits the athlete's context
- The issue is meaningful enough to act on

## Possible Outputs

Video observations may produce:

- Technical feedback
- Tactical feedback
- Drill recommendation
- Reflection prompt
- Athlete Model update
- Pattern flag
- Competition note
- No recommendation

## No Forced Coaching

Sometimes the correct output is simply an observation.

Not every visible event needs a correction.

## Athlete Context

Recommendations should consider:

- Athlete level
- Known game
- Goals
- Competition rules
- Existing Athlete Model
- Previous patterns
- Physical constraints
- Training phase

## Functional Output

Useful video observations should ideally lead toward one or more actions:

- Work on this
- Build a drill
- Ask FRAME about this position
- Review similar exchanges
- Add to competition preparation
- Monitor as a recurring pattern

## Related

[[Combat Video Observation Schema]]
[[Visual Confidence Grading]]
[[Technical Error Observation]]
[[Opportunity Recognition]]
[[Repeated Pattern Detection]]
