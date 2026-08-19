# Problem 110: Latency is measured at the gateway and alerts nowhere that qualifies

**Status**: Open
**Reported**: 2026-08-20
**Priority**: 9 (Medium) — Impact: 3 × Likelihood: 3. Impact 3: a sustained latency regression on the search path degrades every consumer of a revenue-generating API, and the job it breaches is the product's headline promise — but it degrades rather than breaks, and the signal to detect it already exists, so this is not the 4-or-5 shape. Likelihood 3: unknown-and-plausible rather than observed. No latency incident is on record; equally, nothing would have surfaced one except a consumer complaining.
**Origin**: internal
**Effort**: S — the measurement exists and the alerting surface exists. What is missing is a configured alert and a qualifying terminus, not an instrument.
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

**The API gateway already measures end-to-end latency continuously, across every consumer and every region.
Nothing is known to act on it.**

This was found by correcting a mistake rather than by looking. On 2026-08-20 the nightly perf-regression
probe was deleted (ADR-051, P032). While recording that, the claim was written that there is _"no automated
latency control anywhere — not in CI, and not in production"_, derived from `apps/addressr-deployment/main.tf`:
its only two `aws_cloudwatch_metric_alarm` resources watch `SearchableDocuments`, and `SearchLatency` p95
appears solely as a dashboard widget in `locals.search_parity_widgets`.

That reasoning was sound about AWS and wrong about the system. **The maintainer supplied the missing half:
the marketplace gateway in front of this service reports latency, error rate and call volume continuously,
and carries its own alerting surface.** It is a strictly better measurement than the deleted probe ever
produced — real clients, real traffic, real geography, rather than a seeded fixture on a rented CI runner —
and it existed throughout the four months P032 spent trying to build a worse one.

**So the gap is not measurement. It is the terminus.** Under ADR-051 a check qualifies only if it ACTS or if
its reader is an AGENT. Three things are unknown and must be settled by looking rather than inferred:

1. Whether any latency alert is configured on that gateway at all.
2. If one is, where it lands — an alert routed to the maintainer's inbox does not qualify under ADR-051 and
   would reproduce exactly the defect that deleted the perf probe.
3. Whether the threshold, if one exists, is set anywhere near the job's promise rather than at a value that
   only fires on an outage.

**Recorded because it is the ticket's own lesson**: this repo is one component behind a marketplace gateway
and a CDN. Twice in one session an absence was asserted from the absence of a file. A capability search that
reads only the repository will keep finding gaps that are not there and missing controls that are.

## Symptoms

1. A sustained latency regression on `/addresses` has no known path to anyone's attention except a consumer
   noticing slow autocomplete and complaining.
2. The measurement that would show it is already being collected and is, as far as is known, read only when
   someone chooses to open a dashboard — which ADR-051 disqualifies as monitoring.
3. The gap was invisible from inside the repo, and the repo-derived answer was wrong in both directions
   within one session.

## Impact Assessment

- **Who is affected**: every consumer of the search endpoint, and the maintainer, who would learn about a
  regression from a customer rather than from a system.
- **Frequency**: continuous exposure; no observed instance.
- **Severity**: Moderate. The service degrades rather than fails, and the promise it breaches is the one the
  product is sold on.

## Root Cause Analysis

Measurement and alerting were treated as one capability. The gateway supplies the first and the second was
never configured — or was configured and never verified, which is indistinguishable from here.

A contributing cause worth separating: **the repo was treated as the system.** Every capability audit on this
question — P032's four months, P101's channel analysis, and the two corrections on 2026-08-20 — reasoned from
files in this repository. The gateway is not in this repository, so its capabilities were invisible to all of
them, and its absence from the files was read as absence from the world.

### Investigation Tasks

- [ ] **Look at the gateway's alerting configuration and record what is actually there.** Not inferred from
      this repo. This is the whole ticket and everything below depends on it.
- [ ] Decide the terminus, constrained by ADR-051: it must ACT or be AGENT-read. An alert into the
      maintainer's inbox is explicitly disqualified — that is the shape ADR-051 was written to retire.
- [ ] Decide the threshold against JTBD-001's stated outcome rather than against an outage floor. Record the
      basis, because a threshold set where it never fires is the anti-vacuity failure this backlog keeps
      finding in other instruments.
- [ ] Consider whether the same reasoning applies to error rate, which the gateway also reports and which is
      likewise unalarmed as far as is known.
- [ ] **NO GATEWAY FIGURES IN THIS REPOSITORY.** It is public. Traffic volumes, consumer counts and revenue
      are confidential, and R004 names traffic counts in public prose as a live risk. Record the shape of
      what is measured and the decisions taken; never the values.

## Dependencies

- **Blocks**: nothing.
- **Blocked by**: nothing — task 1 needs only a look at a console.
- **Composes with**: P032, which is the CI half of the same question and is now closed by deletion rather
  than by fix.

## Related

- **[ADR-051](../../decisions/051-a-check-with-no-reader-but-the-maintainer-is-not-a-control.proposed.md)** —
  the rule that makes this a real gap rather than a preference. A check qualifies only if it acts or is
  agent-read; measurement without a qualifying terminus is not a control. Note ADR-051 is `proposed` and its
  generalisation is not yet ratified, so this ticket's framing moves if that rule does.
- **[P032](../known-error/032-no-ci-perf-regression-detection.md)** — the CI-side attempt at this, deleted
  2026-08-20. Its retirement note carries the fuller account of what the probe did and did not measure.
- **[P101](101-scheduled-workflow-loud-failure-has-no-reader.md)** — the same terminus problem for scheduled
  workflow failures. Sibling, not duplicate: that one is about CI signals, this is about production latency,
  and neither fixes the other.
- **JTBD-001** (Search and Autocomplete), persona `web-app-developer` — its "results within 200 ms" outcome
  is the promise this gap leaves unwatched. Anchored to the consumer-facing job rather than to the
  maintainer's, because the harm lands on the developer integrating the API.
