---
status: 'proposed'
date: 2026-09-03
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent]
informed: []
reassessment-date: 2026-12-03
---

# Managed-channel faults act in flow, with notification as an adjunct

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context and an architecture review; human-oversight: unconfirmed until ratified at the /wr-architect:review-decisions drain.

## Context and Problem Statement

An authenticated readback on 2026-09-03 found three account notification policies, all email, covering passive origin monitoring, a web-analytics update and a budget alert. None covers the managed channel. There is no notification for webhook failure, entitlement drift, quota, origin failure or performance regression, and the launch readiness ledger recorded alert coverage as absent rather than merely unverified.

ADR-051 constrains what may be built in response. A check qualifies as a control only if it **acts**, or if its reader is an **agent** that surfaces it when the finding is actionable. A check terminating in the maintainer's attention is disqualified, and ADR-052 applied that to stale schedules, landing on agent-read at session start as the only reachable terminus there.

An architecture review on 2026-09-03 established that the conditions are not one class but three, and that treating them as one was the design error:

- Some **already act**. Paused collection, a disallowed subscription status and a non-immediate payment method are each refused before origin forwarding or accounting. Quota is reserved and stopped in the database. These need no notification to be controlled.
- Some **can act at the release**. ADR-082 and ADR-087 each carry a ratified criterion that configuration drift blocks activation, and neither has an implementation. A red release check is the acting shape and needs no terminus decision.
- Some have **no in-flow moment at all**: meter-delivery backlog, failed reconciliation, webhook delivery gaps, origin failure, latency regression. Only these need a terminus chosen.

For that last class the review put the choice to the maintainer, who directed on 2026-09-03: email, and SMS as well.

## Decision Drivers

- Billing faults with no in-flow moment accrue continuously against paying customers, unlike the discrete harm the stale-schedule terminus was designed for.
- The maintainer is sole, frequently absent, and a control that depends on someone noticing is not a control.
- The repository is public, so no notification may carry a customer identifier, usage total, provider message or credential.
- The existing health workflow already reads the relevant state every ten minutes in a single database statement, and adding scopes as further columns costs nothing.
- A self-inflicted outage on a paid channel is a real cost, so an acting auto-disable is not free.

## Considered Options

1. **Agent-read only** — extend the stale-schedule shape to this channel. Cheapest, fully compliant with ADR-051, but a fault persists silently until a session starts.
2. **Agent-read plus acting auto-disable** — the request path refuses the affected class until a session clears it. Strongest under ADR-051's acting limb, removes silent accrual, but deliberately takes the channel down on a condition that may be benign.
3. **Agent-read plus an email and SMS adjunct (chosen)** — keep the acting and agent-read layers as the controls, and add out-of-band notification so the maintainer learns of a fault without waiting for a session.
4. **Status quo** — fail closed with a distinguishable error and build nothing. Honest, already true, and makes every gap a customer-visible incident.

## Decision Outcome

Chosen option: **"Agent-read plus an email and SMS adjunct"**, per the maintainer's direction of 2026-09-03. Managed-channel fault handling has three layers, and only the first two are controls:

1. **Acting refusal in the request path**, for every condition with an in-flow moment. Already built and behaviourally tested; unchanged by this decision.
2. **Agent-read at session start**, for conditions with no in-flow moment. New scopes are added as further `EXISTS` columns inside the existing single health query, preserving its cost and its indistinguishability between empty and populated databases.
3. **Email and SMS notification, as an explicitly-not-a-control adjunct.** It shortens the time between fault and human awareness, which layer 2 alone does not do when no session runs for a day. It discharges no confirmation criterion and must never be counted as coverage.

Mechanically: the provider offers email and webhooks, PagerDuty is not eligible on this account, and there is no native SMS. SMS is therefore carried by the existing operations notification topic, which already has an email subscription, gaining an SMS subscription whose endpoint is a protected variable.

### An unbelievable corpus is louder than a clean one

The health reader must distinguish three states, not two, and check believability **first**: a scope that could not be read, or a corpus too small to be credible, is reported more loudly than a scope that was read and found stale. A clean bill of health over an empty corpus is the failure this project has already had once, and the existing stale-schedule reporter encodes the same rule with an inclusive floor on the corpus size, pinned on both sides by test because the boundary is otherwise ambiguous. This reader reuses that grammar rather than inventing a second one.

### What covers the workflow that carries this

Neither an agent-read check nor a notification detects its own absence. If the ten-minute health workflow stops firing, this decision's layer 2 and layer 3 both go quiet while reporting nothing, which is the failure mode they exist to prevent. **That gap is covered by the stale-schedule check of ADR-052 and by nothing else here**, and this decision depends on it: that reporter escalates when the last successful verification ages past the tightest cadence it defends, and this workflow is inside its corpus only for as long as it keeps declaring a schedule. A reader who removes or narrows the stale-schedule check removes the only thing watching this one.

### What a notification may contain

