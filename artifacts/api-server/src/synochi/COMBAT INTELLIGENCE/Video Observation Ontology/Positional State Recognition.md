# Positional State Recognition

## Type
Video Observation Ontology

## Domain
[[Combat Intelligence Hub]]

## Definition
Positional State Recognition is Synochi’s ability to identify the current structural relationship between athletes before interpreting individual techniques.

The position establishes the action-space.

The same movement can mean something completely different depending on the positional state in which it occurs.

## Core Principle
Do not interpret an action without first understanding the state surrounding it.

**Position → Constraints → Available actions → Observed action → Interpretation**

## Positional State
A positional state is more than a simple label such as:

- half guard
- mount
- side control
- standing

It should include the structural conditions that define the exchange.

## State Components

### Base Position
The broad recognised position.

Examples:

- standing
- open guard
- closed guard
- half guard
- side control
- mount
- back control
- turtle
- front headlock

### Relative Orientation
How the athletes are positioned relative to one another.

Examples:

- chest-to-chest
- chest-to-back
- perpendicular
- parallel
- head-to-head
- hip-to-hip

### Control Structure
What connections are currently shaping the position.

Examples:

- underhook
- crossface
- wrist control
- head control
- body lock
- leg entanglement
- frame
- pin

### Postural State
The structural posture of each athlete.

Examples:

- upright
- flattened
- seated
- kneeling
- extended
- compressed
- posted
- folded

### Constraint State
What movement is currently restricted.

Examples:

- shoulder pinned
- hips blocked
- head controlled
- posting arm occupied
- inside position lost
- retreat blocked by boundary

## Stable vs Transitional State
Synochi should distinguish between an established position and a transition.

Example:

Half guard → knee-cut transition → hip clearance → side control

The middle phase should not be forced into either endpoint.

Transitions are states in their own right.

This matters because many decisive technical errors occur during transitions rather than settled positions.

## Hierarchical Recognition
Position should be represented hierarchically.

Example:

Grounded  
→ Guard  
→ Half Guard  
→ Top Position  
→ Chest-to-chest  
→ Crossface present  
→ Bottom athlete flattened

This allows Synochi to preserve useful information even when visual confidence is incomplete.

## Confidence Degradation
If visibility is limited, Synochi should reduce specificity rather than invent detail.

High confidence:
Top half guard, bottom athlete flattened with crossface and underhook control.

Medium confidence:
Top half guard with likely upper-body control.

Low confidence:
Grounded guard exchange; exact configuration unclear.

## Temporal Stability
A positional state should usually persist across multiple frames.

Synochi should avoid changing state labels because of temporary visual noise.

**Frames → Candidate state → Temporal consistency → Confirmed state**

A short movement does not necessarily mean the position has changed.

## Diagnostic Value
Correct positional recognition allows Synochi to move beyond surface-level commentary.

Instead of:

"You got passed."

Synochi can identify:

"Once your near shoulder was flattened and your inside frame disappeared, your hip rotation became unavailable and the pass became much harder to stop."

## Synochi Function
Positional state acts as the latent structural context for everything that follows.

**Visual input → Positional hypothesis → Structural features → Confidence → State confirmation → Transition detection → Updated state**

Technique recognition should sit on top of this layer, not replace it.

## Links
[[Combat Intelligence Hub]]
[[Combat Video Observation Schema]]
[[Observation vs Interpretation Separation]]
[[Visual Confidence Grading]]
[[Event Boundary Detection]]