
## Type
Video Observation Ontology

## Domain
[[Combat Intelligence Hub]]

## Definition
Transition State Detection is Synochi’s ability to recognise when an exchange is moving between established positional states rather than forcing every moment into a fixed positional label.

A transition is not visual noise between two positions.

It is often the most information-dense part of the exchange.

## Core Principle
Positions describe where the athletes are.

Transitions reveal how control is being gained, lost, redirected, or recovered.

**State A → Transition → State B**

The transition should be modelled explicitly.

## Why It Matters
Many decisive moments in combat occur before the final position becomes obvious.

Examples:

- guard retention failing before the pass is completed
- back exposure occurring before hooks are established
- balance breaking before the takedown
- inside position being lost before the opponent secures control
- defensive structure collapsing before the submission becomes threatening

If Synochi only recognises settled positions, it identifies outcomes after the causal moment has already passed.

## Transition Components

### Origin State
The position immediately before meaningful structural change begins.

### Trigger
The event that initiates the transition.

Examples:

- frame removed
- grip established
- angle changed
- weight shifted
- post removed
- level changed
- hip line cleared

### Intermediate Configuration
The unstable phase between positions.

This may contain:

- partial control
- contested balance
- temporary exposure
- incomplete attachment
- changing orientation
- scrambling

### Destination State
The position the exchange stabilises into.

### Transition Outcome
The transition may result in:

- successful advancement
- successful recovery
- reversal
- reset
- failed attack
- failed defence
- unresolved scramble

## Commitment Threshold
Not every movement should count as a transition.

Synochi should look for structural commitment.

A movement becomes transitionally meaningful when it changes one or more of:

- control
- orientation
- base
- attachment
- positional hierarchy
- available action-space
- exposure
- balance

## Transitional Advantage
Advantage can emerge before the destination position is secured.

Example:

During a knee cut, the passer may not yet have side control, but if the bottom athlete’s knee line has been cleared and shoulders are controlled, the transition is already strongly biased toward the passer.

Synochi should therefore distinguish:

**current position**

from

**transition momentum**

## Transition Momentum
Transition momentum estimates which athlete currently has greater structural influence over the direction of the exchange.

Signals may include:

- dominant angle
- control of head or hips
- removal of frames
- control of inside space
- successful off-balancing
- constrained defensive options
- forced reactions

Momentum is not the same as outcome certainty.

## Failed Transitions
A failed transition remains diagnostically useful.

Example:

Athlete begins a guard pass, clears the knee line, but loses upper-body control and opponent recovers guard.

The correct interpretation is not simply:

"Guard retained."

The useful sequence is:

**Pass initiated → knee line cleared → upper-body connection lost → guard recovered**

This exposes the actual failure point.

## Temporal Segmentation
Synochi should segment transitions around meaningful structural change.

Possible sequence:

**Stable state → transition initiation → transition development → critical decision point → resolution → new stable state**

This creates more useful coaching anchors than arbitrary timestamps.

## Critical Decision Point
Within a transition, Synochi should attempt to identify the moment where available outcomes narrow significantly.

This may be:

- the last viable frame
- loss of a post
- head position conceded
- hip line crossed
- elbow separated
- balance broken
- attachment lost

These moments often carry greater coaching value than the final outcome.

## Confidence
Transition detection should inherit uncertainty from the underlying visual evidence.

High confidence:
Clear change from seated guard into completed single-leg entry.

Medium confidence:
Likely transition toward a single-leg, but lower-body connection partially obscured.

Low confidence:
Scramble detected; exact transition path unclear.

## Coaching Value
Transition analysis shifts feedback from:

"You ended up in a bad position."

to:

"The position became difficult three seconds earlier when your inside frame disappeared and your hips were turned away."

This moves coaching closer to causality.

## Synochi Function
Synochi should maintain a continuously updating transition model:

**Stable state → structural change → transition hypothesis → momentum estimate → critical event → resolution → updated positional state**

This allows video analysis to understand not only what positions occurred, but how one state became another.

## Links
[[Combat Intelligence Hub]]
[[Combat Video Observation Schema]]
[[Positional State Recognition]]
[[Event Boundary Detection]]
[[Observation vs Interpretation Separation]]
[[Visual Confidence Grading]]