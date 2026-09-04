---
status: 'proposed'
date: 2026-09-04
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
supersedes-clause: 088#layer-2-carrier-and-layer-3-adjunct
reassessment-date: 2026-12-04
---

# Managed-channel notification leaves CI and drops SMS

> The outcome below was directed by the maintainer on 2026-09-04 through a structured choice, after the shape ADR-088 prescribed had been built and before it was applied. The surrounding sections are derived by the capturing agent and are not yet ratified, which is what `human-oversight: unconfirmed` states; the `/wr-architect:review-decisions` drain is where a human ratifies or amends them.

## Context and Problem Statement

ADR-088 chose a three-layer shape for managed-channel fault handling on 2026-09-03 and was ratified the same day. Its layer 3 was built on 2026-09-04: an SMS subscription on the shared operations topic, filtered by message attribute, with the endpoint held in a protected Terraform variable and a publish role for a scheduled GitHub Actions workflow. The Terraform configuration was never applied. The release that would have run it was skipped when the pipeline went red on an unrelated fixture, so it was withdrawn before it took effect.

Two objections surfaced on review of the built shape, and neither is a defect in the code that was written.

**A scheduled CI job is not monitoring infrastructure.** ADR-088 chose the existing ten-minute health workflow as the carrier for layer 2's new scopes on a cost argument: the query already runs, and scopes are further columns. The cost argument is sound and the carrier is not. A continuous-integration runner is provisioned to build and test a change; it has no availability commitment, its schedule is best-effort and silently deprioritised under load, and it is disabled wholesale when a repository goes quiet. ADR-088 already recorded that this workflow's own liveness is watched by exactly one thing, the stale-schedule check, and that removing that check removes the only thing watching. That dependency is a symptom rather than a design: it exists because the carrier cannot be trusted to run.

**The provider has no SMS product.** ADR-088 recorded this and routed around it by carrying SMS on the operations topic in the other cloud account, where the search infrastructure lives. That works, and it makes a handset alert about a Worker-and-database channel depend on a second provider, a second account, a sandbox verification, a spend cap, and a credential published from CI. A verification message was sent by hand through that provider's console on 2026-09-04 and did arrive, so the transport was proven; what was not established is that the transport is worth its dependency surface.

The channel is not live, so nothing was at risk while this was decided.

## Decision Drivers

- A detector that runs on best-effort infrastructure reports nothing when it does not run, which is the failure mode layer 3 exists to prevent.
- Every handset path needs a third party and a stored credential, and each credential is a standing liability on a public repository with a sole maintainer.
- The Worker already runs on a schedule beside the database this checks, under an availability commitment the CI runner does not carry.
- The maintainer's out-of-band reachability is genuinely limited, so the goal that motivated SMS is real even where the mechanism is rejected.
- A withdrawn mechanism must leave the ledger reading MISSING rather than partially covered, or the withdrawal silently improves the apparent posture.

## Considered Options

1. **Keep the built shape** — the CI-carried health workflow publishing email and SMS through the operations topic. Already written, proven to deliver, and the shape ADR-088 ratified.
2. **Worker cron carrier with native provider email, no SMS (chosen)** — move both the scopes and the notification to the scheduled Worker handler, and notify by the provider's own email, which needs no stored credential.
3. **Worker cron carrier with third-party SMS** — same carrier, keeping the handset path through a messaging vendor. Preserves reachability at the cost of a credential and a vendor.
4. **Agent-read only** — withdraw notification entirely and rely on layer 2 at session start, which is ADR-088's own rejected option 1.

## Decision Outcome

Chosen option: **"Worker cron carrier with native provider email, no SMS"**, per the maintainer's direction of 2026-09-04.

