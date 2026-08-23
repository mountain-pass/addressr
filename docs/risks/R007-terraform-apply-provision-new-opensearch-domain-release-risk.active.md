# Risk R007: Provisioning a parallel search domain rides inside the release apply

> **Filename retained deliberately.** The `<slug>` in this file's name is the dedupe key the ADR-056 Phase 2b drain matches on, so renaming it would let the same hazard re-scaffold as a new entry. The H1, the README row and the body carry the corrected scope; the filename is an identifier, not a description.

**Status**: Active
**Category**: operational (ISO 31000) — production infrastructure change control
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05
**Curation**: curated 2026-08-05 (superseding the auto-scaffolded pending-review state of 2026-07-18); re-scoped to the provision phase

## Description

Creating a new parallel OpenSearch production domain happens inside a **whole-root-module `terraform apply` that the release pipeline triggers**, so a long-running AWS create is coupled to a release. A create that fails part-way aborts the release with partial state applied, while the live service keeps serving from the existing domain.

### What this owns, and what it does not

P083's triage placed this in an "apply-axis cluster" with R003, R021 and R025 and called consolidation the right move. Decomposing the original description by mechanism shows that would have been wrong — most of it is already owned, and the residue is not an apply-axis concern at all:

| Clause of the original entry                     | Mechanism                    | Owner                                                                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Release-triggered"                              | the trigger                  | [R015](R015-npm-publish-coupled-to-prod-deploy-p039-unresolved.active.md), [R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md), [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md) |
| "`terraform apply`" against the live root module | what an apply does to EB     | [R003](R003-terraform-apply-touches-prod-eb-during-search-backend-changes.active.md) — explicitly trigger-independent, and it fires identically here                                                                            |
| "creating a new parallel OpenSearch prod domain" | the **content** of the apply | **this entry** — unowned elsewhere. R022 owns _unreviewed_ content (working-tree drift); a parallel provision is deliberate, reviewed content                                                                                   |
| "on a new engine version"                        | engine risk                  | [R009](R009-production-search-backend-major-version-cutover.active.md), and only at the flip                                                                                                                                    |

So this is the **provision phase of the migration lifecycle** — the one phase the register had not named. The lifecycle runs R007 (provision) → R008 (ranking regression at cutover) / R009 (concurrency at cutover) → R010 (decommission removes the rollback net).

It also earns separation on treatment, which is the sharper test: the treatment below decouples a long-running create from the release pipeline, and no sibling's treatment delivers that. R003's is the read-shadow soak, R021's is Mitigate by hardening the axis's per-disjunct preconditions (chosen 2026-08-09; Accept until the re-rate earlier that day), R022's is commit hygiene.

### Provisioning does not touch the live serving path

Verified rather than assumed, because the whole score depends on it:

- `deploy/main.tf:138-139` binds EB's `ELASTIC_HOST` to `module.opensearch_v4.endpoint` — a direct module-output reference that moves only when a human edits it. Adding a new module block leaves it untouched.
- `deploy/main.tf:769-770` states it in terms: _"Granted pre-cutover — permission only; EB does not query v4 until `ELASTIC_HOST` flips."_
- `deploy/modules/opensearch/main.tf` creates exactly one domain with a domain-scoped `access_policies`. Nothing shared, nothing global.

The precise statement is **inert until the read-shadow is pointed at it, and consequence-free until `ELASTIC_HOST` flips** — not "inert until the flip". ADR-031's read-shadow mirrors production traffic to the incoming domain on the primary request path (measured at +0.09 ms p95). That is a separate `ADDRESSR_SHADOW_HOST` change rather than part of the provision, so it does not raise this entry's impact, but it is the step at which a newly-provisioned domain first sees real traffic.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 3 (Moderate) — `RISK-POLICY.md` Impact 3 reads "AWS deployment pipeline disrupted — new versions cannot be released or deployed, but existing npm installations, running Docker containers, and the live RapidAPI service continue operating on their current version." A domain create is long-running on the AWS side and rides inside the same whole-root-module apply as the release deploy, so a mid-create failure aborts the release with partial state applied while the live service keeps serving. That is the criterion almost verbatim.
- **Likelihood**: 3 (Possible) — one provision per backend generation, and the migration arc is not finished.
- **Inherent Score**: 9
- **Inherent Band**: Medium

