# Weight Distribution Inference

## Type
Video Observation Ontology

## Domain
[[Combat Intelligence Hub]]

## Definition
Weight Distribution Inference is Synochi’s ability to estimate how an athlete’s body mass and pressure are likely distributed across their base, contact points, limbs, and opponent from visible posture and movement.

The system does not directly measure force.

It infers probable loading from observable structure.

## Core Principle
Posture reveals likely pressure pathways.

**Body position → Base relationship → Contact structure → Probable loading → Available movement**

Weight placement should therefore be treated as a probabilistic mechanical inference rather than a visually certain fact.

## Why It Matters
Many combat actions depend less on nominal position than on where weight is actually loaded.

Examples:

- a leg may be visually planted but lightly weighted
- a hand may be posted because balance depends on it
- hips may be high but pressure may still be transferred through the chest
- an opponent may appear stable while most weight is committed to one side

These distinctions affect:

- takedowns
- sweeps
- guard passing
- escapes
- pins
- scrambles
- submissions
- striking balance

## Observable Indicators

### Centre of Mass Projection
Synochi should estimate where the athlete’s centre of mass is likely projecting relative to the base.

Signals include:

- torso lean
- hip position
- head position
- shoulder alignment
- knee bend
- foot placement

### Base Width
A wider or narrower base changes likely loading and balance options.

### Joint Compression
Greater flexion at the ankle, knee, hip, elbow, or shoulder may indicate increased loading through that structure.

### Post Dependence
If removal or movement of a limb causes immediate balance correction, that limb was likely carrying meaningful load.

### Contact Density
Multiple strong contact points may distribute weight.

Few contact points may concentrate it.

### Opponent Deformation
Compression, flattening, head displacement, or restricted hip motion may indicate pressure transfer into the opponent.

### Recovery Movement
How quickly a limb can move may reveal whether it was heavily or lightly weighted.

## Weight-Bearing Limb Detection
Synochi should estimate which limbs are currently:

- heavily loaded
- moderately loaded
- lightly loaded
- unweighted
- transitional

Example:

During a standing exchange, an opponent’s rear leg may appear planted but become rapidly movable.

This may indicate low loading despite visual contact with the mat.

## Upper vs Lower Body Loading
Weight distribution should not be reduced to feet alone.

In grappling, load may pass through:

- knees
- elbows
- hands
- chest
- shoulder
- hips
- head
- opponent contact

Example:

A passer may have both knees on the mat while most effective pressure travels through shoulder and chest connection.

## Directional Loading
Synochi should estimate not only where weight is placed but in which direction pressure is being applied.

Possible directions:

- forward
- backward
- lateral
- rotational
- downward
- diagonally through the opponent

Directional loading can determine which movements are available or structurally expensive.

## Dynamic Weight Shift
Weight distribution changes continuously.

Synochi should track:

**initial loading → shift → redistribution → resulting action**

Examples:

- weight shifts forward before snapdown
- weight transfers onto lead leg before shot
- hips shift laterally before knee cut
- pressure transfers across chest before mount transition

These shifts may reveal intent or opportunity, but intent should remain inferential.

## Asymmetric Loading
Many useful combat states are asymmetrical.

Examples:

- majority weight on one hip
- one shoulder loaded more heavily
- one leg acting as primary base
- opponent pinned more heavily on one side

Asymmetry often creates predictable light sides and heavy sides.

## Light-Side Detection
Where weight is absent can be as useful as where it is present.

A lightly loaded limb may be easier to:

- lift
- reap
- pummel around
- drag
- redirect
- remove from base

Synochi should therefore identify both:

**loaded structures**

and

**available structures**

## Pressure Inference
Pressure should be inferred from the combination of:

- body alignment
- contact surface
- force direction
- opponent compression
- movement restriction
- persistence over time

Visual closeness alone does not prove meaningful pressure.

## Confidence Handling
Weight inference should carry confidence levels.

High confidence:
Clear unilateral stance with visible centre-of-mass shift over lead leg.

Medium confidence:
Likely greater loading through left hip based on torso angle and base.

Low confidence:
Exact distribution unclear due to camera angle or occlusion.

Synochi should avoid claims such as:

"80% of the weight is on the right leg"

unless actual sensor data exists.

## Interaction With Technique
Technique interpretation should use inferred loading.

Example:

Instead of:

"He could have swept here."

Synochi may reason:

"His opponent’s weight appears committed over the far knee, making the near-side post comparatively light and potentially available to remove."

This produces mechanically grounded analysis.

## Diagnostic Value
Weight Distribution Inference can help explain:

- why a sweep succeeded
- why a takedown failed
- why a post could not move
- why an escape direction was unavailable
- why pressure felt structurally dominant
- why a transition became possible

## Synochi Function
Synochi should infer weight distribution dynamically:

**Observe posture → Identify base → Estimate centre-of-mass projection → Detect loaded contact points → Infer directional pressure → Track weight shift → Update mechanical possibilities**

The result should modify the current positional, constraint, threat, and decision models.

## Links
[[Combat Intelligence Hub]]
[[Positional State Recognition]]
[[Constraint Recognition]]
[[Control Change Detection]]
[[Transition State Detection]]
[[Decision Window Recognition]]
[[Observation vs Interpretation Separation]]