1. **Layer 3 is withdrawn in whole**, both halves. Not the SMS half only: the notification step was removed entirely, so the email half went with it. Nothing in the repository sends a managed-channel notification.
2. **The carrier for layer 2's new scopes is the Worker's scheduled handler, not a CI workflow.** The cost argument that put them in the health query does not transfer, because the query would move.
3. **Notification is the provider's native email and nothing else.** No SMS, no messaging vendor, no credential stored for the purpose. If a future handset path is wanted, it is a new decision with the credential cost stated.

   **Of those two constraints, the credential-free one is load-bearing and native email is the mechanism.** Stated because the consequences below record that the two may turn out to be incompatible, and a reassessment that has to guess which one governs will re-litigate the whole choice. If no credential-free email path exists, this decision does not silently acquire a credential: it reopens, and the fallback to weigh first is the agent-read-only shape, not a credentialed vendor.

4. **Until that is built, alert coverage is MISSING.** Not partial, not pending, not covered-by-adjunct. The launch-readiness ledger records it as missing, which is where it stood before the attempt.

**This decision does not claim the replacement exists.** It records the direction and the withdrawal. The replacement is unbuilt on the date of this record, and a reader who finds it still unbuilt has found an accurate record rather than drift.

### What the withdrawal deliberately kept

The notification payload rule is retained without a caller, and that retention is deliberate rather than residue. It is an allowlist of four fields, not a denylist, so a field added upstream later cannot ride out by default, and its tests passed unchanged against a rewritten header, which is the evidence that they were about the payload rather than the transport. It is **not a control** while nothing calls it. It is the payload contract a replacement would use, and keeping it is cheaper than re-deriving the non-disclosure rule under time pressure if one is built.

Two regression tests written for the withdrawn shape also survive, guarding defect classes independent of it: that any pipeline carrying a health script's exit code runs under an explicit `pipefail` shell, and that every no-default Terraform root variable is wired into both the step environment and the devcontainer passthrough of all three plan and deploy workflows, with the converse that no workflow wires a variable the module no longer declares. Their rationale lives in their own headers and in the withdrawal's changeset, not here.

## Superseded clauses

Enumerated exactly rather than counted, because the `supersedes-clause` anchor is free text that no check resolves to a location.

