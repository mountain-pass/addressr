---
status: 'proposed'
date: 2026-09-06
human-oversight: confirmed
oversight-date: 2026-09-06
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-12-06
---

# The Worker deploys before its migrations apply, so every migration owes forward compatibility

## Context and Problem Statement

`deploy.sh` runs `terraform apply`, which deploys the Cloudflare Worker, and then
`wrangler d1 migrations apply CUSTOMER_DB --remote`. So between those two steps the NEW
Worker is live against the OLD schema, on every release that carries a migration.

That ordering has been in place for every managed-channel release and is written down
nowhere. Its consequence — that a migration must be forward-compatible with the Worker
already running — has been rediscovered per migration rather than assumed. Migration 0003
had to have both directions measured from scratch on 2026-09-06 to establish that the
release was safe.

The ordering also decides where a rejected migration is first met. `PLAN_ONLY=1` exits
before both steps, so the release-PR plan comment never exercises a migration: one that
the remote applier rejects is discovered in production, with packages published and the
new Worker already live. That is what happened in run 33365620209.

## Decision Drivers

- The obligation is real today and unwritten, so it is carried by whoever last remembered
  it. That is the failure mode, not the ordering itself.
- Neither order is uniformly safer, which is what makes this a decision rather than a bug.
  Measured for migration 0003 on 2026-09-06: the current order put the SAFE combination
  live, and the reverse would have put the unenforcing one live.
- A rule nobody checks is not a control (ADR-051). Writing the invariant down is only half
  the work.

## Considered Options

1. **Keep Worker-first and record the invariant. Chosen** by the maintainer on 2026-09-06.
2. **Apply migrations first, then Terraform.** Rejected. It is tempting on the
   run-33365620209 evidence, because it surfaces a rejected migration before anything
   publishes. But it inverts the exposure, and migration 0003 is the counter-example:
   measured, migration-first would have run the new schema under the old Worker, which
   keeps accounting but stops enforcing hard limits. Strictly worse for that migration.
3. **Leave it undocumented.** Rejected as the status quo that produced the rediscovery.

## Decision Outcome

Chosen: **option 1.** The Worker deploys before its migrations apply, and the invariant
that follows is now explicit:

**Every D1 migration must be forward-compatible with the Worker revision already live.**
Additive changes — a new column, a new table, a new trigger — satisfy it. Anything an
already-running Worker would trip over does not, and must be split across releases so the
schema leads and the code that depends on it follows.

The corollary, which is the part that costs: **a change needing both a schema change and
Worker code that depends on it takes TWO releases.** ADR-092 is the first case — excluding
overshoot rows from metering needs a new column and a query predicate, and shipping them
together would break meter delivery in the window.

## Consequences

- Good: the obligation is stated once instead of rediscovered per migration, and a
  migration author has a rule to check against rather than an intuition to reconstruct.
- Good: the safer of the two orders for the shape of migration this project actually
  writes, which is additive.
- Bad: two releases for any change coupling schema and code, at roughly a day of latency
  each. Real cost, accepted.
- Bad, and unchanged by this decision: a migration the remote applier rejects is still
  first met in production, because the plan gate exits before the migration step. The
  measured semicolon-in-a-comment rule is asserted by test, which covers the one
  characterised mechanism; an uncharacterised one would still land in production.
- Neutral: no change to `deploy.sh`. This records what it already does.

## Confirmation

1. SATISFIED 2026-09-06. `deploy.sh` applies Terraform before
   `wrangler d1 migrations apply`, and `deploy-sh-plan-only.test.mjs` now pins that
   ordering by RUNNING the script against shadowed `terraform` and `npx` binaries and
   reading the order off the recorded call list, rather than scanning the source — the
   RFC-009 shape, because a text scan cannot tell a branch that exists from a branch that
   is reached. Mutation-proved: moving the migration ahead of the apply reds with the
   recorded order in the message. The assertion also refuses to pass when no migration
   call is recorded at all, so it cannot go green by exercising nothing. An earlier
   version of this criterion asserted the test in the present tense BEFORE it existed,
   while criterion 3's explicit unsatisfied label implied criteria 1 and 2 were met.
2. Scoped to migration 0003 onward, and the scope is the honest part. Every migration
   from 0003 is additive with respect to the prior Worker revision, or carries a recorded
   reason why it is not — 0003 carries one in this record's drivers and in the measured
   rollback section of the launch-readiness ledger. NOT ASSERTED for 0002, which rebuilds
   the `entitlements` table and is therefore not additive, and carries no such reason
   anywhere. It shipped and applied cleanly before this invariant was written down, so
   scoping forward is a statement of what was actually established rather than a
   retrospective blessing. Auditing 0002 against the invariant is owed if anyone wants
   the stronger claim.
3. NOT YET SATISFIED, and named rather than implied: nothing mechanically checks a new
   migration against the invariant. Criterion 2 is a property a reader must assert today.
   A check that reads the migration and refuses a destructive statement without an
   explicit acknowledgement is what would make this a control rather than a rule.

## Reassessment Criteria

Reassess if `deploy.sh` gains a way to plan the migration before the Worker moves, if the
provider offers atomic Worker-plus-schema deployment, if a migration is genuinely needed
that cannot be made forward-compatible, or if the two-release cost proves to dominate
delivery.

## Related

- ADR-092 — the first change this invariant forces into two releases.
- ADR-091 — the charge-point move whose forward and backward compatibility were measured
  on 2026-09-06; that measurement is what exposed the invariant as unrecorded.
- ADR-064 — commercial request state in D1, the store this governs.
- JTBD-400 (Ship releases reliably from trunk) — and specifically its desired outcome that
  infra-boundary release steps are checkable artefacts rather than memory. This record
  discharges the artefact half and concedes in criterion 3 that it does not discharge the
  checkable half, which is why the ledger gate stays open.
- JTBD-005 (Create and access a managed hosted API account) — which owns
  `migrations/**`. The people who owe this invariant are migration authors, and they arrive
  at that directory from JTBD-005 rather than from JTBD-400, whose screens disclaim the
  Worker directory beyond the deploy mechanism. Without this cross-reference the rule is
  invisible from the job that owns the files it constrains.
- The managed-channel launch-readiness ledger — the deploy ordering gate, which stays open
  on confirmation criterion 3.
