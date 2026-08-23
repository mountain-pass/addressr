# Problem 100: Production recovery floor has never been measured

**Status**: Open
**Reported**: 2026-08-18
**Priority**: 9 (Medium) — Impact: 3 × Likelihood: 3 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture per Step 4a
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Nobody has timed the only sanctioned route from "we know the fix" to "production is serving it": changeset → release PR → merge → apply → stabilise → smoke. There is no number for it anywhere in the repo.

Until 2026-08-18 that was tolerable, because a manual fallback was assumed to exist. The user has now decided that manual, out-of-band production mutation is **not sanctioned** — `docs/BREAK_GLASS_RUNBOOK.md` contains no mutation steps, and `docs/RED_TRUNK_PLAYBOOK.md`'s break-glass line was repointed accordingly. Recovery is the pipeline, always. **So the pipeline's latency IS the incident duration floor, and it is unknown.**

### Why the number people will reach for is the wrong one

ADR-029's Confirmation carries a **6m36s** figure and it is easy to mistake for this. It is not this. It measures the **apply leg only** — `terraform apply` + EB env-var propagation + ASG rolling replace — and it was measured from a `push` on the `deploy/**` axis that was retired at `dd9c950b`. The user decided on 2026-08-18 that ADR-029's criterion measures from **apply-start**, so that discharge stands; the changeset-and-release-PR latency now sitting _in front of_ the apply is explicitly out of scope for it.

Both `docs/BREAK_GLASS_RUNBOOK.md` and ADR-029's trigger-provenance note say "do not infer the floor from 6m36s" and point here. This ticket is where the real number lands.

## Symptoms

1. An operator in an incident cannot answer "how long until this is fixed?" with anything but a guess.
2. There is no basis for judging whether refusing a manual path is affordable. That refusal was taken on principle — drift, uncountable exceptional-use, and the ADR-024 silent-strip trap — rather than against a measured cost. Honest, but not durable.
3. ADR-029's 10-minute rollback criterion is discharged for the apply leg while the end-to-end an operator actually experiences is unmeasured, so a reader can believe recovery is bounded at 10 minutes when only part of it is.

## Workaround

None. The gap is the absence of a measurement, so there is nothing to route around — an operator estimates from feel and is right or wrong by luck.

## Impact Assessment

- **Who is affected**: the operator during an incident (addressr-maintainer), and anyone deciding whether the no-manual-path posture is sustainable.
- **Frequency**: manifests on every production incident. Incidents are infrequent, but the gap bites with certainty when one occurs.
- **Severity**: Moderate. It does not cause an outage; it degrades the response to one — extending it through hesitation, or prompting a premature escalation to a path that is now prohibited.
- **Analytics**: none available. The number does not exist, which is the ticket.

## Root Cause Analysis

The measurement that exists was taken for a different purpose. The 2026-08-02 rollback drill was designed to discharge ADR-029's blue/green rollback criterion, so it measured the mechanism ADR-029 cared about — the apply. Nothing in front of the apply was in scope, because at the time a push _was_ the trigger and there was nothing in front of it.

ADR-045 then inserted the changesets round trip ahead of the apply and retired the push axis. No measurement followed the change, because the criterion it would have served had already been discharged.

### Investigation Tasks

- [ ] Time the full path on a non-impacting change, recording wall-clock at each boundary: push accepted; deploy-guard CI green; release PR opened or force-updated by changesets; merge; release run start; apply start; EB Ready and Green; smoke pass.
- [ ] Time it **both ways** for the changesets leg — with a release PR already open, and with none open. `changesets/action` opens or force-pushes the release PR on each push to master, so the wait is not one fixed cost. **The worse case is the floor.**
- [ ] Verify recovery behaviourally, with a query that has never been requested. Not `/health`, and not document counts — ADR-029 records both as too weak to detect a ranking regression.
- [ ] Record the total and the per-leg breakdown in `docs/BREAK_GLASS_RUNBOOK.md`, whose closing section currently states the number is unknown and points here.
- [ ] Re-examine the no-manual-path decision against the measured number. If the floor is materially worse than expected, that is evidence for reopening the break-glass boundary, not a reason to quietly reintroduce one.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none) — measurable today; it needs one deliberate release cycle, not new machinery.
- **Composes with**: P039 (decouple SaaS deployment from npm publish) — the publish/deploy coupling is part of what the changesets leg costs.

## Related

- **ADR-045** (changesets-armed release-PR merge as the production deploy entry point) — made the pipeline the only route, and inserted the leg nobody has timed.
- **ADR-029** (OpenSearch blue/green two-phase upgrade) — carries the 6m36s apply-leg figure and the 2026-08-18 trigger-provenance note that scopes it to apply-start.
- **P039** (`docs/problems/closed/039-decouple-saas-deployment-from-npm-publish.md`) — the known error on publish/deploy coupling.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer` — its "Infra-boundary release steps are checkable artefacts, not memory" outcome is exactly what an unmeasured floor fails.
- `docs/BREAK_GLASS_RUNBOOK.md` — states the gap and points here; the destination for the measured number.

Captured via `/wr-itil:capture-problem` while writing the break-glass runbook, after the user refused a manual recovery path. Hang-off check: no candidate ticket shares this scope — P039 is the nearest by signal (both cite ADR-045 and the deploy path) but owns the publish/deploy _coupling_, not the latency of the resulting route, so this proceeds as a new ticket rather than an expansion of it.
