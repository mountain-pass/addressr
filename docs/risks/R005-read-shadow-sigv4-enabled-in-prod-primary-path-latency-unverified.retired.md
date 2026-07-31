# Risk R005: Read Shadow Sigv4 Enabled In Prod Primary Path Latency Unverified

**Status**: Retired (2026-07-31 — subject condition no longer holds)
**Category**: operational (ISO 31000) — consumer-facing latency on the search primary path
**Identified**: 2026-07-18
**Owner**: Tom Howard
**Last reviewed**: 2026-07-31
**Next review**: N/A — retired
**Curation**: curated at retirement 2026-07-31

## Description

Enabling SigV4/IAM read-shadow against v2 (addressr4) places a new signed mirror-dispatch on the live search primary path while the ≤1ms p95 invariant is unverified (k6 deferred to Stage 4) — a standing risk across the migration window until SigV4-on perf is behaviourally verified.

> Auto-scaffolded by the Phase 2b drain (ADR-056) from a `wr-risk-scorer:pipeline`
> RISK_REGISTER_HINT bullet. The description is the agent's prefill; scoring
> fields below carry the ADR-026 ungrounded-output sentinel until human curation.

**Retirement basis.** This file was never scored — every field carried the
ungrounded-output sentinel — so it could not be closed by residual-score
reduction. It is retired on the honest ground that its **operative clause no
longer holds**: "the ≤1ms p95 invariant is unverified (k6 deferred to Stage 4)".
It is now verified. The fields below were filled in **before** retirement rather
than after, because retiring an uncurated file records nothing.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 4 (Significant) — new synchronous work on the consumer-facing `/addresses` path of a revenue-generating API. Matches the RISK-POLICY level-4 descriptor: search or API responses degraded for end users. Degradation, not outage, so 4 rather than 5.
- **Likelihood**: 3 (Possible) — the analytical band (0.6–1.5 ms, summing ADR-031's 0.5–1.0 ms dispatch and ADR-033's 0.1–0.5 ms signing) exceeded the ≤1 ms invariant at its top end, and neither figure had been measured
- **Inherent Score**: 12
- **Inherent Band**: High

## Controls

**Read the likelihood drop below as uncertainty resolution, not a world change.**
Nothing about the system changed on 2026-07-31; what changed is what is known
about it. The inherent estimate was uncertainty-inflated — which is precisely
why this risk's operative clause was _unverified_ rather than _too slow_ — and
measuring it resolved the uncertainty downward. No mitigating control shipped,
and none was needed.

- **The measurement (2026-07-31)** — this is what retires the risk. Total measured synchronous delta **≤ ~0.1 ms p95**, roughly 10× under the ≤1 ms invariant.
  - _Mirror dispatch_: controlled shadow-off vs shadow-on A/B on the production engine version (OpenSearch 3.5.0), mirroring to a **separate** OpenSearch instance so the shadow could not warm the primary's own cache. 3,000 requests per replicate, fixed query set reused byte-identically across arms, three replicates each way. p95 delta **+0.09 ms**; mean delta **+0.05 ms**; shadow-ON was faster in two of three position-matched replicate pairs. Mirroring verified, not assumed: `attempts=9801, successes=9801, failures=0`.
  - _SigV4 signing_: 20,000 signatures of a representative address-search body, **0.010 ms each** against the estimated 0.1–0.5 ms.
  - _Composition_: exhaustive rather than assumed — under SigV4 the synchronous path is base-Connection dispatch plus signing plus a sub-microsecond credential-expiry check, verified against the client's `lib/aws/shared.js`.
- **Failure isolation** (pre-existing, ADR-031): `SUPPORTED_METHODS` is a two-member Set that throws synchronously on anything else; the mirror promise is detached via `.catch(swallowError)`; the success callback is try-wrapped; the abort timer is `unref`'d. Note this control is consequence-reducing for a _different_ harm — a shadow-target failure propagating into the primary response — and does **not** bound the latency harm this risk names. Had the dispatch cost 5 ms, the detached `.catch` would not have helped. Recorded so the residual Impact is not misread as controlled down.
- **Capacity headroom** (measured 2026-07-31): production EB runs `t2.nano` at 0.36–0.45% CPU with `CPUCreditBalance` pinned at the 144 maximum and zero surplus draw — about a tenth of the 5% baseline allowance.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — unchanged. Impact is a property of the path, not of the measurement, and no consequence-reducing control applies to the latency harm.
- **Likelihood**: 1 (Rare) — measured at ~10× under the gate, with both residual caveats pushing conservative
- **Residual Score**: 4
- **Residual Band**: Low
- **Within appetite?**: Yes — 4 is within the appetite threshold of 5 (inclusive)

Residual caveats, both conservative in direction: the dispatch leg ran with
basic auth against a local target, excluding real network RTT — but that cost is
asynchronous, landing on the event loop after the detached promise rather than
on the synchronous primary-request path the invariant governs. And arms were
blocked rather than interleaved, which controls drift less well; adequate at a
10× margin, not at a tight one.

Neither caveat warrants a successor risk. If the invariant is ever tightened
below ~0.5 ms, the escalation is in-app `hrtime` instrumentation around the
primary handler, which would measure under real traffic, real SigV4 and real
RTT.

## Treatment

**Accept.** Measured residual is within appetite with an order of magnitude of
headroom. No further treatment; the invariant remains a live gate — if a future
measurement shows a >1 ms primary p95 increase, ADR-031 gates read-shadow off
until investigated.

## Monitoring

- **Trigger to re-assess**: a measured primary-path p95 increase > 1 ms with shadow on, or any tightening of the ADR-031 invariant below ~0.5 ms
- **Metrics**: `test/perf/read-shadow-invariant-ab.mjs` re-run at the next search-backend migration

## Related

- Criteria: `RISK-POLICY.md`
- Personas affected: `self-hosted-operator` (JTBD-201), `web-app-developer` (JTBD-001)
- Realised-as: never realised — retired on verification, not on incident
- Treatment ADRs: `docs/decisions/031-read-shadow-for-search-backend-migrations.proposed.md` (§ Primary-path invariant, § Quantification), `docs/decisions/033-opensearch-iam-sigv4-auth.proposed.md` (Confirmation item 5)
- Harness: `test/perf/read-shadow-invariant-ab.mjs`, `test/perf/sigv4-signing-bench.mjs`, `test/perf/README.md`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-08T03:41:25Z: fired in `.risk-reports/2026-07-08T03-41-25-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-18: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
- 2026-07-31: Curated and **retired**. The ≤1 ms primary-path invariant was measured and discharged at ≤ ~0.1 ms p95 (mirror dispatch +0.09 ms, SigV4 signing 0.010 ms), roughly 10× under the gate, so the risk's operative clause — that the invariant is unverified — no longer holds. Scoring fields were filled in before retirement rather than left as sentinels; this is the first curated risk in the register, so its vocabulary follows `docs/risks/TEMPLATE.md` deliberately. Recorded during the ADR-041 blue/green read-shadow soak.
