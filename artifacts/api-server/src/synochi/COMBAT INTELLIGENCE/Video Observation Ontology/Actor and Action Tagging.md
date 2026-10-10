
## Purpose

This node defines how Synochi should consistently identify who is doing what during combat footage.

Reliable video reasoning requires clear separation between:

- Athlete action
- Opponent action
- Shared positional state
- Resulting transition

## Core Principle

Every observed action should be attached to an actor.

Synochi should avoid ambiguous descriptions such as:

“An underhook is established.”

Prefer:

“Athlete establishes the underhook.”

or:

“Opponent establishes the underhook.”

## Actor Categories

### Athlete

The primary user being analysed.

### Opponent

The athlete’s current training partner or competitor.

### External Actor

Used only when relevant.

Examples:

- Referee intervention
- Coach instruction
- Boundary reset

## Action Tag Structure

Actor
→ Action
→ Target
→ Direction
→ Result

Example:

Athlete
→ posts
→ right hand
→ outside
→ prevents rotation

## Core Action Classes

Synochi should classify visible actions into broad categories.

### Positioning

- Step
- Pivot
- Turn
- Level change
- Hip shift
- Base adjustment
- Angle change
- Posture change

### Connection

- Grip
- Underhook
- Overhook
- Frame
- Post
- Tie
- Clamp
- Body lock
- Head control

### Offensive Action

- Entry
- Takedown attempt
- Sweep
- Pass
- Submission attack
- Strike
- Off-balance
- Snapdown
- Back take

### Defensive Action

- Sprawl
- Frame
- Hand fight
- Post
- Hip escape
- Bridge
- Guard recovery
- Submission defence
- Technical stand-up
- Disengagement

### Transitional Action

- Scramble
- Turn
- Re-attack
- Re-shot
- Switch side
- Transfer
- Follow-up
- Reset

## Target Tagging

Where useful, Synochi should identify what the action is directed toward.

Examples:

- Head
- Arm
- Wrist
- Hip
- Leg
- Torso
- Base
- Space
- Position
- Connection

## Direction Tagging

Direction may matter.

Examples:

- Forward
- Backward
- Left
- Right
- Inside
- Outside
- Up
- Down
- Across
- Around

Synochi should only add direction when it is visually clear and relevant.

## Action Granularity

Synochi should use the smallest useful action description.

Too vague:

“Athlete moves.”

Too detailed:

“Athlete externally rotates shoulder while flexing elbow.”

Useful:

“Athlete pummels inside for an underhook.”

## Simultaneous Actions

Combat often contains multiple actions at once.

Synochi should allow:

Athlete action
+
Opponent action
+
State change

to be represented together when necessary.

Example:

Athlete drives forward
while
Opponent widens base
resulting in
No positional change.

## Action Sequence

Repeated tags can form a sequence.

Example:

Athlete level change
→ Opponent sprawls
→ Athlete maintains connection
→ Athlete transitions to front headlock

These observations can later feed reaction-chain analysis.

## Uncertain Action

If the action is unclear, Synochi should tag uncertainty rather than guess.

Example:

“Opponent appears to establish inside control.”

Confidence:
Moderate.

## Design Objective

Synochi should produce consistent, actor-specific observations that can be reused across:

- Pattern detection
- Technique recognition
- Decision analysis
- Failure-chain analysis
- Opponent profiling
- Drill prescription

## Links

[[Combat Intelligence Hub]]

[[Combat Video Observation Schema]]

[[Visual Confidence Grading]]

[[Event Boundary Detection]]

[[Reaction Chain Mapping]]