1. **The chosen option's name.** "Agent-read plus an email and SMS adjunct" no longer names what is decided.
2. **Decision Outcome layer 3 in whole.** "Email and SMS notification, as an explicitly-not-a-control adjunct", including the claim that it shortens the time between fault and human awareness.
3. **Decision Outcome layer 2's carrier.** The new scopes as "further `EXISTS` columns inside the existing single health query" of the CI workflow. The scopes stand; the place they live does not.
4. **The mechanical paragraph.** SMS carried by the existing operations notification topic, gaining a subscription whose endpoint is a protected variable.
5. **Decision driver 4.** That the existing health workflow reads the state every ten minutes and adding scopes as columns costs nothing. True of the query, and it was the reason the wrong carrier was chosen.
6. **"What covers the workflow that carries this", in whole.** Most of it reasons about a CI workflow that no longer carries this, and its dependency on the stale-schedule check was a symptom of the carrier rather than a property of the design. Its opening premise, that neither an agent-read check nor a notification detects its own absence, is a general truth that the carrier argument does not reach; it is retired here only because **this record re-carries it directly**, at confirmation criterion 6 below. The stale-schedule check itself is untouched and still watches everything else in its corpus, the existing health workflow included.
7. **"What a notification may contain", the SMS half.** The binding on the SMS egress path out of the other account. The field rule itself stands and is now carried by the payload allowlist and its tests.
8. **Consequence, Good.** "The maintainer learns of a billing fault without waiting for a session to start." Nothing sends, so nothing is learned out of band.
9. **Consequence, Neutral.** "The operations notification topic gains a second purpose." It does not; it carries only the search email subscription it carried before.
10. **Consequence, Bad.** "The adjunct is easy to misread as coverage." There is no adjunct to misread. The underlying hazard is preserved and sharpened by outcome item 4.
11. **Consequence, Bad.** "Silent accrual between sessions is reduced, not eliminated: notification depends on the maintainer reading it." Silent accrual between sessions is not reduced at all.
12. **Consequence, Bad.** "The notification path inherits the health workflow's liveness, and depends entirely on ADR-052's check to notice if that stops." There is no notification path.
13. **The Decision Outcome preamble.** "Managed-channel fault handling has three layers, and only the first two are controls." Two layers, and both are the controls.
14. **Confirmation criterion 2, its SMS half.** That a notification body for **both email and SMS** carries no customer identifier, usage total, provider message or credential. The field rule itself stands and is met today; the SMS body it names cannot exist.
15. **Confirmation criterion 4, its first half.** "The notification topic's SMS subscription exists with a protected endpoint." An obligation a release gate can read, now permanently unsatisfiable, which is why it is retired here rather than left to the disposition table alone. Its second half, that no phone number appears in the repository, stands.
16. **Confirmation criterion 5.** "The launch ledger's monitoring row records the adjunct as not-a-control, and the gate does not reach satisfied on its strength." There is no adjunct to record. Replaced by something stricter, that the row records alert coverage as missing.
17. **Confirmation criterion 8, its notification half.** "A synthetic condition raises the notification." Unmeetable while nothing sends. Its agent-surfacing half is independent and stands.
18. **Pros and Cons of the chosen option, two of three bullets.** "Good, because it keeps compliant controls and still shortens time-to-awareness" is the claim item 2 retires, credited as a virtue of the option that won. "Good, because it needs no new provider surface beyond a subscription" is contradicted by this record's own context: a second provider, a second account, a sandbox verification, a spend cap and a credential published from CI. The third bullet, that the adjunct invites being counted as coverage, stands as an accurate warning about a thing that no longer exists.
19. **Reassessment criterion, one trigger.** "If the notification proves too noisy to read" aims a future reader at a mechanism that will not exist. The remaining triggers stand, and the provider-gains-native-SMS trigger is re-carried by this record's own reassessment criteria.

**Recorded so the sweep does not over-route.** ADR-088's Good consequence "Additional monitoring scopes cost no extra requests or database statements" **survives, in the same narrowed form as criterion 1 below**. It is the carrier-free form of the claim item 5 retires, so it transfers to whatever carries the scopes; but it transfers as _the scopes ride an existing statement rather than adding one each_, relative to whatever query carries them. It does not survive as "costs nothing extra over today", which would be false against a Worker handler that runs no health query at all.

## Confirmation criteria of ADR-088, disposition of each

- **Criterion 1** — new scopes are columns in the single query, request and statement counts unchanged. **Carried forward in part, narrowed.** "Counts unchanged" is baseline-relative and does not survive a retarget: there is no health query in the Worker handler today, so moving the scopes there establishes a new baseline rather than preserving one. What transfers is the narrower property, that the scopes are columns in a **single statement** rather than a statement each.
- **Criterion 2** — behavioural test proves each condition's fixed code, and that an email and SMS body carries no customer identifier, usage total, provider message or credential. **Split.** The field rule is met today by the payload allowlist and its tests. The per-condition codes are unmet, since the conditions are unbuilt. The SMS half is void.
- **Criterion 3** — the unbelievable-corpus state reports ahead of a clean read, floor pinned on both sides. **Carried forward unchanged.** Untouched by the carrier or the transport.
- **Criterion 4** — the SMS subscription exists with a protected endpoint and no phone number appears in the repository. **Void in its first half, standing in its second.** There is no subscription and no variable. No phone number appears in the repository, and that remains true and worth keeping true.
- **Criterion 5** — the ledger's monitoring row records the adjunct as not-a-control and the gate does not reach satisfied on its strength. **Superseded by something stricter.** There is no adjunct, and the row records alert coverage as missing.
- **Criterion 6** — Worker observability stays disabled and logpush false by readback. **Carried forward unchanged, and now load-bearing.** Moving the check into the Worker makes it likelier that someone reaches for Worker logs, which is exactly what this criterion forbids.
- **Criterion 7** — the health workflow is inside the stale-schedule check's corpus, asserted by test. **Holds today unchanged, AND transfers if the carrier moves.** Both halves, because dropping the first would release a live obligation. The existing health workflow still declares a schedule and still runs the five existing fault conditions, so it is in the corpus today and must stay there until layer 2 actually moves. If it moves, the obligation follows the carrier: a Worker cron is not covered by a check that reads workflow schedules, so establishing that coverage is a precondition of the replacement rather than an afterthought.
- **Criterion 8** — an exercised failure response raises a notification and an agent surfaces it, without touching customer state. **Unmet, and unmeetable unless a replacement exists.** The agent-surfacing half is independent of the notification half and remains required.

