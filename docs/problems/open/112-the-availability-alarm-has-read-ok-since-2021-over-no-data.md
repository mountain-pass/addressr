# Problem 112: The availability alarm has read OK since 2021, over no data at all

**Status**: Open
**Reported**: 2026-08-20
**Priority**: 12 (High) — Impact: 4 × Likelihood: 3. Impact 4: the subject is production availability of a revenue-generating API, and the failure direction is a monitor that reports health while measuring nothing — the worst direction for a monitor. Likelihood 3: the false-OK is REALISED and has been for five years; the 3 rates the chance of an availability incident during a window where this is the control someone believes in.
**Origin**: internal
**Effort**: S — the decision is delete-or-revive; either is small. Establishing which is the work.
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

**`Synthetics-Alarm-addressr-1` has been in `OK` since 2021-06-30 because it receives no data and is
configured to read no-data as healthy. The canary it watches is `STOPPED`. The alarm has no actions, so even
if it fired it would notify nothing.**

Every part of that is quoted from AWS rather than inferred, read 2026-08-20:

- `aws synthetics describe-canaries` — canary `addressr`: `State: STOPPED`, `RuntimeVersion:
syn-nodejs-puppeteer-3.1`, `LastModified: 2021-06-30`.
- `aws synthetics get-canary-runs --name addressr` returns `[]`. It has no run history.
- `get-metric-statistics` for `CloudWatchSynthetics/Failed`, canary `addressr`, over the last 7 days:
  **0 datapoints**.
- The alarm's own `StateReason`, verbatim: _"Threshold Crossed: no datapoints were received for 1 period and 1
  missing datapoint was treated as [NonBreaching]."_
- `TreatMissingData: notBreaching`, `AlarmActions: []`, `ActionsEnabled: true`,
  `StateUpdatedTimestamp: 2021-06-30`.

So the instrument fails in three independent ways at once, and any one of them alone would be enough:

1. **It measures nothing** — the canary is stopped.
2. **It reads absence as health** — `notBreaching` converts "no signal" into "all good", which is this
   backlog's defining failure class arriving in production on availability.
3. **It alerts nowhere** — no actions at all. `apps/addressr-deployment/vars.tf:110-115` records that exactly
   this was fixed for the `SearchableDocuments` alarms, on the grounds that _"the alarms changed state in the
   console and reached nobody, which meant 'armed' did not mean what ADR 035 and the playbook assumed it
   meant."_ The same defect survives here, unfixed, because nothing enumerated the alarms.

**It is not in Terraform.** `apps/addressr-deployment/*.tf` contains no `synthetics` or `canary` resource. It
is console-created and unmanaged, which is why five years of drift produced no diff and no review.

**Found by looking rather than by reasoning, and that is the point.** It was reached by listing every
CloudWatch alarm in the account while designing a latency control. No amount of reading this repository would
have surfaced it — the same lesson P110 records, realised a second time within an hour.

## Symptoms

1. A dashboard and an alarm both report healthy availability monitoring that has not run since 2021.
2. Anyone auditing "is availability monitored?" from the AWS console sees an alarm in OK and stops.
3. The alarm cannot fire: no data, and no actions if it did.

## Impact Assessment

- **Who is affected**: every consumer of the API, and the maintainer, who has a monitor that reports success
  while measuring nothing.
- **Frequency**: continuous since 2021-06-30.
- **Severity**: High. A monitor reporting OK over no data is worse than no monitor, because it answers the
  audit question wrongly. This is the distinction ADR-051 draws between an instrument and a control, in its
  sharpest form.

## Root Cause Analysis

Three causes compound, and separating them matters because they have different fixes:

- **Unmanaged resource.** Console-created, absent from Terraform, so no plan ever showed it and no review ever
  read it. ADR-030 brought the OpenSearch domain under Terraform for this reason; the canary was never
  included.
- **`notBreaching` on a liveness signal.** For a metric that only exists when the thing is running, treating
  missing data as healthy inverts the alarm. `breaching` or `missing` would have surfaced the stop in 2021.
- **Nothing enumerates the alarms.** The fix recorded in `vars.tf` was applied to the alarms someone was
  looking at. This one was not in view, which is the same class as P103 and as the settled-rule propagation
  gap on P033 — a correction reaching the site in front of the author and no other.

### Investigation Tasks

- [ ] **Decide delete-or-revive.** A five-year-old `syn-nodejs-puppeteer-3.1` canary is not revivable as-is;
      the runtime is long deprecated. If ADR-016's Uptime Robot monitor is live and adequate, deleting this
      alarm and canary is the honest answer — an alarm that reads OK over nothing is worse than no alarm.
- [ ] **Verify ADR-016's Uptime Robot monitor is actually running**, since after this finding it is the only
      availability monitoring believed to exist, and it has never been verified either. Needs a look at that
      service, not an inference from this repo.
- [ ] Bring whatever survives under Terraform, so the next five years of drift produce a diff.
- [ ] **Set `TreatMissingData` deliberately on every alarm, and record the choice.** For a liveness signal,
      `notBreaching` is almost always wrong. Check the two `SearchableDocuments` alarms for the same setting.
- [ ] Add alarm enumeration to the agent-read session-start check, so an alarm that alerts nowhere, or one
      whose metric has no recent datapoints, is a finding in its own right rather than a green tick.

## Dependencies

- **Blocks**: nothing.
- **Blocked by**: nothing.
- **Composes with**: P110 — same root reasoning error (the repo is not the system), found the same day, one
  by looking where P110 said to look.

## Related

- **[P110](110-latency-is-measured-at-the-gateway-and-alerts-nowhere-that-qualifies.md)** — its lesson,
  realised again: a capability audit that reads only the repository finds gaps that are not there and misses
  controls that are.
- **[ADR-051](../../decisions/051-a-check-with-no-reader-but-the-maintainer-is-not-a-control.proposed.md)** —
  the instrument-versus-control distinction. This alarm is neither: it is an instrument that measures nothing,
  wired to no one.
- **ADR-016** (Uptime Robot for external availability monitoring) — the other availability monitor, and after
  this finding the only one. Its own reassessment criteria are already triggered by this work.
- **ADR-030** (OpenSearch domain under Terraform management) — the precedent for bringing an unmanaged
  production resource under Terraform, and the reasoning that applies here.
- **[P103](103-workflow-referrers-outside-guard-coverage-rot-unseen.md)** — the correction-reaches-only-the-
  site-in-view class, of which the unfixed `AlarmActions: []` here is an instance.
