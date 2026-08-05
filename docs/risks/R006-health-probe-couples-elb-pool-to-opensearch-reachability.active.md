# Risk R006: The `/health` probe couples ELB pool membership to OpenSearch reachability

**Status**: Active
**Category**: operational (ISO 31000) — availability of the revenue-serving endpoint
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-04
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state of 2026-07-18)

## Description

/health now gates ELB pool membership + EB deploys on an OpenSearch ping; a sustained false-503 can pull healthy instances or degrade the revenue endpoint (the hint said residual 8/25; the curated residual is **10/25** — see the Change Log).

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## The coupling is deliberate, which is what makes it a risk rather than a bug

`/health` returns 503 when an OpenSearch `ping()` fails (`src/waycharter-server.js:920`), and the Elastic Beanstalk environment sets **Automatically Terminate Unhealthy Instances = true** (`deploy/main.tf:195`). So a sustained 503 pulls instances from the ELB pool and can replace them.

That coupling was introduced on purpose by ADR-029, and the reasoning is sound: a misconfigured cutover (wrong endpoint, bad SigV4 credentials, unreachable domain) must fail EB's health-gated rolling deploy and trigger `RollbackLaunchOnFailure`, rather than silently serving query errors the auto-rollback cannot see. Without the coupling, a bad cutover deploys cleanly and breaks search.

The risk is the other direction of the same wire. If OpenSearch is reachable-but-unhealthy, or the probe itself misjudges, the coupling converts a search-backend problem into an **availability** problem on the revenue endpoint — and the instances being terminated are healthy.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 5 (Severe) — instance termination on the live RapidAPI-serving environment is a revenue-path outage, not degradation. `RISK-POLICY.md` Impact 5 covers loss of the serving system; a pool drained by false-negatives reaches that.
- **Likelihood**: 3 (Possible) — the probe runs on every health check against a network dependency, and `/health` is on the ADR-024 origin-auth allowlist, so it is reachable unauthenticated. A transient OpenSearch blip is an ordinary event, not an exotic one.
- **Inherent Score**: 15
- **Inherent Band**: High

## Controls

**All four are EVIDENCED in source, and this entry is unusual in the register for having no procedural control carrying any of the weight.**

- **`ping()` rather than `cluster.health()` — EVIDENCED.** `src/es-health.js` uses `ping()` (HEAD /) deliberately: unlike a GREEN-keyed `cluster.health()`, it does not false-red while the cluster is legitimately yellow, which is exactly the state during the ADR-029 replicas-0-then-add-replica populate window. This removes the single largest false-positive source.
- **Tolerance lives in the ELB thresholds, not the handler — EVIDENCED.** `UnhealthyThreshold=5` consecutive failures at a 10-second interval, so roughly 50 seconds sustained before the pool acts. A transient blip cannot pull an instance. The same window absorbs the startup-connect gap on a fresh instance, which `esConnect` closes in a few seconds.
- **Bounded probe timeout — EVIDENCED.** The handler stays fast and fail-closed, which also bounds how much load an anonymous caller can amplify onto OpenSearch through an unauthenticated endpoint.
- **`HEALTH_ES_PROBE=off` kill switch — EVIDENCED.** Reverts `/health` to always-200 **without a redeploy** if the coupling ever misbehaves in production. This is the control that matters most under a live incident, because it does not require the deploy path that a health-gated failure may itself be blocking.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 5 (Severe) — unchanged. The controls change how likely a false-negative is, not what one costs.
- **Likelihood**: 2 (Unlikely) — the ~50-second window absorbs the _transient_ class completely, which is what the controls were built for. It does not absorb two paths that never self-clear, named below.
- **Residual Score**: 10
- **Residual Band**: High
- **Within appetite?**: **No.** Appetite is 5, inclusive.

**Two paths the controls do not close, and why likelihood is 2 rather than 1.** This entry was first drafted at likelihood 1 on the strength of the 50-second window, with Treatment Accept. The risk scorer challenged that during review and was right — the window absorbs blips, and neither of these is a blip:

