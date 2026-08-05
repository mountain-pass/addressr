# Risk R003: Any production apply redeploys the live Elastic Beanstalk environment

**Status**: Active
**Category**: operational (ISO 31000) — availability of the revenue-serving environment
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-04
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state of 2026-07-18)

## Description

EB environment redeploy on live RapidAPI app during any `terraform apply` carries Severe-impact / Unlikely-likelihood residual that recurs on every search-backend infra change (v2 re-attempt, Phase 2, locality/postcode indices)

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## Trigger-independent, which is what separates this from its siblings

`deploy/main.tf:28` binds the environment to the application version:

```hcl
resource "aws_elastic_beanstalk_environment" "beanstalkappenv" {
  version_label = aws_elastic_beanstalk_application_version.elasticapp.name
```

So any apply that moves the application-version resource redeploys the live RapidAPI-serving environment. That happens whenever `elasticapp_version` changes, which is every release — and it happens **regardless of which of the three entry points started the apply**.

This is why P083's triage was wrong to fold this entry into R021. R021 is about _who can start_ an apply and its governance level. This entry is about _what an apply does once running_, and it fires identically on a release-tier dispatch, a publish-triggered deploy, and a push-tier `deploy/**` change. Consolidating them would have hidden a hazard that survives closing the one the other names.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 4 (Significant) — an EB environment redeploy on the live app. `RISK-POLICY.md` Impact 4 covers degraded service on a running system; a redeploy that fails or thrashes leaves the revenue endpoint degraded or down until it settles or rolls back. Not Impact 5: the data is untouched, the OpenSearch domain is unaffected, and the failure is a compute-tier one with a defined recovery.
- **Likelihood**: 4 (Likely) — not a rare event. It is the normal consequence of every release, and the scaffolded description already noted it "recurs on every search-backend infra change". Something that happens by design on every deploy is Likely by definition.
- **Inherent Score**: 16
- **Inherent Band**: High

## Controls

**All four are structural. None depends on anyone remembering anything, which is unusual in this register.**

**Read the configured VALUES, not the setting names.** An earlier draft of this entry credited three controls for reducing impact and was wrong about two of them, in a way `ADR-001`'s 2026-07-26 Correction had already documented. Corrected below.

- **`RollbackLaunchOnFailure = true` — EVIDENCED, and the only one that holds for the modal case.** (`deploy/main.tf:539-540`.) A launch that fails the health gate rolls back automatically, with no human intervention and without needing the deploy path that a failing deploy may itself be blocking. Note what it is: a **recovery** control, not a prevention one. It closes a serving gap rather than preventing one.
- **Health-gated deploy — EVIDENCED, with its scope stated honestly.** `/health` reflects OpenSearch reachability (ADR-029; see R006 for the risk that coupling carries in the other direction), so a misconfigured version fails the gate rather than completing and serving errors. It is what makes the rollback fire. It does not make the deploy incremental.
- **Fail-loud precondition on the auth pair — EVIDENCED.** `deploy/main.tf:33-36` refuses the apply outright when exactly one of `proxy_auth_header` / `proxy_auth_value` is set, per ADR-024. A partial auth configuration cannot reach the environment; the apply stops before it starts. Prevention, but for one specific misconfiguration rather than the general case.

**Two controls an earlier draft credited, withdrawn on the evidence:**

- **NOT "a rolling deploy at reduced capacity".** `DeploymentPolicy = "Rolling"` (`deploy/main.tf:279-280`) is the policy _name_; the batch is set by `BatchSize = "100"` with `BatchSizeType = "Percentage"` (`:207-214`), so an application deploy cycles **every instance at once**. The genuinely incremental `MaxBatchSize = 1` / `MinInstancesInService = 2` pair (`:473-492`) lives under `aws:autoscaling:updatepolicy:rollingupdate`, which governs _instance replacement_, not application deploys. `ADR-001` states this and flags the conflation by name. The draft reproduced the very error the ADR had corrected.
- **NOT `create_before_destroy`.** It is a Terraform lifecycle meta-argument that engages only when a resource must be **replaced**. A `version_label` change is an in-place update — which is the scenario this entry is named after — so it never fires for the modal case. It is real protection against an environment-_replacing_ change and nothing else.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — **unreduced**. An earlier draft scored 3 on the strength of `create_before_destroy` plus a "rolling" deploy; both were withdrawn above. With `BatchSize = 100%` the whole fleet cycles at once, so a version that fails the health gate produces a real serving gap that `RollbackLaunchOnFailure` **closes** rather than prevents. The deploy-window duration is unmeasured (`ADR-001` says so explicitly). A recovery control does not reduce impact; it bounds duration.
- **Likelihood**: 2 (Unlikely) — the redeploy itself is Likely by design, but the redeploy is not the hazard; a redeploy that _degrades service_ is. The health gate has caught real misconfigurations before — it is why ADR-029 introduced the OpenSearch coupling at all — and the auth precondition stops one class before the apply starts.
- **Residual Score**: 8
- **Residual Band**: Medium
- **Within appetite?**: **No.** Appetite is 5, inclusive.

