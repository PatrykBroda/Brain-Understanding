# 

## Type
Video Observation Ontology

## Domain
[[Combat Intelligence Hub]]

## Definition
Constraint Recognition is Synochi’s ability to identify the structural, positional, mechanical, spatial, or tactical factors that are limiting an athlete’s available actions during an exchange.

A constraint is not simply a bad position.

It is anything that meaningfully reduces the athlete’s viable option-space.

## Core Principle
Before judging a decision, identify what options were actually available.

**State → Constraints → Available options → Chosen action → Outcome**

An action that appears poor in isolation may be reasonable under severe constraint.

## Why It Matters
Video analysis becomes shallow when it evaluates only the visible action.

Example:

An athlete fails to hip escape from side control.

Surface interpretation:

"They should have shrimped."

Constraint-aware interpretation:

"The near shoulder was pinned, the head was turned away, the far hip was blocked, and there was no effective frame. The hip escape option was already structurally degraded."

The meaningful problem occurred before the failed escape.

## Constraint Classes

### Positional Constraint
The current position limits available movement.

Examples:

- mounted
- pinned against boundary
- back exposed
- trapped underneath hips

### Mechanical Constraint
Body structure prevents efficient movement.

Examples:

- shoulder pinned
- elbow separated
- spine rotated
- hips flattened
- knee line controlled

### Connection Constraint
Opponent attachment prevents separation or redirection.

Examples:

- body lock
- wrist ride
- crossface
- seatbelt
- leg entanglement

### Spatial Constraint
The environment or available space restricts movement.

Examples:

- cage
- wall
- mat boundary
- opponent blocking retreat path

### Balance Constraint
The athlete cannot freely move because base is compromised.

Examples:

- weight shifted over one leg
- posting hand occupied
- centre of mass displaced
- stance narrowed

### Tactical Constraint
The athlete avoids an option because it creates another credible threat.

Example:

Turning inward may expose a choke.

The movement is physically available but strategically constrained.

## Constraint Accumulation
Constraints often become dangerous through accumulation.

One constraint may be manageable.

Several simultaneous constraints can collapse the decision-space.

Example:

Crossface  
+ underhook  
+ flattened hips  
+ trapped lower leg

Each condition narrows the defensive system.

Together they may produce near-total positional compression.

## Constraint Removal
Defence is often not about immediately escaping the position.

It may first require removing one constraint.

Example:

Before escaping mount:

recover elbow position  
→ restore frame  
→ recover hip movement  
→ create angle  
→ escape

Synochi should recognise this sequence.

## Constraint Priority
Not all constraints carry equal importance.

Some constraints are upstream.

Removing them restores multiple options at once.

Example:

Recovering head position may restore:

- posture
- rotation
- base
- framing ability
- escape direction

Synochi should attempt to identify the highest-leverage constraint rather than simply listing everything that is wrong.

## Hidden Constraints
Some constraints are not visually obvious from one frame.

They may emerge through repeated failed movement.

Example:

Athlete repeatedly attempts to turn left but cannot.

Possible hidden constraint:

opponent controlling far hip outside camera angle.

Synochi should mark this as inferred rather than directly observed.

## Constraint vs Preference
An athlete choosing not to perform an action does not prove they were unable to perform it.

Synochi should distinguish:

- mechanically unavailable
- tactically undesirable
- not recognised
- deliberately rejected
- visually unclear

This protects against false diagnosis.

## Constraint Release Event
A meaningful release occurs when an athlete regains previously unavailable action-space.

Examples:

- frame recovered
- grip broken
- head freed
- knee line cleared
- posture restored
- wall escaped

Constraint release often marks the beginning of a successful transition.

## Diagnostic Example
Surface analysis:

"You waited too long to escape."

Constraint-aware analysis:

"By the time you initiated the escape, your head, near shoulder, and hip were already controlled. The higher-value intervention was preventing the second and third constraints from accumulating."

## Coaching Value
Constraint Recognition helps Synochi identify:

- why techniques failed
- which defensive action should come first
- when positional deterioration became significant
- which control mattered most
- whether the athlete lacked options or simply selected poorly

This moves analysis from:

**What technique should you have used?**

toward:

**What needed to become possible first?**

## Synochi Function
Synochi should maintain a dynamic constraint map:

**Observe state → detect restrictions → estimate severity → identify accumulated constraints → rank leverage → detect release → update available action-space**

Constraints should feed directly into decision analysis and coaching recommendations.

## Links
[[Combat Intelligence Hub]]
[[Positional State Recognition]]
[[Control Change Detection]]
[[Transition State Detection]]
[[Threat Recognition]]
[[Observation vs Interpretation Separation]]