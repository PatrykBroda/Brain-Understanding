
## Purpose

This node defines how Synochi should understand physical distance between athletes and how that distance changes which actions are available.

This becomes especially important as Combat Intelligence expands into wrestling, MMA, boxing, Muay Thai, and other combat sports.

## Core Principle

Technique availability is constrained by range.

Synochi should first understand:

“Where are the athletes relative to each other?”

before evaluating what action makes sense.

## General Range States

### Outside Range

Minimal immediate contact.

Common priorities:

- Distance management
- Entry preparation
- Feints
- Angle creation

### Entry Range

Athletes can initiate meaningful contact.

Common priorities:

- Timing
- First contact
- Level change
- Grip or strike entry
- Defensive readiness

### Connected Range

Physical connection is established.

Examples:

- Clinch
- Tie-up
- Grip fighting
- Body lock
- Hand fighting

### Ground Engagement

Range becomes positional rather than purely spatial.

Examples:

- Open guard distance
- Half guard
- Chest-to-chest control
- Submission range

## Range Transition

Outside
→ Entry
→ Connection
→ Control

or:

Control
→ Separation
→ Reset

Synochi should recognise the transition rather than treating each state independently.

## Range Mismatch

Synochi should identify when the athlete attempts an action from an unsuitable range.

Examples:

- Shooting from too far away
- Striking while overextended
- Attempting control without sufficient connection
- Passing without managing guard distance

## Athlete-Specific Range

Different athletes may perform best at different ranges.

Synochi should learn:

- Preferred distance
- Strongest entry range
- Strongest connected positions
- Weakest transition range
- Opponent styles that disrupt preferred distance

## Design Objective

Synochi should understand range as a state variable that determines what actions are realistically available.

## Links

[[Combat Intelligence Hub]]

[[Positional State Transition]]

[[System Entry Routes]]

[[Decision Point Recognition]]

[[Tempo and Pace Control]]