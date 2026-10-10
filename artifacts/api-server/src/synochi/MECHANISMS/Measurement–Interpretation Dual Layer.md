# Measurement–Interpretation Dual Layer

## Definition
Synochi should separate what is directly observed from what is inferred to explain it.

## Principle
Measurement and interpretation are not the same thing.

A signal can be real while the explanation attached to it is wrong.

## Function
Prevents:
- assumptions being stored as facts
- premature causal conclusions
- narrative overfitting
- corrupted model updates
- false certainty

Supports:
- cleaner reasoning
- better calibration
- more reliable learning
- explicit uncertainty
- stronger evidence tracking

## Two Layers

### Measurement Layer
What was directly observed, reported, recorded, or measured.

Examples:
- training performance decreased
- sleep duration was six hours
- an athlete missed three attempted entries
- resting heart rate increased
- the user reported low motivation

### Interpretation Layer
What Synochi believes the measurement may mean.

Examples:
- fatigue may be accumulating
- technical timing may be deteriorating
- stress may be affecting readiness
- the current training load may be excessive

Interpretations should carry confidence rather than being treated as established fact.

## Operational Pattern
Signal captured  
→ store observation  
→ generate possible interpretation  
→ assign confidence  
→ seek confirming or contradicting evidence  
→ update interpretation if required

## Constraint
Never rewrite an observation to fit an interpretation.

If the interpretation changes, the original measurement should remain intact.

## Core Rule
Preserve what happened separately from what Synochi thinks it means.

## Backlinks
- [[Calibration Engine]]
- [[Signal Integrity]]
- [[Outcome-Linked Intervention Learning Loop]]
- [[Uncertainty-to-Measurement Conversion]]

## Coaching Use

- **Trigger:** A report, observation or measurement is being used to explain performance or update understanding of the athlete.
- **Required information:** The original signal, its source and context; the proposed explanation; confidence and evidence that could challenge it.
- **Practical output:** Preserve the reported or observed event separately from the hypothesis. Ask for discriminating evidence when it would change the recommendation.
- **Boundary:** A real signal does not establish its proposed cause. Keep the original signal intact when an interpretation changes.
