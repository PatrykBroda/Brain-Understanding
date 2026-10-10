## **Core Idea**

Not all information should influence Synochi equally.

A direct observation, a repeated behavioural pattern, a user statement, an inference, and an intuitive signal all provide evidence — but they differ in reliability, specificity, and confidence.

Synochi should therefore **weight evidence before allowing it to materially alter its understanding of the user or athlete**.

The goal is not to create rigid numerical certainty. The goal is to prevent weak signals from being treated as established truth while allowing repeated or high-quality evidence to progressively strengthen a model.

## **Evidence Classes**

### **Direct Observation**

Something directly observed through available data or interaction.

Examples:

- A movement repeatedly visible in uploaded video.
- A measurable training or recovery trend.
- The user consistently choosing the same behaviour across multiple situations.

Generally high evidential value, although observation can still be incomplete or misinterpreted.

### **Explicit Self-Report**

Something the user directly states about themselves, their experience, intention, preference, or internal state.

Examples:

- “I feel much sharper when I sleep eight hours.”
- “I prefer being challenged rather than reassured.”
- “My confidence drops after I lose the first exchange.”

Self-report should normally be respected as meaningful evidence, particularly for subjective internal states, while recognising that interpretation, recall, and self-perception can sometimes be incomplete.

### **Repeated Pattern**

A relationship that appears consistently across multiple observations, contexts, or time periods.

Repeated patterns should carry substantially more weight than isolated events.

The system should ask:

**Has this occurred enough times, across sufficiently similar circumstances, to justify treating it as a meaningful pattern?**

### **Inference**

A conclusion derived from available evidence rather than directly observed or stated.

Example:

The athlete becomes passive late in multiple hard rounds.

Possible inference:

Fatigue may be reducing decision speed or willingness to initiate.

Inference is valuable but should remain distinguishable from observation.

### **Intuitive Signal**

A strong pattern-based impression that appears before its reasoning can be fully articulated.

Intuition should be treated as **high-value early evidence, not established truth**.

It should enter the [[Intuition Capture Loop]]:

**Signal → Capture → Clarify → Test → Integrate**

### **Speculation**

A possible explanation with limited supporting evidence.

Speculation can be useful for generating hypotheses but should have very little direct influence on the stable User/Athlete Model until additional evidence appears.

## **Weighting Dimensions**

Evidence should be evaluated across several dimensions:

- **Directness** — Was it observed directly or inferred?
- **Repetition** — Has the signal appeared multiple times?
- **Consistency** — Does it align with other known evidence?
- **Specificity** — Is the evidence clearly connected to the claim?
- **Context relevance** — Did it occur under circumstances relevant to the current decision?
- **Recency** — Is it likely to still represent the athlete?
- **Outcome validation** — Has acting on this interpretation produced useful results?

No single dimension should automatically determine confidence.

## **Evidence Accumulation**

Weak evidence can become strong evidence through repetition and validation.

For example:

Initial observation:

Athlete repeatedly hesitates before entering exchanges.

Possible interpretation:

Athlete may lack confidence initiating.

This should initially remain a hypothesis.

If the same behaviour appears across sessions, the athlete reports uncertainty when initiating, and an intervention targeting entry confidence improves performance, confidence in the interpretation should increase substantially.

Therefore:

**Evidence → hypothesis → testing → outcome → updated confidence**

This links directly to the [[Outcome-Linked Intervention Learning Loop]].

## **Contradictory Evidence**

New evidence should not automatically overwrite existing beliefs.

If meaningful evidence conflicts with the current model, Synochi should:

1. Preserve the contradiction.
2. Check whether the contexts differ.
3. Consider competing explanations.
4. Gather further evidence.
5. Update confidence only when justified.

Contradiction is information.

It may reveal:

- context dependence,
- state changes,
- an inaccurate previous inference,
- multiple valid patterns,
- or genuine development in the athlete.

## **Model Integration**

Evidence should influence stable models proportionally to its strength.

A single weak observation should rarely create a durable model belief.

Repeated, contextually consistent, outcome-validated evidence can become a high-confidence model component.

Synochi should therefore distinguish between:

**Signal → hypothesis → emerging pattern → established pattern**

rather than immediately converting every new piece of information into permanent memory.

## **Principle**

**The strength of a belief should reflect the strength of the evidence supporting it.**

Synochi should remain capable of acting under uncertainty while keeping its confidence calibrated and revisable.

## **Connections**

- [[Intuition Capture Loop]]
- [[Outcome-Linked Intervention Learning Loop]]
- [[Athlete Model]]
- [[User Model]]
- [[Context Engine]]
- [[Model Utility]]
- [[Prediction Error Learning]]
- [[Competing Hypothesis Maintenance]]