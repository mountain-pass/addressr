---
status: 'proposed'
date: 2026-09-19
human-oversight: confirmed
oversight-date: 2026-09-19
decision-makers: [Tom Howard]
consulted: []
informed: []
supersedes-clause: 093#two-releases-corollary
reassessment-date: 2026-12-19
---

# The pipeline picks the migration order and validates between steps

## Context and Problem Statement

`deploy.sh` deploys the Worker via Terraform and then applies D1 migrations, always in
that order. ADR-093 recorded that order and drew a corollary from it: a change needing both
a schema change and Worker code that depends on it takes TWO releases.

That corollary is a cost, and on 2026-09-19 the maintainer declined to pay it. Asked
whether the pipeline should REFUSE a release that couples a migration with a Worker change,
they answered: **"Unless the pipeline can be made smart enough to do one, validate, then the
other and validate."**

It can. The refusal was the wrong instrument, and this record is what replaces it.

## Why a FIXED order cannot be right, which is the thing ADR-093 half-saw

ADR-093 chose Worker-first on measured evidence and recorded that migration-first would
have been wrong for migration 0003: applying it before the Worker would have put the
unenforcing combination live, because 0003 moved the quota charge from reserve to settle by
replacing triggers the running Worker's behaviour depended on.

That evidence is sound and it proves less than a fixed order needs. It proves migration-first
is wrong for a BEHAVIOUR-CHANGING migration. It says nothing about an ADDITIVE one, and for
an additive migration the two orders are not symmetric at all:

- **Worker first, the current order.** The new Worker meets the OLD schema. Safe unless the
  Worker depends on the new column, which is exactly the coupled case, which is exactly what
  the corollary forbids.
- **Migration first.** The old Worker meets the NEW schema. For an additive migration the
  old Worker cannot see the addition: it names its columns explicitly, does no `SELECT *` on
  the affected tables and does no positional INSERT, all verified for migration 0004 on
  2026-09-18. So the intermediate state is sound, and the coupled release becomes ONE
  release.

So the safe order is a function of the migration, and reading which one it is decides it.

## The recovery asymmetry, which decides what to do when validation fails

A Worker rolls back: the provider retains prior versions and redeploying one is a normal
operation. **A migration generally does not roll back** — it is forward-only, and this
repository has no down-migrations.

That asymmetry is the reason validation between the steps is worth its cost rather than
being ceremony. It says the step you can undo is the step to take into uncertainty, and it
says what to do when the middle check fails:

- Worker deployed, validation fails, migration not yet applied: redeploy the previous Worker.
  Fully recoverable.
- Migration applied, validation fails, Worker not yet deployed: the only route is FORWARD,
  and the forward step is the Worker deploy that was next anyway. Recoverable in practice,
  but only because the remaining step is the fix.

Migration-first is therefore taken ONLY where the intermediate state is reasoned to be
sound by construction, which is what "additive" means, and never as a general default.

## What has and has not been reviewed

`consulted` is EMPTY deliberately. `wr-architect:agent` reviewed the REFUSAL design that this
record rejects, and returned ISSUES FOUND including the finding quoted under option 2 below.
It has NOT reviewed this record or the option chosen here. Listing it as consulted would have
been true of the work and false of the record, which is the reading a later reviewer would
take. The chosen direction carries the maintainer's ratification, not an architect's review,
and the implementing change is separately gated.

## Decision Drivers

- The maintainer declined the two-release cost and named the alternative.
- Neither fixed order is safe for every migration, and the existing record commits to one.
- Whether a migration is additive is decidable by reading it, and ADR-093's confirmation
  criterion 3 already asks for exactly that reader.
- A guard that refuses correct work gets bypassed, and a bypassed guard is worse than none.
- Nothing may be hand-maintained: the migration framework already records what is applied.

## Considered Options

1. **Read the migration, pick the order, validate after each step. Chosen.**
2. **Refuse the coupled release at push time.** Proposed by me and rejected by the
   maintainer. It also refuses releases ADR-093 PERMITS — an additive migration alongside an
   UNRELATED Worker change is one legitimate release, and a path-based check cannot tell
   that from a dependent one. A guard that reds correct work is the shape this repository
   already records as falsifying its own rule.
3. **Keep the fixed order and the two-release corollary.** The status quo. Honest, and it
   costs a release of latency every time schema and code move together, which ADR-092's
   implementation is currently paying.
4. **Make the Worker tolerate both schemas so order stops mattering.** Rejected: it pushes a
   deployment concern into request-path code and leaves dead compatibility branches nobody
   removes.

## Decision Outcome

Chosen: **option 1.** The release pipeline decides the order per release by reading the
pending migrations, and validates after each step rather than only at the end.

