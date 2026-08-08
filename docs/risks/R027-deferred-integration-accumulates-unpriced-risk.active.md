# Risk R027: The scorer prices the action in front of it against an unscored baseline

> **Filename retained deliberately.** The slug `deferred-integration-accumulates-unpriced-risk` is the identifier [P077](../problems/open/077-risk-scorer-rates-deferral-as-mitigation.md) cites by name, and it is the dedupe key the `wr-risk-scorer` ADR-056 Phase 2b drain matches on. The H1 and body carry the corrected, wider scope; the filename is an identifier, not a description.

**Status**: Active
**Category**: delivery — change integration
**Identified**: 2026-08-05
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05

## Description

Risk scoring here is **per-action**: the scorer is asked "what is the risk of this commit / push / release?" and answers correctly for the action in front of it. It compares that action against an **unscored baseline** — implicitly zero. Anything that moves the hazard outside the scored window therefore looks like mitigation, whether or not total risk fell.

A control **removes or bounds** a hazard. Moving it **relocates** it. Nothing in the scoring rules distinguishes those, so the confusion is available on every run rather than being a one-off misjudgement.

### Two observed instances, and why the entry is not scoped to just one

**Deferral** — the scorer rated a `deploy/**` push to trunk at **20/25** and the identical change on a short-lived branch at **5/25**, and recommended the branch. The branch did not remove the production Terraform apply; it postponed it, and because the held-back work then had to land separately it would have produced **two applies instead of one**. Re-scored with the whole path stated explicitly, the scorer withdrew its own recommendation:

> under trunk-based the split produces two applies to reach the same end state rather than one

It only saw it when forced to score the path. Left alone the recommendation stood, and it had been followed.

**Inaction** — a production rollback drill scored **15/25, a STOP**, because the drill was priced against an implicit zero for not drilling. Scored properly as two states it reversed: drilling **12/25**, not drilling **15/25**. No deferral was involved at all.

P077 is explicit that a rule written only about deferral would not have caught the second case, and states the general form: _"the scorer prices the action in front of it against an unscored baseline. Deferral is one way the hazard leaves the window; inaction is another."_ This entry is scoped to that class. Scoping it to deferral would repeat the defect [R022](R022-unstaged-terraform-lockfile-drift-arms-deploy-axis.active.md) had to be rescued from — an entry titled after the instance that triggered the hint, nearly retired on a check that discharged only that instance while the class ran live.

### The half that never reaches a scoring surface

The deferral this project's user corrections were actually about **did not travel through a scored action at all**. It travelled through prose — recommendations that defer by construction, and status reports naming remaining work without acting on it. Three user corrections in one session were that shape: the dependency majors reported as outstanding rather than attempted; an untested "wall" reported as fact; the k6 run and the watcher fix listed as open instead of done.

This matters for the score. No upstream scoring rule can reach prose, because prose is never scored.

## Inherent Risk

Impact × Likelihood _before_ controls.

> **Scale interpretation.** `RISK-POLICY.md`'s likelihood descriptors are written about _changes_ ("Change is trivial, isolated, and well-understood"). This is a standing posture rather than a change, so likelihood reads as the probability of the condition materialising in a given period — the R010 precedent for standing entries.

- **Impact**: 3 (Moderate) — per `RISK-POLICY.md` and matching P077's own recorded ground for its priority of 12: deferred deploy work does not degrade the live service, but it **multiplies applies** (each reconciling the whole root module), widens the window in which committed and live state diverge, and worsens attribution when something breaks. That reaches the deployment-pipeline clause by the letter. The DORA mechanism — larger batches, longer defect-discovery latency — is why it matters, not the derivation.
- **Likelihood**: 4 (Likely) — structural, not occasional. The lower score is available on every scored action, and the prose variant on every status report.
- **Inherent Score**: 12
- **Inherent Band**: High

## Controls

- **Standing user direction that trunk-based delivery is mandatory** — _"In my experience using branches delays integration which increases risk."_ **Evidenced by application, not by existence**: it has caught the failure twice, including overriding the scorer's own branch recommendation, and reversing the rollback-drill STOP. This is the R010 rule — credit evidence of application, not the presence of a procedure — rather than R022's refusal, which applied to a habit with no counter-evidence either way.
- **The "score the path, not the hop" reframing** — asking for the end state including the deferred action does produce the right answer, evidenced by the scorer withdrawing its own recommendation when asked that way. It is a question someone has to think to ask, so it is a prompt, not a gate.
- **NOT credited: the risk gate itself.** The gate consumes the per-action score, so it inherits the defect rather than catching it.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 3 (Moderate) — unchanged. No control here makes a large un-integrated batch smaller or an unpriced counterfactual priced.
- **Likelihood**: 3 (Possible) — one level, and the cap is **an uncovered surface, not a discount for the control being non-mechanical**. Two surfaces are uncovered: prose deferrals never reach a scoring surface, and three of the five observed instances occurred there; and every catch on record happened in an **attended** session. Under an AFK or unattended run there is no mechanism and no user, so the control is absent entirely and the residual must price runs the evidence base does not cover. This is R004's shape — its external-comms gate is "the strongest control here", exercised roughly twenty times, and still buys exactly one level because a whole surface is uncovered.
- **Residual Score**: 9
- **Residual Band**: Medium
- **Within appetite?**: **No** — appetite is 5 inclusive.

## Treatment

