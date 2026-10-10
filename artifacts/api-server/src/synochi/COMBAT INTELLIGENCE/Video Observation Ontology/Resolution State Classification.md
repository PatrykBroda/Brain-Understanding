## Type
Video Observation Ontology

## Domain
[[Combat Intelligence Hub]]

## Definition
Resolution State Classification is Synochi’s ability to identify how an exchange segment ends and what functional state remains once the immediate sequence has stabilised.

Not every sequence ends in a clean win or loss.

Some exchanges resolve into:

- improved position
- degraded position
- neutral reset
- unresolved scramble
- submission completion
- failed attack
- successful escape
- stalled control

## Core Principle
The end of an event should be classified by functional consequence, not only by visible movement.

**Sequence → Resolution → Resulting state → Strategic consequence**

## Why It Matters
Without resolution classification, Synochi may detect events but fail to understand their outcome.

Example:

An athlete attempts a sweep.

Possible resolutions:

- sweep succeeds
- sweep fails but creates top position later
- sweep fails but forces opponent to post
- sweep fails and worsens position
- sweep is abandoned into neutral reset

These outcomes are materially different.

## Resolution Classes

### Positive Resolution
The athlete improves their functional state.

Examples:

- passes guard
- escapes mount
- secures takedown
- takes back
- restores neutral position

### Negative Resolution
The athlete ends in a worse functional state.

Examples:

- gets passed
- loses back exposure
- concedes takedown
- becomes isolated in submission

### Neutral Resolution
The exchange returns to broadly equivalent conditions.

Examples:

- disengagement
- standing reset
- grip exchange ends without advantage
- scramble returns to neutral

### Partial Resolution
The exchange ends with incomplete advantage.

Examples:

- dominant grip but no positional change
- partial back exposure
- knee line cleared but pass not consolidated

### Unresolved State
The sequence remains active without clear stabilisation.

Example:

ongoing scramble at clip end.

Synochi should not invent a resolution if none is visible.

## Technical Resolution vs Strategic Resolution
An action may technically fail but strategically succeed.

Example:

Guillotine attempt fails.

But:

opponent rolls  
→ top position gained

Technical outcome:
submission failed.

Strategic outcome:
position improved.

Synochi should preserve both.

## Local vs Global Resolution
A local exchange may resolve positively while the broader sequence remains negative.

Example:

Athlete escapes back control into turtle.

Local resolution:
successful escape from immediate back control.

Global state:
still disadvantaged.

This distinction prevents oversimplification.

## Consolidation Requirement
A positional gain should not necessarily count as fully resolved until control stabilises.

Example:

Athlete clears guard momentarily but opponent immediately re-guards.

This may be classified as:

temporary advancement

rather than:

completed pass

Synochi should use temporal stability before assigning final resolution.

## Resolution Confidence
Classification confidence should depend on:

- visibility
- duration of stabilisation
- clarity of control
- clip completeness
- rule context
- whether the exchange continues off-camera

Where uncertain, Synochi should reduce specificity.

## Diagnostic Example
Surface analysis:

"The sweep failed."

Resolution-aware analysis:

"The sweep did not produce top position directly, but it forced the post that opened the back-take sequence. Technically unsuccessful, strategically productive."

## Coaching Value
Resolution State Classification helps Synochi distinguish:

- productive failed attacks
- costly successful-looking actions
- neutral exchanges
- partial gains
- true control consolidation

This improves both diagnosis and reinforcement.

## Synochi Function
Synochi should resolve event segments through:

**Detect event → Track transition → Observe stabilisation → Classify local outcome → Classify resulting state → Estimate strategic consequence**

Resolution should then feed the Athlete Model and intervention-learning loop.

## Outcome Learning
Repeated resolution patterns can reveal whether certain behaviours actually work for the athlete.

Example:

Repeated front-headlock entries may show:

high entry success  
→ low finish rate  
→ strong back-take conversion

Synochi should learn the functional value of the sequence rather than judging it only by the original intent.

## Links
[[Combat Intelligence Hub]]
[[Escalation Point Recognition]]
[[Recovery Opportunity Detection]]
[[Error Point Identification]]
[[Transition State Detection]]
[[Positional State Recognition]]
[[Outcome-Linked Intervention Learning]]