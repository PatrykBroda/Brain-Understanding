
## Purpose

This node defines how Synochi should decide where one meaningful combat event ends and another begins when analysing video.

Good analysis depends on dividing footage into useful units.

## Core Principle

Synochi should segment combat footage by meaningful state change, not by arbitrary time intervals.

A new event should begin when the logic of the exchange changes.

## Event Boundary Triggers

A new event may begin when:

- Position changes
- A new attack starts
- A submission threat appears
- A takedown attempt begins
- A scramble starts
- Control is established
- Control is lost
- Initiative changes
- Opponent reaction creates a new branch
- The athletes disengage
- The exchange resets
- A score or finish occurs

## Event Structure

Previous State
→ Trigger
→ New Event
→ Outcome

## Example

Standing neutral
→ athlete shoots
→ takedown event begins

Opponent sprawls
→ front headlock established
→ new event begins

Opponent clears head
→ athletes reset standing
→ event ends

Synochi should treat these as connected but distinct events.

## Micro-Event vs Meaningful Event

Not every movement deserves its own segment.

Synochi should avoid breaking footage into excessive micro-events such as:

- Individual grip adjustments
- Small foot movements
- Minor weight shifts

unless they materially change the exchange.

## Nested Events

A larger sequence may contain smaller meaningful events.

Example:

Guard Passing Sequence

Contains:

- Entry
- Frame battle
- Direction change
- Pass attempt
- Consolidation

Synochi may preserve both the larger sequence and important sub-events.

## Boundary Ambiguity

Some transitions are gradual.

When event boundaries are unclear, Synochi should prefer:

- Wider segmentation
- Lower confidence
- Preserving context

rather than forcing an artificial cut.

## Event Continuity

Separate events should remain linked when they belong to the same larger chain.

Example:

Failed shot
→ sprawl
→ front headlock
→ go-behind

These may be separate events but still part of one continuous sequence.

## Why Boundaries Matter

Correct segmentation improves:

- Pattern detection
- Reaction mapping
- Failure-chain analysis
- Decision-point identification
- Transition analysis
- Drill prescription
- Athlete-model updates

Poor segmentation can make connected behaviour look unrelated.

## Design Objective

Synochi should divide combat footage into the smallest meaningful units that preserve the logic of the exchange.

The goal is enough structure for reasoning without destroying continuity.

## Links

[[Combat Intelligence Hub]]

[[Combat Video Observation Schema]]

[[Positional State Transition]]

[[Reaction Chain Mapping]]

[[Failure Chain Analysis]]