1. **Probe-specific denial.** An OpenSearch access-policy or permissions change that denies `HEAD /` while still permitting `_search` produces a sustained, genuine 503 on a cluster that is serving queries correctly. The window does nothing, because the condition does not clear. ADR-033's scoped-policy invariant makes this unlikely rather than impossible, and it would arrive through a deliberate infra change rather than drift.
2. **Overload amplification, which is the worse one.** A saturated cluster that makes queries slow-but-working can exceed the 2000 ms probe timeout for minutes. Instances get pulled — and because the instances are the _API servers_ rather than OpenSearch, removing them cuts serving capacity without reducing load on the thing that is actually saturated. A degradation that would have scored Impact 4 becomes an Impact 5 pool drain, and the mechanism feeds itself.

Neither is exotic. Both are bounded in duration by the kill switch, but only once a human notices and reaches for it.

**On the scaffolded figure.** The hint said 8/25. That came from the pipeline scorer at the moment the coupling was introduced, before the ELB threshold and the kill switch were counted. Reading the source moved it to 5; the scorer's challenge moved it to 10. So the correction ran in both directions, and the hint was right that this needed attention while being wrong about the number in a way that reading alone would not have fixed.

**Above appetite, deliberately.** At 10/25 this is the second entry in the P083 drain committed above the appetite of 5, after R004 at 9. That is not a scoring failure — it is what the register looks like when the numbers follow the evidence rather than the reverse.

## Treatment

**Mitigate**, not Accept. A residual above appetite is not acceptable under `RISK-POLICY.md`: it is either brought within appetite or it carries named controls that are not yet in place. This one carries the latter.

What is settled: **the coupling stays.** Removing it re-opens the ADR-029 failure mode where a bad cutover deploys cleanly and breaks search silently, which is strictly worse than either path above. The four existing controls are structural rather than procedural, and the `HEALTH_ES_PROBE=off` kill switch makes the posture reversible in production without a deploy.

What is missing, and would bring this within appetite:

1. **Distinguish "probe timed out" from "cluster unreachable".** The overload path is the expensive one and it is detectable: a probe timeout while `_search` still returns is a different condition from a connection refusal. Failing the probe only on the latter would close path 2 without weakening the ADR-029 guarantee, which is about a _misconfigured_ domain rather than a slow one.
2. **An alert on the kill switch's precondition.** Both paths are bounded by a human noticing. An alarm on sustained `/health` 503s, firing before `UnhealthyThreshold` acts, would convert "someone notices" into a control.

Neither is built. Recorded as the named treatment rather than scoring the entry down to appetite and calling it done.

## Monitoring

- **Trigger to re-assess**: any change to the `/health` handler's status logic, to `UnhealthyThreshold`, or to _Automatically Terminate Unhealthy Instances_; or the first production use of the `HEALTH_ES_PROBE=off` kill switch, which would be direct evidence the coupling misbehaved. Deliberately NOT "a new pipeline hint with this risk_slug" — that fires on scorer activity rather than on the hazard (P083).
- **Metrics**: instance replacement events on the EB environment. A replacement not explained by a deploy or a scaling event is the signal.

## Related

- Criteria: `RISK-POLICY.md`
- Treatment ADRs: **ADR-029** (two-phase blue/green cutover) introduced the coupling and states why. **ADR-024** (origin gateway auth) puts `/health` on the unauthenticated allowlist, which is why the probe cost is bounded deliberately.
- Personas affected: `docs/jtbd/web-app-developer/`, `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-10T01:11:10Z: fired in `.risk-reports/2026-07-10T01-11-10-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-18: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated. **Corrected the scaffolded residual from 8/25 to 10/25, in both directions** by reading `src/es-health.js` and `deploy/main.tf` rather than adopting the hint: the ELB `UnhealthyThreshold` (~50s sustained) and the no-redeploy `HEALTH_ES_PROBE=off` kill switch were both uncounted. The first draft scored likelihood 1 and recorded Treatment Accept; the risk scorer challenged that during review, on the grounds that the 50-second window absorbs transients while two named paths do not self-clear, so likelihood 1 left no headroom and Accept rested on it. Both points held, and the entry now records Mitigate with two controls not yet built. Also corrected P083's triage, which had grouped this entry into the terraform-apply cluster on the word "OpenSearch" — the hazard is a runtime availability coupling and has nothing to do with an apply. Curated as part of the P083 register drain.