Both the email and the SMS payload carry **fixed condition codes, the scope, and the observation time, and nothing else**. No customer identifier, no organisation identifier, no usage total, no provider message, no credential, no request volume. This binds the new SMS egress path exactly as `docs/MANAGED_CHANNEL_MONITORING.md` already binds the existing report, and it is stated here because SMS is a new channel out of the account and the constraint would otherwise be inherited only by implication. A notification that discloses is worse than no notification.

**Worker observability stays disabled.** The chosen terminus reads database state, not Worker logs, so nothing here requires it. That matters: the Worker's one request log deliberately records the path without the query string, and enabling provider-side log retention would silently reverse that choice and put end-user address queries into retention.

## Consequences

### Good

- The controls stay where ADR-051 requires, and the acting layer is already proven.
- Additional monitoring scopes cost no extra requests or database statements.
- The maintainer learns of a billing fault without waiting for a session to start.
- Worker log retention, and the customer-data exposure it would create, is avoided.

### Neutral

- The operations notification topic gains a second purpose. Deliberate reuse rather than drift, recorded so a later reader does not mistake it for one.
- The channel is not live, so every outcome is trivially satisfied today. This is written before the need.

### Bad

- **The adjunct is easy to misread as coverage**, and that misreading is the main risk this decision carries. A future reader who marks the monitoring gate satisfied because alerts exist will have broken ADR-051 without noticing.
- Silent accrual between sessions is reduced, not eliminated: notification depends on the maintainer reading it.
- The notification path inherits the health workflow's liveness, and depends entirely on ADR-052's check to notice if that stops.
- Rejecting the auto-disable option means a billing fault can persist while the channel keeps serving and billing.

## Confirmation

1. Every new health scope is a column in the existing single query; a readback of the workflow's request and statement counts shows them unchanged.
2. A behavioural test proves each new condition produces its fixed code, and that a notification body for both email and SMS carries no customer identifier, usage total, provider message or credential.
3. A behavioural test proves the unbelievable-corpus state is reported ahead of, and distinguishably from, a clean read, with the corpus floor pinned on both sides.
4. The notification topic's SMS subscription exists with a protected endpoint, and no phone number appears in the repository.
5. The launch ledger's monitoring row records the adjunct as not-a-control, and the gate does not reach satisfied on its strength.
6. Worker settings readback continues to show observability disabled and logpush false.
7. The health workflow is inside the stale-schedule check's corpus, asserted by test rather than assumed.
8. An exercised failure response is demonstrated: a synthetic condition raises the notification and an agent surfaces it, without touching customer state.

## Pros and Cons of the Options

### Agent-read plus an email and SMS adjunct

- Good, because it keeps compliant controls and still shortens time-to-awareness.
- Good, because it needs no new provider surface beyond a subscription.
- Bad, because the adjunct invites being counted as coverage.

### Agent-read only

- Good, because it is the cheapest fully compliant shape.
- Bad, because a billing fault accrues silently between sessions.

### Agent-read plus acting auto-disable

- Good, because it converts the alert into a control and ends silent accrual.
- Bad, because it takes a paid channel down on a possibly benign condition.

### Status quo

- Good, because it adds nothing and is already true.
- Bad, because the customer becomes the first reader of every fault.

## Reassessment Criteria

Reassess if a billing fault reaches a customer before it reaches the maintainer, if the notification proves too noisy to read, if the appetite for a self-inflicted outage changes and the auto-disable becomes acceptable, or if the provider gains a native SMS or an eligible paging mechanism.

## Related

- [ADR-051 A check with no reader but the maintainer is not a control](051-a-check-with-no-reader-but-the-maintainer-is-not-a-control.proposed.md) — the rule this specialises; the adjunct is deliberately outside it.
- [ADR-052 The stale-schedule terminus is an agent at session start](052-the-stale-schedule-terminus-is-an-agent-at-session-start.proposed.md) — the agent-read shape reused here, and the only thing watching this decision's workflow.
- [ADR-064 Commercial request state in Cloudflare D1](064-commercial-request-state-stored-in-cloudflare-d1.proposed.md) — the state the health query reads.
- [ADR-081 Stripe collection pausing prohibited for managed subscriptions](081-stripe-collection-pausing-prohibited-for-managed-subscriptions.proposed.md) — its deny half is built; its alert half is what layer 3 addresses.
- [ADR-082 Managed-channel launch uses immediate-outcome payment methods](082-managed-channel-launch-uses-immediate-outcome-payment-methods.proposed.md) — carries an unimplemented drift-blocks-activation criterion.
- [ADR-087 Recovery follows the shared Stripe account's custom retries](087-recovery-follows-shared-stripe-custom-retries-and-cancels.proposed.md) — same, and the recovery policy the drift gate must assert.
- [JTBD-403 Know the paid channel still bills correctly](../jtbd/addressr-maintainer/JTBD-403-know-the-paid-channel-still-bills-correctly.proposed.md) — the job this decision serves; ratified 2026-09-03.
