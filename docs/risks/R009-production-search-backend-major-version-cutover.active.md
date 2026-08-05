# Risk R009: A new search backend takes full primary load for the first time at cutover

**Status**: Active
**Category**: operational (ISO 31000) — search-backend capacity at cutover
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05
**Curation**: human-curated 2026-08-05 (superseding the auto-scaffolded pending-review state of 2026-07-18)

## Description

Flipping the sole production search backend to a new major OpenSearch/Lucene version carries an irreducible Medium (8/25) residual — full-primary-concurrency is un-exercised by any pre-release control; recurs every engine cutover (v1→v2, v2→v3).

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## What "un-exercised at full primary concurrency" actually means

The ADR-031 read-shadow soak mirrors production queries at the incoming domain before any user depends on it — 33.8 hours at the most recent cutover, all five Soak Gate criteria passed. That is a real and substantial control, and it is the reason this entry is not scored at its inherent value.

But a mirror is not a primary. Under the shadow the incoming domain serves a **copy** of the query stream on a fire-and-forget path: nothing waits on its response, nothing retries, and a slow or failed mirror call is invisible to the consumer. At the flip, the same domain begins serving the **real** stream, where every request has someone waiting on it and errors reach users. The domain has never been the thing under load with consequences attached.

**P083's triage was wrong to call this dischargeable.** It reasoned that the 2.19→3.5 major cutover completed on 2026-07-14, so the risk had passed. The entry's own description says "recurs every engine cutover (v1→v2, v2→v3)" — a standing risk is not discharged by one instance of it not firing. That was the third of five wrong triage calls on this ticket.

## Base rate — three cutovers, three successes, and a caveat about what that proves

Three production search-backend cutovers have completed: v1→v2 (`addressr3`→`addressr4`), v2→v3 (→`addressr5`), and v3→v4 (→`addressr6`, the ADR-041 cutover on 2026-08-02). None produced a capacity or concurrency failure at the flip.

Three-for-three is genuine evidence and it is also a small sample against a Severe impact, so it lowers likelihood rather than eliminating it. Worth being precise about what it does _not_ prove: none of the three cutovers moved to a materially smaller instance class, and none coincided with a traffic peak. The sample tests the procedure under ordinary conditions, not the hazard under adverse ones.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 5 (Severe) — the flip points the sole production search backend at a domain that has never served real load. If it cannot take the concurrency, every search request fails and the revenue endpoint is down. `RISK-POLICY.md` puts loss of the serving system at 5. Recovery is the ADR-029 flip back, which is fast when the standby still exists — see R010 for the window in which it does not.
- **Likelihood**: 3 (Possible) — a new engine major changes memory profile, thread-pool behaviour and query-execution defaults. Sizing carried across from the previous version is an assumption until the flip tests it.
- **Inherent Score**: 15
- **Inherent Band**: High

## Controls

- **The ADR-031 read-shadow soak — EVIDENCED, and the load-bearing one.** Real production query _distribution_ against the incoming domain for 33.8 hours before the flip, with a Soak Gate that must pass on all five criteria. It exercises cold caches, the real query mix, doc parity and auth, and it would surface a domain that is grossly under-sized or misconfigured. Its limit is stated above: mirrored traffic, not primary.
- **Exercised and timed rollback — EVIDENCED, 2026-08-02.** The flip back was measured at 6m36s push-to-EB-updated, discharging ADR-029's long-open 10-minute criterion. This does not prevent a concurrency failure; it bounds how long one lasts, which is why it reduces impact rather than likelihood.
- **Three successful cutovers — EVIDENCED, with the caveat above.** Credited for a likelihood reduction, not eliminated by it.
- **NOT a control: the k6 perf harness.** Measured on 2026-08-04 at a **3× within-version p95 spread** on a quiet machine, so it cannot resolve anything below roughly 2× at 5 VUs over 60 seconds — see P032. It would catch a catastrophic capacity failure and nothing subtler, and it does not run against a pre-cutover domain at all.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — reduced from 5 by the exercised rollback. A concurrency failure at the flip is now a bounded outage with a measured 6m36s recovery, rather than an open-ended one. **This reduction is conditional on the standby still existing**, which R010 prices and which the retention gate governs; past the decommission point the recovery is a rebuild from G-NAF and impact returns to 5.
- **Likelihood**: 2 (Unlikely) — the soak exercises the real query distribution and three cutovers have passed. What it does not exercise is consequence: the mirror path has no waiting consumer.
- **Residual Score**: 8
- **Residual Band**: Medium
- **Within appetite?**: **No.** Appetite is 5, inclusive.

## Treatment

**Mitigate.** The soak is the right control and it is doing most of the work; the gap is narrow and specific.

Named treatment: **a brief primary-load step in the cutover sequence** — flip, hold, and verify at real concurrency before the old domain becomes ineligible for rollback. The retention gate from P079 already provides the window (the primary must serve 0.25× its average daily volume before the standby can go), so the mechanism exists; what is missing is an explicit _check_ at that point rather than an elapsed-volume count. In effect: use the retention window as the concurrency test it already is, and say so.

Deliberately NOT proposed: a synthetic load test against the incoming domain pre-flip. The k6 noise floor above means it could not resolve the difference that matters, and a synthetic profile is a weaker signal than the real stream the retention window already delivers.

## Monitoring

- **Trigger to re-assess**: a search-backend cutover is proposed, or a cutover that moves to a different instance class or coincides with a traffic peak — both are outside what the three-cutover base rate tests. Deliberately NOT "a new pipeline hint with this risk_slug", which fires on scorer activity (P083).
- **Metrics**: cutover count and outcome. Three, all successful, as of 2026-08-05.

## Related

- Criteria: `RISK-POLICY.md`
- Treatment ADRs: **ADR-031** (read-shadow soak) is the primary control; **ADR-029** (two-phase blue/green) is the rollback that bounds impact; **ADR-035** chose the warm-standby posture that makes that rollback available.
- Siblings, deliberately NOT consolidated (see P083): **R008** — the same cutover event but the _relevance_ gap rather than the _concurrency_ one; **R010** — prices the standby window this entry's impact reduction depends on.
- Related tickets: **P079** — the retention gate whose window is the named treatment vehicle; **P032** — the k6 harness whose measured 3× noise floor is why a synthetic pre-flight is not proposed.
- Personas affected: `docs/jtbd/web-app-developer/`, `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-13T21:27:29Z: fired in `.risk-reports/2026-07-13T21-27-29-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-18: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-05: Curated. Scored 15 inherent / **8 residual, above appetite**, Treatment **Mitigate**. Also **corrected P083's own triage**, which had listed this entry as retirable on the grounds that the 2.19→3.5 cutover completed on 2026-07-14 — but the description says "recurs every engine cutover" in as many words, and a standing risk is not discharged by one instance of it not firing. Impact reduced 5 → 4 by the exercised-and-timed rollback (6m36s, 2026-08-02), with the reduction explicitly **conditional on the standby still existing** per R010. The k6 harness is named as NOT a control, on its measured 3× noise floor from P032. Curated as part of the P083 register drain.
- 2026-08-05: Cross-reference to R008 re-verified after R008 moved in the same sitting. The Siblings clause distinguishes the two as the same cutover event seen through the relevance gap versus the concurrency gap; R008's edit was a Change Log verification bullet and does not touch that distinction. Recorded per the review-fence check — this is its second-order closure, since remediating the first-order referrers made R008 a target in turn.
