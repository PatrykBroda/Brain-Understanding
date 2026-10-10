
## Purpose

This node defines how Synochi should reason about alternative opponent responses that did not occur but were realistically available.

The goal is to avoid overfitting the athlete’s game to only the reactions already observed.

## Core Principle

Synochi should ask:

“What else could a competent opponent have done here?”

Combat Intelligence should model not only actual reactions, but also plausible defensive alternatives.

## Counterfactual Structure

Observed Situation
→ Actual Opponent Reaction
→ Athlete Response
→ Alternative Plausible Reactions
→ Risk Assessment
→ System Robustness

## Why Counterfactuals Matter

A sequence may appear highly successful because the opponent selected one favourable reaction.

Synochi should test whether the system remains strong if the opponent instead:

- Turns the other direction
- Refuses to engage
- Changes base
- Posts differently
- Stalls
- Scrambles
- Counters immediately
- Breaks connection earlier
- Accepts a lesser positional loss to avoid a larger threat

## Actual vs Plausible

Synochi should distinguish between:

### Observed Reaction

What the opponent actually did.

### Plausible Alternative

A realistic response available from the same position.

### Low-Probability Alternative

Technically possible but unlikely under normal resistance.

Counterfactual reasoning should remain realistic.

## System Robustness

A robust system should remain useful across several realistic opponent responses.

Synochi should ask:

- Does the current branch only work against one reaction?
- Is the first threat still credible if the opponent reacts differently?
- Does another game pillar become available?
- Does the athlete have a safe fallback?
- Does the system collapse if the opponent refuses the expected branch?

## Example

Athlete repeatedly attacks from front headlock.

Observed opponent reaction:

Build posture
→ athlete goes behind.

Counterfactual alternatives may include:

- Opponent stays compact
- Opponent drives forward
- Opponent sits through
- Opponent disengages early

Synochi should evaluate whether the broader system has useful responses to these alternatives.

## Anti-Overfitting Rule

Synochi should not assume:

“Opponent did X three times, therefore X is the only meaningful reaction.”

Repeated evidence increases confidence in a tendency but should not erase other realistic possibilities.

## Counterfactual Priority

Alternative reactions deserve more attention when:

- They are common at higher levels
- They expose a weakness in the current system
- They would create major consequences
- The athlete has no clear answer
- The same alternative appears in previous matches or sessions

## Training Use

Counterfactual modeling can inform:

- Reaction drills
- Positional sparring
- Branch testing
- Competition preparation
- Scenario training
- System stress-testing

The goal is to expose the athlete to credible alternative reactions before competition does.

## Opponent-Specific Use

Synochi should combine:

General plausible reactions
+
Observed opponent tendencies

This allows the system to remain robust without ignoring opponent-specific evidence.

## Design Objective

Synochi should help the athlete build systems that survive intelligent resistance.

The goal is not to predict one reaction perfectly.

The goal is to remain functional across the most realistic reaction space.

## Links

[[Combat Intelligence Hub]]

[[Opponent Response Profiling]]

[[Opponent Adaptation Detection]]

[[Branch Reliability]]

[[Fallback Hierarchy]]

[[System Transfer Logic]]