> **Not scored on cost.** An earlier draft justified the impact partly on "unbudgeted AWS spend on a wrong instance class". `RISK-POLICY.md`'s impact scale carries service availability, pipeline availability and information disclosure — cost appears at no level. Scoring on an axis the criteria do not define is exactly the ADR-026 grounding failure, and a later reader could not check it. If cost is to count, the policy needs amending first. Sizing is also better controlled than that draft implied: `deploy/main.tf:730-736` holds sizing identical to the previous generation so the parity gate is not confounded, and names `m6g.xlarge.search` as the decided escalation.

## Controls

- **Module-driven provisioning with pinned parameters** — ADR-030 requires the domain to come from `deploy/modules/opensearch/` rather than an ad-hoc resource, so each generation is created from reviewed, parameterised code. Evidenced: `terraform state list` shows `module.opensearch_vN.aws_opensearch_domain.*` for each generation.
- **Three-for-three base rate** — three module-driven provisions have succeeded: v1→v2 (`addressr3`→`addressr4`), v2→v3 (→`addressr5`), v3→v4 (→`addressr6`). `addressr3` itself predates Terraform management (ADR-030 left it unmanaged until decommission) and is **not** counted.
- **Staged applies are demonstrated practice** — the v3 decommission was split across two applies (`96e965c`, `2e557b9`), so splitting a provision out of a release apply is a move this project has already executed rather than a theoretical one.
- **Blue/green inertness** — the new domain serves nothing until an explicit `ELASTIC_HOST` change, per the source citations above. This bounds what a bad provision can reach.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 3 (Moderate) — unchanged. The controls make a failed provision less likely; none of them stops a failure from aborting the release mid-apply.
- **Likelihood**: 2 (Unlikely) — three-for-three on module-driven provisions, with pinned parameters and a demonstrated staged-apply practice.
- **Residual Score**: 6
- **Residual Band**: Medium
- **Within appetite?**: **No** — appetite is 5 inclusive, so this is one point over.

### A named residual the score does not carry

`deploy/main.tf:775-788` attaches an inline policy to `role = "aws-elasticbeanstalk-ec2-role"` — the **live EB instance role** — keyed by `name = "addressr-opensearch-v4-eshttp"`. It is additive today only because the policy names are per-generation. A name collision, or a rename that Terraform implements as delete-then-create, would revoke the live application's `es:ESHttp*` on the **serving** domain and 403 every search. That is Impact 5.

It is excluded from the score deliberately: it is mistake-shaped, not modal, and folding a 5 into a modal-case score would misstate both. It is recorded because it is the single place where provisioning a _parallel_ domain can reach the _live_ one.

Compounding it: `deploy/main.tf:772-774` records that ADR-031's read-shadow classifier **swallows 403 as `UnknownError`**, so the control most likely to notice a permissions break is the one that would report it as something else.

## Treatment

**Mitigate.** Provision the new domain via the release-tier `deploy_only` dispatch rather than folding it into a release-triggered apply.

