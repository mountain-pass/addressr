# Problem 077: The risk scorer rates deferral as mitigation, because it scores one hop rather than the path

**Status**: Open — upstream-blocked (@windyroad/risk-scorer), [#405](https://github.com/windyroad/agent-plugins/issues/405)
**Reported**: 2026-08-01
**Priority**: 12 (High) — Impact: Moderate (3) × Likelihood: Likely (4). Impact 3 per RISK-POLICY: deferred deploy work does not degrade the live service, but it multiplies applies (each reconciling the whole root module), widens the window in which committed and live state diverge, and worsens attribution when something breaks. Likelihood 4: this is a structural property of per-action scoring, faced by every future run, with no rule preventing it.
**Origin**: internal — surfaced 2026-08-01 landing the terraform plan-only tool.
**Effort**: M — the fix is upstream in `@windyroad/wr-risk-scorer`'s agent definition; the rule is short but needs care not to forbid legitimate splits.
**WSJF**: 6.0 — (12 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`wr-risk-scorer:pipeline` scores **the action in front of it**. Deferring work moves the hazard outside the scored window, so any recommendation to hold work back scores lower on the current hop — regardless of whether total risk fell. The agent has no mechanism to price un-integrated work, so it will rate deferral as mitigation every time.

**Realised 2026-08-01.** It scored a `deploy/**` push to master at 20/25 and the identical change on a short-lived branch at 5/25, and recommended the branch. The branch did not remove the production Terraform apply — it postponed it, and would have split one apply into two (`deploy.sh`, then `vars.tf`). Re-scored against the whole path the agent withdrew its own recommendation:

> "under trunk-based the split produces two applies to reach the same end state rather than one."

It only saw this when forced to score the whole path. Left alone, the recommendation stood.

## Symptoms

A scoring run recommends holding work back, splitting a commit to defer part of it, or routing a change onto a branch — and presents the lower current-hop score as evidence the deferral reduces risk, without accounting for the deferred action or the extra applies/deploys the split introduces.

## Workaround

Re-score with the whole path stated explicitly: name the end state, the deferred action, and how many applies/deploys the split produces. The agent then corrects itself. This works but depends on the operator noticing, which is not a control.

## Impact Assessment

- **Who is affected**: any maintainer taking a scoring recommendation at face value. On this project it collides with trunk-based delivery, which `AGENTS.md` and `AGENTIC_RISK_REGISTER.md` both make the required operating model.
- **Frequency**: one observed instance; structurally available on every run that could recommend a deferral.
- **Severity**: Moderate on the delivery axis, none on the service axis. Nothing wrong reaches production from this defect alone — it degrades the quality of governance advice, in the direction of more batching.

## Root Cause Analysis

### Cause

Per-action scoping. The agent is asked "what is the risk of this action?" and answers correctly. Deferral changes which action is being asked about, so it lowers the answer without lowering the risk. A control removes or bounds a hazard; a deferral relocates it. Nothing in the agent's rules distinguishes the two.

### Proposed fix, upstream

A scoring rule: **a control that defers an action does not reduce that action's risk.** When a proposed mitigation moves work out of the current action rather than removing a hazard, score the **end state** — including the deferred action and any additional applies, deploys or releases the split introduces — and call it mitigation only if the total is lower.

Made testable: a scorer recommending "hold this back" must show the total is lower, not merely that this hop is.

Care needed not to over-reach. Some splits genuinely reduce risk — separating an unrelated change out of a risky commit narrows blast radius without deferring anything. The rule must bite on _deferral of the same work_, not on _separation of different work_.

### Why this cannot be fixed here

`/wr-risk-scorer:update-policy` scopes `RISK-POLICY.md` to appetite, impact levels, likelihood levels and the matrix, and states that assessment rules and scoring mechanics do **not** belong there — they live in the agent. The agent is in the plugin cache (`windyroad/wr-risk-scorer`), and this repo has no `.claude/agents/` override, so a local edit would be lost on the next plugin update.

### Investigation Tasks

- [x] Confirm the behaviour is structural rather than a one-off — the agent withdrew the recommendation only when re-scored against the whole path.
- [x] Confirm the fix cannot land in `RISK-POLICY.md` — the update-policy skill scopes scoring mechanics out of it.
- [x] Report upstream to `windyroad/agent-plugins` — filed as [issue #405](https://github.com/windyroad/agent-plugins/issues/405) on 2026-08-01.
- [ ] Land the in-repo half: an `AGENTS.md` rule that a lower per-action score is not a reason to defer integration. This is the part that does not depend on upstream, and it addresses the second defect below.

### The second defect, which is ours

There were two failures, not one. The agent emitted a per-action-scoped recommendation — upstream. And the primary agent **followed it**, against a delivery model that `AGENTS.md` § Trunk-Based Delivery and `AGENTIC_RISK_REGISTER.md` § Scope both make mandatory, and that session memory records as an explicit user directive. The second is fixable here and should not be written off with the first: `AGENTS.md` speaks to the default workflow and is silent on the specific shape "a governance control has just handed me a number that argues for a branch."

## Dependencies

- **Blocks**: R027 reaching within appetite — its residual stays above the threshold until this lands.
- **Blocked by**: upstream `windyroad/agent-plugins`.
- **Composes with**: P053 (scorer defers to policy prose over gate numeric), P054 (label bands disagree across the plugin) — same agent, same class of scoring-rule defect.

## Related

- **R027** (`docs/risks/R027-deferred-integration-accumulates-unpriced-risk.active.md`) — the register entry this ticket is the treatment for.
- **AR20** in `AGENTIC_RISK_REGISTER.md` — names the branch-divergence hazard. This ticket names something different: a governance mechanism recommending the thing the delivery policy prohibits.
- **ADR-040** — its `deploy/**` axis is what makes a push reach production, so a split produces two applies. Cited for that narrow point only; it does not ratify trunk-based delivery, and neither does ADR-001.
- Upstream siblings: P048, P052, P053, P054, P058 — all `upstream-blocked (@windyroad/risk-scorer)`.