## Consequences

### Good

- The detector is **intended to** run on infrastructure with an availability commitment, rather than on a best-effort CI schedule that reports nothing when it is skipped. Intent, not an achieved property, for the same reason as the bullet below: nothing runs today.
- The replacement is **intended to** store no credential and put no second provider or account on the notification path. Two hedges, both load-bearing: today nothing is stored because nothing sends at all, and whether a credential-free send path is available here is unestablished, per the last of the bad consequences below. The good is the intent, not an achieved property.
- The launch ledger's monitoring row records alert coverage as MISSING inside a gate that stays PARTIAL, because the five existing fault conditions do still run. The withdrawal cannot be mistaken for progress.
- Two regression tests survive that were written for the withdrawn shape and guard classes of defect independent of it, plus the retained payload contract.

### Neutral

- The channel is not live, so no customer is exposed by the gap this records.
- The payload builder is retained without a caller. Deliberate, and it is not a control while nothing calls it.

### Bad

- **Alert coverage is missing and this decision does not fix it.** It records a direction and removes a wrong mechanism. Until a replacement exists, and this record does not assure that one will, a fault with no in-flow moment is invisible until a session starts.
- Out-of-band reachability is lost outright. Email is weaker than a handset alert for a maintainer who is frequently absent, and that was the reason SMS was chosen in the first place.
- ADR-088 remains ratified and its layer 3 text still reads as current on **two** surfaces, since amendment is prohibited: the per-ADR body, and the compendium entry that is the architect agent's routine load surface, which still asserts the email-plus-SMS adjunct and still lists the SMS-subscription criterion. The compendium is the more damaging of the two, which is what makes the reverse badge load-bearing rather than bookkeeping.
- Work was built and withdrawn the same day. The carrier was inherited from the prior decision rather than chosen, and the review that rejected it could have happened before the work.
- **The chosen terminus is not yet shown to exist**, and this record does not establish that it does. An authenticated read of the account's available alert types later on 2026-09-04 returned nothing that can carry a condition a Worker computes over database state: the closest types fire on the provider's own probes of an HTTP endpoint, and the one type that could carry a Worker signal is ruled out by criterion 6 above. That leaves the provider's mail-forwarding product as the only credential-free send path, and whether it is enabled here is UNESTABLISHED, because the maintainer token available for the readback is not scoped for it. If that path proves unavailable, this decision's chosen option needs a credential after all, which is the thing it was chosen to avoid. Recorded here rather than only in the launch ledger, because it bears on whether the option that won can be built at all.

## Confirmation