That decouples a long-running AWS create from the release pipeline, so a failed create fails a deliberate infrastructure action instead of aborting a release with partial state. It is not a new capability — `deploy_only` exists (ADR-001's 2026-07-26 amendment) and staged applies are demonstrated practice — which is what makes this treatment cheap. Its own caveat is [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md)'s subject: `deploy_only` was first dispatched 2026-08-05, against an empty plan, so this treatment would be the first to put a real provision through it.

## Monitoring

- **Trigger to re-assess**: a new parallel domain is proposed. Three foreseeable triggers exist — the next engine EOL, the next ADR-041-class analyzer change, and a resize, because ADR-030's amendment forbids in-place resizing of a live domain in favour of destroy-and-recreate and `deploy/main.tf:735` names `m6g.xlarge.search` as the decided escalation. A resize is therefore a parallel-provision event.
- **Metrics**: applies that both provision infrastructure and publish a release in the same run (target: zero).

## Related

- Criteria: `RISK-POLICY.md`
- Lifecycle siblings: [R008](R008-search-backend-cutover-release-residual-above-appetite.active.md) and [R009](R009-production-search-backend-major-version-cutover.active.md) (cutover), [R010](R010-warm-standby-decommission-removes-instant-rollback-net.active.md) (decommission). This entry is the provision phase.
- Deliberately **not** merged with: [R003](R003-terraform-apply-touches-prod-eb-during-search-backend-changes.active.md) (what an apply does, trigger-independent), [R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md) (who can start an apply), [R022](R022-unstaged-terraform-lockfile-drift-arms-deploy-axis.retired.md) (unreviewed apply content).
- Treatment depends on: [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md) — the `deploy_only` path this treatment uses was first dispatched 2026-08-05 and has only ever run against a plan that changed nothing, so it is proven for plumbing and unproven for carrying an actual provision.
- Treatment ADRs: [ADR 029](../decisions/029-opensearch-blue-green-two-phase-upgrade.accepted.md) (two-phase blue/green), [ADR 030](../decisions/030-opensearch-domain-terraform-module.accepted.md) (Terraform-managed domain module), [ADR 031](../decisions/031-read-shadow-for-search-backend-migrations.proposed.md) (read-shadow).
- Personas affected: [addressr-maintainer](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md)

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-12T22:36:45Z: fired in `.risk-reports/2026-07-12T22-36-45-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-08-23: **Re-verified after P039 closed and R015's link to it was repointed.** **Direction: unchanged.** R015's only change was the moved-path repoint — P039 went `known-error/` → `closed/`, and ADR-048 obliges its referrers to follow. No claim in R015 moved. This entry cites R015 solely as the owner of the release-trigger clause in the decomposition table above, and ownership is not reachable by a link target. No re-rate.
- 2026-08-10 (fourth entry today): **Re-verified after R015's stale gate quote and line anchors were corrected.** **Direction: unchanged.** R015 is cited here only as the owner of the release-trigger clause in this entry's decomposition table; that ownership is unaffected by correcting its quoted gate string and dropping its line anchors. No re-rate.

- 2026-08-10 (third entry today): **Re-verified after R020 was re-scored against the changesets-armed successor route**, which is now BUILT and is the sole path to a production infrastructure apply — `deploy_only` is deleted. **Direction: unchanged.** What provisioning a new OpenSearch domain costs on a release is a property of the provisioning, not of what armed the apply. No re-rate.

- 2026-08-10 (second entry today): **Re-verified after [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md)'s treatment and monitoring were re-pointed** off the `deploy_only` dispatch and onto the changeset-armed release-PR route, per the user-ratified JTBD-400 amendment in commit `09f6418`. **Direction: unchanged.** What provisioning a new OpenSearch domain costs on a release is a property of the provisioning, not of how the apply was started. No re-rate.

- 2026-08-10: **Revisited for the `deploy/**` push-axis retirement.** [R021](R021-push-tier-deploy-axis-arms-prod-terraform-apply.retired.md) and [R022](R022-unstaged-terraform-lockfile-drift-arms-deploy-axis.retired.md) retired (hazard deleted, not reduced); [R020](R020-deploy-path-push-tier-prod-deploy-precondition-unmet.active.md) re-scored 8 → 10 because retiring the axis deleted the ground its Impact 4 rested on. Governance: [ADR 001](../decisions/001-risk-gated-release-process.proposed.md) and [ADR 040](../decisions/040-release-pipeline-change-type-action-matrix.proposed.md), 2026-08-10 amendments. **Direction: the trigger surface narrows, the provisioning hazard does not.** This entry is about what provisioning a new OpenSearch domain costs on a release, which is independent of how the apply was started. No re-rate.

- 2026-08-09 (third entry today): Re-verified after the push-tier axis fired again — run `31283258197` applied the `source_hash` hardening itself, taking the canonical apply count to six with five successful. The apply was `0 added, 1 changed, 0 destroyed`, an in-place update of `aws_s3_object.elasticapp` with its id unchanged, so the application version and `version_label` were untouched and the fleet did not cycle. Predicted from the pinned provider's schema before the push and matched exactly.

  **This entry's citation holds** — the count moved, not the ownership, and nothing here restates the cardinal. Recorded because R021 and R020 both took body edits at their count sites, so the fence correctly required their referrers in the same commit. Under the widened fence this bullet does not propagate further.

- 2026-08-09 (second entry today): Re-verified against R021's treatment ratification — preconditions hardened rather than a plan gate added or the residual accepted — and the `source_hash` control that landed with it. **This entry's citation holds**: the decomposition claim (the trigger belongs to R015/R021/R020, unreviewed apply content to R022, leaving the apply's own content here) is about ownership, not about treatment. **One line here WAS falsified and is corrected in this commit**: the treatment-separation argument described R021's treatment as having its option unpicked, and the maintainer picked one. The argument survives — hardening preconditions decouples nothing from the release pipeline — but the sentence asserted a state that had ended, which is the same inbound-reference class that caught this entry a day earlier. **R021's residual did not move**: it stays at 10 and above appetite, because Impact is fixed at 5 while nothing on that path reviews the plan.

- 2026-08-09: Re-verified against R028's body change of the same date, which widened the review fence to walk committed history and date an entry at its last change outside its Change Log. **This entry's citation holds** — this entry cites R028 only through the shared review-fence discipline, and widening a check's timestamp source touches no claim about drift or about this entry's subject.

  Recorded because R028's edit was a genuine body move, so the fence correctly required its referrers to be revisited. Under the widened rule this bullet does **not** make this entry a moved target in turn, which is the whole point of the change: before it, exactly this remedy re-armed the check one hop further out, without a fixed point.

- 2026-08-09: Re-verified against R021's re-rate and R020's apply-count move to five. **One citation here was FALSIFIED and is corrected in this commit**: the treatment-separation argument read "R021's is Accept", and R021's treatment changed to Mitigate when its residual moved 5 → 10. The argument itself survives — no sibling's treatment decouples a long-running create from the release pipeline, and Mitigate-with-the-option-unpicked decouples nothing — but the sentence asserted a fact that had stopped being true, which is precisely the inbound-reference class R028 records. Found by reading the referrer, not by the dating sweep: a dated bullet alone would have left it standing. The decomposition table's citations of R021/R020/R015 for "the trigger" are untouched, being about ownership rather than score.

- 2026-08-08: Re-verified against R021's same-day change (its Monitoring re-assess trigger fired on run `31252424980`, a push-tier apply that failed by deploying an unpublished version; mechanism fixed, re-rate tracked on P095). **This entry's citation of R021 still holds**: the failure does not change what R021 is about, only its likelihood, and R021 now says of itself at its own surface that its residual understates until the re-rate lands. No cardinal here is affected.
- 2026-07-18: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
- 2026-08-05: Curated under P083 and **re-scoped to the provision phase**, against P083's own triage, which had listed it for consolidation into the apply-axis cluster. Decomposing the description showed three of its four clauses are owned by R015/R021/R020, R003 and R009, leaving the apply's _content_ as the unowned residue. Re-titled from the scaffold-speak "Terraform Apply Provision New Opensearch Domain Release Risk", which is what put it in the wrong cluster. Impact re-grounded on the policy's pipeline-disruption criterion after an earlier draft scored partly on cost, which has no level on this policy's scale. Base rate corrected from four provisions to three (`addressr3` predates Terraform management). Scored 9 inherent / 6 residual, one point above appetite.
- 2026-08-05: Cross-references to R020, R021 and R022 re-verified across both moves this sitting. R021 gained a base-rate note; R022 recorded its live drift cleared and then declared it canonically; R020 declared its `deploy_only` exercise canonically. The decomposition claim is untouched — the trigger belongs to R015/R021/R020, unreviewed apply content to R022, leaving the apply's _content_ here. Worth recording separately: this entry's **Treatment depends on** line cites the precise fact R020 now declares canonically (`deploy_only` exercised 2026-08-05, empty plan only). That dependency was a hand-restated figure in a second file and is now machine-held in the first, which is the inbound half of what the canonical-state block buys. Recorded per the review-fence check.