- **Every pending migration is additive** → apply migrations, validate, deploy the Worker,
  validate. A coupled change ships in ONE release.
- **Any pending migration is not additive** → deploy the Worker, validate, apply migrations,
  validate. The Worker must not depend on those migrations, and that remains the author's
  obligation rather than something the pipeline can check.
- **Nothing pending** → no ordering question exists. This is the ordinary case.

Which migrations are pending is asked of the migration framework, never recorded in this
repository. `wrangler d1 migrations list` reports the unapplied set, and an earlier draft of
this work proposed a hand-maintained marker file for the same fact. **The maintainer
rejected it on the ground that a migration framework already does exactly this**, which was
correct and is recorded because the marker is the obvious wrong turn and the next reader
will reach for it.

## What replaces the superseded corollary

ADR-093's two-release corollary is superseded for the ADDITIVE case and STANDS for the
non-additive one. The obligation it expressed does not disappear; it becomes conditional on
a property the pipeline now reads rather than on a rule the author remembers.

## Consequences

- Good: the coupled change that ADR-092's implementation is currently splitting across two
  releases becomes one, once this ships.
- Good: the destructive-statement reader ADR-093 criterion 3 asks for stops being a chore
  with no consumer. It becomes the input that picks the order, so it has a reader that acts,
  which is what ADR-051 requires of a check.
- Good: nothing about production state is asserted in this repository.
- Bad: `deploy.sh` gains a branch, and the release path is the worst place in this project
  to add one. The branch must be exercised by test in both directions, because a branch that
  exists is not a branch that is reached.
- Bad: the additive classifier becomes load-bearing for correctness rather than advisory. A
  migration wrongly classified additive gets applied first, and the old Worker meets a schema
  it was not built for. That is the forward-only, least recoverable state in this record.
  Its false-positive direction is the dangerous one, so it must refuse what it cannot
  classify rather than defaulting to additive.
- Bad: validation between steps lengthens every deployment by the smoke-check interval, on
  every release including the ordinary nothing-pending one, unless it is skipped there.
- Neutral: the per-request path is untouched.

## Confirmation

1. `deploy.sh` applies migrations BEFORE deploying the Worker when every pending migration
   is additive, and AFTER when any is not. Proved the way ADR-093 criterion 1 was: by RUNNING
   the script against shadowed binaries and reading the order off the recorded call list, not
   by scanning the source, because a text scan cannot tell a branch that exists from one that
   is reached. Both directions proved, and mutation-proved by inverting each.
2. The additive classifier REFUSES what it cannot classify. Proved by a migration containing
   a statement outside its vocabulary, which must not be treated as additive.
3. A failed validation after the first step stops the release rather than proceeding to the
   second. Proved by a stubbed failing validation in each order.
4. The pending set comes from the migration framework and from nowhere else. Proved by
   asserting no committed file records which migrations are applied.
5. NOT CONFIRMABLE HERE and stated rather than implied: that the old Worker tolerates an
   additive migration is reasoned from the Worker naming its columns explicitly, with no
   `SELECT *` and no positional INSERT on the affected tables. That was verified by reading
   for migration 0004 on 2026-09-18. It is a property of the code as it stands, not an
   invariant anything enforces, and it is the premise migration-first rests on.

## THIS DECISION IS NOT YET IMPLEMENTED

`deploy.sh` is unchanged and still deploys the Worker before applying migrations, always.
Recorded before the code so the intent is not lost, and stated plainly so nobody reads this
as a description of the pipeline.

Deliberately not implemented yet, for a sequencing reason rather than an effort one: a
release pull request is open that applies migration 0004 to production, and changing the
release path while a release is in flight puts an unexercised branch under the one apply
that matters. The order is: land that release, then change the pipeline.

## Reassessment Criteria

Reassess if down-migrations are introduced, which would remove the recovery asymmetry this
record turns on; if the additive classifier proves unable to classify the migrations this
project actually writes, which would make the branch dead weight; or if validation between
steps proves to cost more deployment time than the saved release latency is worth.

## Related

- ADR-093 — the fixed order and the two-release corollary, one clause of which is superseded
  above. Its measured evidence for migration 0003 is what proves a fixed order cannot be
  right in general, so this record is built on it rather than against it.
- ADR-092 — the first change to pay the two-release cost, and the reason the cost was
  noticed.
- ADR-095 and ADR-096 — the exclusion this sequencing is currently being used to ship.
- ADR-051 — a check whose only reader is the maintainer is not a control, which is what the
  additive classifier would have been without this record giving it a consumer.
- JTBD-400 (Ship releases reliably from trunk) — the job this serves.