**Mitigate**, on two candidate treatments. Naming both matters because the first cannot move the number as scored.

1. **Upstream — the scoring rule.** Filed as `windyroad/agent-plugins` [issue #405](https://github.com/windyroad/agent-plugins/issues/405) on 2026-08-01. In its generalised form: when a proposed action is compared against not-acting, the scorer must score **both states**, not the action against zero; the counterfactual is a risk item with its own impact and likelihood, and "we would deal with it if it happened" is a statement of the failure scenario, not a control. Scoped so it does not over-reach — separating an _unrelated_ change out of a risky commit narrows blast radius without deferring anything; the test is whether the end state still requires the held-back action. **Blocked upstream, and it does not touch the prose surface that caps the residual.**

2. **Local — the `AGENTS.md` rule.** P077's unchecked investigation task: a rule that a lower per-action score is not a reason to defer integration. Unblocked, unstarted, and **this is the one that bites on the prose variant** and therefore on the residual as scored. The register should not present this entry as locally unfixable while its own treatment ticket names an available local half.

The rule belongs in the scorer agent rather than `RISK-POLICY.md`: `/wr-risk-scorer:update-policy` scopes the policy to appetite, impact levels, likelihood levels and the matrix, and places assessment mechanics in the agent.

## Monitoring

- **Trigger to re-assess**: a scoring run recommends a **deferral, a split, a branch, or not acting**. That is the decision point at which someone needs to read this. Deliberately **not** "a new pipeline hint with this slug" — that fires on scorer activity rather than on the hazard, and it is why the register slept through three cutovers (P083).
- **Discharge condition**: upstream #405 lands, **and** the `AGENTS.md` rule lands. Stated so the entry cannot become permanent by default.
- **Metrics**: instance count and its composition — **five as of 2026-08-05: two scored (the branch recommendation, the rollback-drill STOP) and three prose.** The split is what caps the likelihood drop, so a change in composition, not just count, is the signal.

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: [P077](../problems/open/077-risk-scorer-rates-deferral-as-mitigation.md) — the defect report and both treatment halves. **This entry closes P077's dangling reference**: P077 was written as the treatment for a register entry that did not exist, recorded there as outstanding work since 2026-08-02.
- [R010](R010-warm-standby-decommission-removes-instant-rollback-net.active.md) — carries the inaction instance's corrected two-state scoring; the worked example for this class already in the register.
- [P081](../problems/open/081-assistant-escalates-judgement-calls-while-acting-freely-on-mechanical-ones.md) — the prose variant's closest owner.
- Personas affected: [addressr-maintainer](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md)

## Change Log

- 2026-08-09 (second entry today): Re-verified against R021's treatment ratification — preconditions hardened rather than a plan gate added or the residual accepted — and the `source_hash` control that landed with it. **This entry's citation holds**: this entry cites R022 for its title-versus-class rescue and does not depend on R021's treatment; the R021 token here sits in a dated verification bullet. **R021's residual did not move**: it stays at 10 and above appetite, because Impact is fixed at 5 while nothing on that path reviews the plan.

- 2026-08-09: Re-verified against R022's 2026-08-09 bullet, itself a verification confirming its citations of R021 and R020 hold after R021's re-rate. **This entry's citation of R022 is untouched**, and structurally so: it cites R022 for its _title-versus-class_ rescue, a fact about R022's own history that later movement cannot revise. The same reasoning the 2026-08-05 bullet below gives, and it has not weakened.

  **Recorded as ritual, for the same reason as R009's bullet of this date, and with the same outcome.** The fence's Change-Log-only exemption is scoped to the dirty case; R022's Change-Log-only edit committed, and this entry flagged one hop out. Writing this bullet then flagged R028, which is already in the batch — so the closure did not terminate, and could not: the graph is cyclic through R028. The check now walks committed history and dates an entry at its last change outside the Change Log.

- 2026-08-08: Re-verified after the push-tier deploy-axis entry recorded that its Monitoring re-assess trigger fired (run `31252424980`, a push-tier apply that failed by deploying an unpublished version; mechanism fixed, re-rate tracked on P095) and its reference closure was revisited in the same change. **This entry's citations still hold** — the failure changes that entry's likelihood, not its subject, and it now self-discloses that its residual understates until the re-rate lands. No cardinal here is affected.
- 2026-08-05: Cross-reference to R022 re-verified three times this sitting — after R022's Description was re-scoped from the provider-lockfile instance to the `deploy/**` working-tree class, after it recorded that live instance cleared, and after it declared canonical state. Unchanged each time, and structurally so: this entry cites R022 for its _title-versus-class_ rescue, which is a fact about R022's own history that later movement cannot revise. Consolidated rather than stacked; three bullets asserting the same verification is the decay this register keeps producing. The first of these was the review-fence check's first real use, and the answer it wanted was a verification, not a touch.
- 2026-08-05: Created and curated under the P083 register drain. Created rather than recorded out of scope because P077 had carried a dangling reference to this entry since 2026-08-02, and a drain closing with "every entry curated" while a cited entry did not exist would reproduce the defect P083 exists to fix. Scoped to the class (an action priced against an unscored baseline) rather than to deferral alone, on the architect's finding that a deferral-only entry would repeat R022's title-versus-class defect. Scored 12 inherent / 9 residual, above appetite, with the likelihood cap attributed to an uncovered surface rather than to the control being procedural.