**The named gap, which no control here closes.** The rollback covers _launch_ failure, not a version that launches cleanly and behaves wrongly. That is R008's blind spot for ranking regressions and what P069 hid for four years: a healthy-looking deploy serving subtly wrong results. Scoring this lower would require crediting the health gate for a class of failure it cannot see.

## Treatment

**Mitigate.** The four structural controls stay; the named gap is the one they do not close.

The concrete treatment is the ADR-031 read-shadow soak pattern, already proven on this project: mirror production traffic at the new version before it serves, so a behaviourally-wrong-but-healthy deploy surfaces before consumers see it. That is what the soak did for the search backend, and it is what the deploy path lacks for the application tier.

Not proposed: adding a manual approval to the deploy. It would slow every release to price a failure mode the health gate already catches in its common form, and the uncommon form is a behavioural one that an approval click cannot detect either.

## Monitoring

- **Trigger to re-assess**: a failed EB deploy that does NOT roll back cleanly, or a deploy that completes healthy while serving degraded results (the second is the named gap materialising). Deliberately NOT "a new pipeline hint with this risk_slug" — that fires on scorer activity rather than on the hazard (P083).
- **Metrics**: EB deploy outcomes, and rollback events not explained by a known-bad version.

## Related

- Criteria: `RISK-POLICY.md`
- Treatment ADRs: **ADR-029** (two-phase blue/green cutover) established the health-gated deploy and the `/health` OpenSearch coupling; **ADR-024** (origin gateway auth) is the source of the fail-loud precondition; **ADR-031** (read-shadow soak) is the pattern named as the treatment for the residual gap.
- Siblings, deliberately NOT consolidated (see P083): **R021** — who can start an apply, which this entry is independent of; **R006** — the same `/health` coupling seen from the availability side, where it is a hazard rather than a control; **R008** — the ranking-regression blind spot in the same auto-rollback.
- Personas affected: `docs/jtbd/web-app-developer/`, `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-05-13T19:56:55Z: fired in `.risk-reports/2026-05-13T19-56-55-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-18: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated. Scored 16 inherent / **8 residual, above appetite**, Treatment **Mitigate**. **Impact is UNREDUCED at 4, after a correction during review.** The first draft scored 3 by crediting `create_before_destroy` and a "rolling" deploy. The risk scorer withdrew both against the configured values: `DeploymentPolicy = "Rolling"` is a policy name while `BatchSize = 100 Percentage` cycles the whole fleet at once, and `create_before_destroy` engages only on resource _replacement_, never on the in-place `version_label` update this entry is named after. `ADR-001`'s 2026-07-26 Correction had already documented that exact conflation, so the draft reproduced an error the repo had corrected. Only `RollbackLaunchOnFailure` survives for the modal case, and it is a recovery control that bounds duration rather than reducing impact. Held above appetite on the honest gap: the rollback covers launch failure, not a version that launches cleanly and behaves wrongly, which is R008's and P069's shape. Also recorded why this entry is NOT consolidated into R021: it is trigger-independent and fires on all three deploy entry points, so closing R021's governance gap would leave it untouched. Curated as part of the P083 register drain.
- 2026-08-05: Cross-reference to R021 re-verified after R021 moved in the same sitting. This entry's claim — that P083's triage was wrong to fold it into R021, because R021 is about _who can start_ an apply while this one is about what an apply does — is unchanged by R021's edit, which corrected a stale Siblings clause about R020. Verification recorded rather than a touch: the review-fence check flags any entry referring to one that has since moved, and a verification is the answer it wants.
