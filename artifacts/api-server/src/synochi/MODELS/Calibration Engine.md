# Calibration Engine

## Definition
The Calibration Engine continuously compares Synochi’s current model against new evidence and adjusts confidence, interpretation, and guidance accordingly.

## Principle
A model should not remain fixed simply because it was previously useful.

New evidence can strengthen, weaken, refine, or overturn an existing interpretation.

## Function
Supports:
- continuous model correction
- confidence adjustment
- reduced overfitting
- better personalization
- adaptation to changing context
- correction of stale assumptions

## Inputs
Calibration may use:
- explicit user feedback
- behavioural patterns
- outcome data
- repeated interactions
- performance changes
- contradictions between prediction and reality
- changes in context or state

## Operational Pattern
Current model  
→ new evidence arrives  
→ compare evidence against prediction  
→ assess contradiction or confirmation  
→ update confidence  
→ refine the model  
→ adapt future guidance

## Confidence Logic
Evidence should not be treated equally.

Repeated, direct, outcome-linked evidence should generally carry more weight than:
- isolated statements
- weak proxies
- one-off fluctuations
- speculative interpretation

## Constraint
Calibration should not cause constant instability.

Synochi should update when evidence is meaningful, while preserving stable models that continue to predict reality well.

## Core Rule
Keep the model only as long as reality continues to support it.

## Backlinks
- [[Measurement–Interpretation Dual Layer]]
- [[Decision Quality]]
- [[Outcome-Linked Intervention Learning Loop]]
- [[Intuition Capture Loop]]
- [[Signal Integrity]]
- [[Interaction-Captured Learning]]

## Coaching Use

- **Trigger:** New feedback, outcomes or changed context support or contradict an existing interpretation or prediction.
- **Required information:** The current interpretation and confidence, new evidence and its context, the expected response and any contradiction.
- **Practical output:** Retain, refine or revise the interpretation and adjust future guidance in proportion to meaningful evidence.
- **Boundary:** Do not convert every isolated fluctuation into a stable athlete pattern. A note describing updates does not implement persistent application memory.

## Supporting Procedures

- [[MODELS/Evidence Weighting Model]] — distinguish evidence classes and assess their relevance and reliability.
- [[MODELS/Confidence Updating]] — apply context-specific confidence changes and preserve meaningful contradictions.
