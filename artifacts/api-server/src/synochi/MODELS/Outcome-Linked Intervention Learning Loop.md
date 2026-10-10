# **Outcome-Linked Intervention Learning Loop**

## **Core Idea**

Synochi should learn not only **what happens to an athlete**, but **what actually changes them**.

Remembering that an athlete was tired, hesitant, confident, overloaded, or technically stuck is useful.

But a more intelligent system should also learn:

What did we do in response?

What happened afterwards?

Did the intervention actually help?

The Outcome-Linked Intervention Learning Loop connects observations, interpretations, interventions, and outcomes so Synochi can progressively learn **which actions work for this specific athlete under specific conditions**.

The loop is:

**Observe → Infer State or Constraint → Select Intervention → Observe Response → Evaluate Outcome → Update Confidence → Change Future Policy**

---

## **1. Observe**

Start with what is actually happening.

This may come from:

- athlete self-report,
- training sessions,
- competition results,
- video analysis,
- recovery information,
- repeated behavioural patterns,
- or conversation.

Observation should remain separate from interpretation.

Example:

Athlete attempted three entries but stopped halfway through each one.

This is an observation.

Athlete lacks confidence.

That is an interpretation.

---

## **2. Infer State or Constraint**

Synochi forms its best current explanation for what may be producing the observed behaviour.

Possible constraints might include:

- fatigue,
- technical uncertainty,
- tactical confusion,
- excessive choice,
- fear of consequence,
- poor positioning,
- emotional disruption,
- low readiness,
- or environmental pressure.

Inference should be guided by the [[Athlete Model]], [[Context Engine]], and available evidence.

When uncertainty is high, Synochi should preserve that uncertainty rather than treating an interpretation as fact.

---

## **3. Select Intervention**

Synochi chooses an action intended to alter the identified constraint.

An intervention might be:

- a drill,
- a technical adjustment,
- a tactical rule,
- a training constraint,
- a recovery action,
- a change in session structure,
- a question,
- a reframing,
- or a behavioural instruction.

The intervention should have a reason.

Synochi should be able to represent:

I am recommending this because I currently believe this is the main constraint.

---

## **4. Observe Response**

After the intervention, Synochi observes what happened.

The response might include:

- immediate improvement,
- partial improvement,
- no meaningful change,
- deterioration,
- improvement only under certain conditions,
- or an unexpected effect.

The response is new evidence.

It should not automatically be interpreted as proof that the intervention caused the outcome.

---

## **5. Evaluate Outcome**

Synochi evaluates whether the intended outcome occurred.

The key question is:

Did the intervention produce a meaningful improvement in the thing it was intended to change?

For example:

Intervention:

Reduce the athlete to one preferred entry for the session.

Intended outcome:

Reduce hesitation and increase initiation.

Observed result:

Initiation frequency increases significantly.

This provides evidence that reducing choice may help this athlete when decision overload is present.

---

## **6. Update Confidence**

The outcome should change Synochi’s confidence in both:

- the original interpretation,
- and the usefulness of the intervention.

If the expected improvement occurs repeatedly, confidence increases.

If the intervention repeatedly fails despite the same apparent constraint, confidence should decrease.

This prevents Synochi from continuing to prescribe advice simply because it sounds theoretically correct.

---

## **7. Change Future Policy**

The final step is behavioural learning.

Synochi should use successful and unsuccessful intervention history to change what it does next time.

For example:

Synochi learns:

When this athlete becomes hesitant because tactical choice becomes excessive, narrowing them to one clear objective repeatedly improves initiation.

Future behaviour:

When similar conditions appear again, Synochi should become more likely to prescribe a narrow tactical objective.

This creates personalisation through outcomes rather than memory alone.

---

## **Intervention Memory**

Synochi should retain useful information about an intervention:

- what problem it was targeting,
- what context it occurred in,
- what was prescribed,
- how the athlete responded,
- what outcome occurred,
- and how confident Synochi is that the intervention was useful.

The important memory is not:

We gave this advice before.

It is:

We gave this intervention under these conditions, and this is what happened.

---

## **Success Is Contextual**

An intervention that works once should not automatically become a universal rule.

For example:

Simplifying tactical options works when the athlete is cognitively overloaded.

That does not necessarily mean:

The athlete should always have fewer options.

Synochi should learn the relationship between:

**Context → Constraint → Intervention → Outcome**

rather than simply ranking interventions as good or bad.

---

## **Failure Is Valuable**

An unsuccessful intervention is still useful information.

Failure may indicate:

- the inferred constraint was wrong,
- the intervention was poorly matched,
- the dose or timing was wrong,
- another constraint was dominant,
- or the context changed.

Synochi should therefore treat failed interventions as learning events rather than simply discarded advice.

---

## **Repeated Outcomes**

Confidence should increase when similar intervention-outcome relationships repeat.

One successful intervention suggests possibility.

Repeated success under similar conditions suggests a personalised pattern.

Repeated success across broader contexts may justify greater generalisation.

The system should therefore progressively learn:

What works?

For whom?

Under what conditions?

How reliably?

---

## **Relationship to the Athlete Model**

Successful learning should update the [[Athlete Model]].

For example:

Initial hypothesis:

Athlete may struggle when tactical choice becomes excessive.

Repeated intervention finding:

Narrowing tactical choices consistently improves decision speed.

Athlete Model update:

Athlete appears to perform better under high pressure when decision complexity is deliberately reduced.

The Athlete Model therefore becomes increasingly informed by **tested relationships**, not just accumulated observations.

---

## **Relationship to the Context Engine**

The [[Context Engine]] determines whether a previously successful intervention is relevant to the current situation.

Synochi should not retrieve an intervention merely because it worked before.

It should ask:

Are the conditions sufficiently similar for this previous outcome to matter now?

---

## **Learning Loop**

The full process is:

**Observe**

↓

**Infer State / Constraint**

↓

**Select Intervention**

↓

**Observe Response**

↓

**Evaluate Outcome**

↓

**Update Confidence**

↓

**Change Future Policy**

↓

**Observe Again**

The loop never truly ends.

Each intervention becomes another opportunity to improve Synochi’s model of the athlete.

---

## **Principle**

**Synochi should learn from what changes the athlete, not only from what the athlete tells it or what it observes.**

Personalisation becomes more powerful when the system learns:

**When this athlete is in this condition, this intervention tends to produce this outcome.**

That relationship should progressively influence future coaching decisions.

## **Connections**

- [[Athlete Model]]
- [[Context Engine]]
- [[Evidence Weighting Model]]
- [[Confidence Updating]]