1. No workflow wires a Terraform variable the module does not declare, asserted by test. The deployment module's notification subscriptions are **enumerated** rather than counted, so a subscription arriving on the operations topic without a decision behind it reds; no file grants permission to publish to it; and every Terraform file under the module, submodules included, is checked for delimiter balance, which is the specific defect a botched deletion left unnoticed on 2026-09-04. All four asserted by test. Each was mutation-proved on 2026-09-04 by breaking it and observing the red, which is a record of what was done on that date rather than a property the tree can re-establish; the delimiter counter additionally carries unit cases over synthetic sources, so its branches stay exercised without one. This criterion was recorded as owed when this decision was written and was discharged the same day.
2. No phone number appears anywhere in the repository, asserted by a scan that covers markdown as well as source.
3. The launch-readiness ledger's monitoring row records alert coverage as MISSING inside a gate classed PARTIAL, names no replacement as existing, and states that the chosen direction is unbuilt.
4. The payload allowlist tests pass unchanged, and the allowlist is not widened while the replacement is unbuilt.
5. Any pipeline carrying a health script's exit code runs under an explicit `pipefail` shell, asserted by test.
6. If a replacement lands, its carrier is inside a liveness corpus asserted by test, per the retargeted criterion 7 above. A replacement that is not covered by a liveness check has reproduced this decision's own root cause.
7. Worker observability and logpush stay disabled by readback, and are checked again if the check moves into the Worker.

## Pros and Cons of the Options

### Worker cron carrier with native provider email, no SMS

- Good, because the detector runs where the data is, under an availability commitment.
- Good, because it stores no credential and adds no provider — **if the credential-free send path exists**, which is the next bullet.
- Bad, because the credential-free send path it depends on is **unestablished**, so the ground it won on is unproven. This is the same site class this record retires from ADR-088 as item 18, a false or unproven premise credited as a virtue of the option that won, and it is written as a con here rather than left implicit so this record does not reproduce the defect it names.
- Bad, because it loses out-of-band reachability entirely.
- Bad, because it is unbuilt, and may prove unbuildable as chosen, so the gap is real for as long as either holds.

### Keep the built shape

- Good, because it exists, delivers, and was ratified.
- Bad, because the detector runs on infrastructure that is skipped silently under load.
- Bad, because it publishes a credential from CI to reach a second account.

### Worker cron carrier with third-party SMS

- Good, because it fixes the carrier and keeps the reachability that motivated layer 3.
- Bad, because it reintroduces a vendor and a stored credential, which is what the maintainer rejected.

### Agent-read only

- Good, because it is the cheapest fully compliant shape and needs nothing new.
- Bad, because it was already rejected on 2026-09-03 for letting a billing fault accrue silently between sessions, and nothing about that has changed.

## Reassessment Criteria

Reassess if the replacement is still unbuilt when the managed channel approaches activation, since shipping a paid channel with alert coverage missing is a different decision from holding the gap while it is dark. Reassess if the mail-forwarding path proves unavailable or unsuitable, because the chosen option would then require a stored credential and that was the ground it won on. Reassess if the provider gains a native handset or paging mechanism that needs no stored credential. Reassess if a fault reaches a customer before it reaches the maintainer. Reassess if the loss of out-of-band reachability proves material in practice.

## Related

- [ADR-088 Managed-channel faults act in flow, with notification as an adjunct](088-managed-channel-faults-act-in-flow-and-notify-as-an-adjunct.proposed.md) — the decision this supersedes in part; layers 1 and 2's substance stand.
- [ADR-051 A check with no reader but the maintainer is not a control](051-a-check-with-no-reader-but-the-maintainer-is-not-a-control.proposed.md) — the rule that makes "alert coverage is missing" the honest reading.
- [ADR-052 The stale-schedule terminus is an agent at session start](052-the-stale-schedule-terminus-is-an-agent-at-session-start.proposed.md) — untouched, and the liveness shape any replacement's carrier would have to be brought inside, per confirmation criterion 6, which states that obligation conditionally because this record does not assure a replacement will exist.
- [ADR-049 Amendment scoped by whether a human would ratify it](049-amendment-scoped-by-whether-a-human-would-ratify-it.proposed.md) — why this is a new record rather than an edit to ADR-088.
- [JTBD-403 Know the paid channel still bills correctly](../jtbd/addressr-maintainer/JTBD-403-know-the-paid-channel-still-bills-correctly.proposed.md) — the job the withdrawn layer served, and the one any replacement must serve.
