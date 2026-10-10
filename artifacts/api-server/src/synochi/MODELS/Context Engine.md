# **Context Engine**

## **Core Idea**

The Context Engine determines **what information matters now**.

Synochi may know a large amount about an athlete, but not all of that information should influence every response.

The Context Engine selects and prioritises the most relevant information based on:

- the athlete’s current state,
- the immediate goal,
- the current problem,
- recent events,
- environmental conditions,
- training context,
- competition context,
- and relevant historical patterns.

Its job is to turn accumulated knowledge into **situationally relevant intelligence**.

## **Why It Matters**

Without a Context Engine, more memory can create worse reasoning.

A system may know hundreds of facts about an athlete but still give a poor recommendation if it gives equal importance to all of them.

The Context Engine should answer:

What does Synochi need to consider for this decision, right now?

This creates a distinction between:

**What Synochi knows**

and:

**What Synochi should use.**

## **Context Assembly**

For each meaningful interaction, Synochi should assemble a working context from the most relevant available information.

This may include:

- the current request,
- current athlete state,
- recent sessions,
- recent changes,
- active goals,
- known constraints,
- relevant strengths,
- previous responses to similar situations,
- current competition timeline,
- and high-confidence patterns from the [[Athlete Model]].

The context should be selective rather than exhaustive.

## **Relevance Over Volume**

More information should not automatically produce a better answer.

Context should be prioritised according to:

- relevance,
- recency,
- confidence,
- consequence,
- similarity to the current situation,
- and likely impact on the decision.

For example:

A technical issue from six months ago may be less relevant than a recurring problem observed in the last three sessions.

However, an older high-confidence pattern may still matter if the same conditions have returned.

## **Current State**

The Context Engine should give significant weight to current state when it materially changes the recommendation.

Examples include:

- fatigue,
- poor sleep,
- emotional disruption,
- high confidence,
- injury,
- competition stress,
- cognitive overload,
- unusually high readiness.

The same athlete may require different guidance in different states.

## **Goal Context**

The same observation can mean different things depending on the athlete’s goal.

For example:

A technically imperfect position may be acceptable during exploration.

The same position may require immediate correction two weeks before competition.

The Context Engine should therefore interpret information relative to:

What is the athlete currently trying to achieve?

## **Time Horizon**

Context should also reflect time horizon.

Synochi should distinguish between:

- what matters in the next exchange,
- what matters in today’s session,
- what matters this week,
- what matters before competition,
- and what matters for long-term development.

Short-term optimisation should not automatically override long-term development, and long-term development should not make immediate realities irrelevant.

## **Context Compression**

Synochi should compress large amounts of stored information into a smaller set of active factors.

For example:

Instead of retrieving twenty separate historical observations, the system may recognise:

This athlete repeatedly loses decision quality when fatigued and overloaded with options.

That higher-level pattern may be more useful than replaying the entire history.

Context compression should preserve the meaning of the evidence while reducing unnecessary noise.

## **Context Refresh**

Active context should be continuously refreshed.

New information may make previously relevant information less important or bring older information back into relevance.

For example:

An athlete entering competition week may make previously stored competition patterns suddenly highly relevant again.

Context therefore changes even when the underlying Athlete Model does not.

## **Context and Evidence**

The Context Engine should not treat all retrieved information as equally reliable.

Relevant information should still be interpreted through [[Evidence Weighting Model]].

A highly relevant but speculative belief should not automatically outweigh a slightly less recent but strongly validated pattern.

Relevance and confidence are separate dimensions.

## **Context and Intervention**

Intervention selection should depend on the active context.

The question is not simply:

What intervention generally works?

It is:

What intervention is most appropriate for this athlete, in this state, under these conditions, for this goal, at this moment?

This allows the same athlete to receive different guidance without the system becoming inconsistent.

## **Principle**

**The Context Engine makes Synochi situationally intelligent.**

The Athlete Model represents what Synochi currently understands about the athlete.

The Context Engine determines which parts of that understanding should influence the present decision.

In simple terms:

**Athlete Model = what we know**

**Context Engine = what matters now**

## **Connections**

- [[Athlete Model]]
- [[Evidence Weighting Model]]
- [[Context-Dependent Truth]]
- [[Outcome-Linked Intervention Learning Loop]]