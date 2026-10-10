
## Purpose

This node defines the basic structure Synochi should use when observing combat footage.

The goal is to separate raw visual observation from interpretation so that later diagnosis is built on clear evidence.

## Core Principle

Synochi should first describe what is visible.

Only after that should it infer meaning.

The observation layer should answer:

“What can actually be seen happening in the footage?”

## Observation Structure

Timestamp
→ Athlete State
→ Opponent State
→ Action
→ Reaction
→ Transition
→ Outcome
→ Confidence

## Primary Observation Categories

### Position

What position or state are the athletes currently in?

Examples:

- Standing neutral
- Clinch
- Front headlock
- Open guard
- Half guard
- Side control
- Mount
- Back control
- Scramble
- Transitional state

### Athlete Action

What does the athlete visibly do?

Examples:

- Shoots
- Frames
- Posts
- Turns
- Changes level
- Reaches
- Grips
- Pummels
- Bridges
- Shrimp
- Passes
- Attacks submission
- Disengages

### Opponent Reaction

What does the opponent visibly do in response?

Examples:

- Sprawls
- Posts
- Frames
- Turns away
- Turns in
- Builds posture
- Retreats
- Drives forward
- Recovers guard
- Clears connection

### Transition

What state change occurs?

Example:

Standing
→ Single-leg entry
→ Sprawl
→ Front headlock

### Outcome

What was the immediate result?

Examples:

- Position maintained
- Position improved
- Position lost
- Score created
- Submission exposure
- Escape
- Reset
- No meaningful change

## Observable vs Inferred

Synochi should distinguish:

### Observable

“Opponent posts right hand.”

### Inferred

“Opponent may be posting to prevent being rotated.”

The first belongs in the observation layer.

The second belongs in later reasoning.

## Temporal Segmentation

Video should be broken into meaningful combat events rather than arbitrary fixed intervals.

A segment may begin when:

- Position changes
- A new attack begins
- A reaction occurs
- Initiative changes
- A scramble starts
- A submission threat appears
- The exchange resets

## Confidence

Each observation should carry confidence.

### High Confidence

Clearly visible.

### Moderate Confidence

Mostly visible but partially obstructed or ambiguous.

### Low Confidence

Important details are hidden, unclear, or outside the frame.

Synochi should not manufacture certainty from poor footage.

## Missing Information

Synochi should explicitly recognise when footage does not show enough information.

Examples:

- Grip hidden
- Leg position obscured
- Camera angle blocks hip relationship
- Action begins before clip starts
- Exchange ends outside frame

Unknown should remain unknown.

## Observation Compression

Repeated low-level observations may later be compressed into meaningful patterns.

Example:

Opponent posts right hand
→ athlete redirects
→ opponent turns away

Repeated across footage:

“Right-hand posting repeatedly creates back exposure.”

Compression should happen after observation, not before.

## Design Objective

Synochi should create a reliable visual evidence layer that later Combat Intelligence can reason over.

The goal is:

See accurately
→ structure the event
→ preserve uncertainty
→ then diagnose

## Links

[[Combat Intelligence Hub]]

[[Combat Intelligence — Operating Definition]]

[[Observation vs Inference]]

[[Positional State Transition]]

[[Reaction Chain Mapping]]