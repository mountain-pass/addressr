# Risk R020: The manual `deploy_only` recovery path has never been exercised

> **Filename retained deliberately.** The `<slug>` is the dedupe key the ADR-056 Phase 2b drain matches on, so renaming would let the same hazard re-scaffold as a new entry. The H1, the README row and the body carry the corrected scope.

**Status**: Active — RE-SCOPED 2026-08-04 (absorbs R025; the axis half is discharged, the recovery-path half is not)
**Category**: operational (ISO 31000) — production infrastructure change control
**Identified**: 2026-07-27
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-04
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state)

## Description

ADR-001 Amendment 2026-07-27 authorises a `deploy/**` push-tier production Terraform apply while JTBD-400's "exercise the manual --deploy-only path first" precondition is unmet (zero dispatches); deferral lifted by user 2026-07-26 rather than satisfied.

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## What changed, measured rather than assumed

The entry's premise was a conjunction: the `deploy/**` push-tier axis is **armed** while JTBD-400's "exercise the manual `--deploy-only` path first" precondition is **unmet**, with the deferral lifted by user direction on 2026-07-26 rather than satisfied. R025 says the same thing in fewer words and names R020 in its own description, so the two are merged here.

Both halves were checked against the GitHub Actions history rather than reasoned about, and they have diverged:

**The axis half is discharged.** The push-tier trigger has now fired on production three times, all successful — the ADR-041 cutover (`33e6c04`), and the two staged `addressr5` decommission applies (`96e965c`, `2e557b9`). Confirmed by reading each run's `release` job: the `Deploy new version` step concluded `success` on all three. The mechanism works; it is no longer an untested path.

**The recovery half is not.** Every `workflow_dispatch` run of `release.yml` was inspected. Four exist (2026-07-24 through 2026-07-28) and on every one the `Deploy new version`, `Wait for deployment to stabilize` and `Smoke test production` steps concluded **`skipped`**. So no dispatch has ever carried `deploy_only=true`, and the manual path remains at **zero exercises** — nineteen months after the input was added and eight days after the deferral was lifted.

That inversion is the finding. The path that was _supposed_ to be proven first is the one still unproven, and the path that was armed on the strength of that deferral is now the well-exercised one.

## Base rate — the same 0-for-N shape R010 recorded

This project has now twice armed a production capability on the strength of "we will exercise the fallback later", and twice not exercised it:

- The warm-standby rollback net, surrendered twice without ever being flipped (R010's 0-for-2, corrected 2026-08-02 when the drill finally ran).
- The manual `deploy_only` path, 0-for-4 dispatches since the deferral was lifted.

R010's was closed by a deliberate drill that took one session. This one is cheaper still — a single dispatch with the box ticked.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 4 (Significant) — this is a _recovery-path_ risk, not a primary-path one. The realisation is: the push-tier axis is unavailable or unsafe (a red master, a revert in flight, an infra-only fix needed with no code change to push), the operator reaches for `deploy_only`, and it does not work. That is a delayed recovery during an incident, not an outage in itself. Below the Severe band because the primary path is now proven and would usually be available.
- **Likelihood**: 3 (Possible) — an unexercised path is not a working path. Nothing has ever run those three steps under a dispatch, so a defect in the gating expression, the input plumbing, or the risk-gate's `release:watch` command-prefix interception would surface for the first time under incident pressure.
- **Inherent Score**: 12
- **Inherent Band**: High

## Controls

- **The push-tier axis is proven — EVIDENCED, three production applies.** This is the control that changed the score. A working primary path means the recovery path is a fallback rather than the only route, which is what holds impact at 4 instead of 5.
- **`release-workflow-deploy-only.test.mjs` pins the gating expression — EVIDENCED.** It asserts the boolean is compared unquoted (`inputs.deploy_only == true`, never `== 'true'`), which is the trap that would make the gate silently never fire and take the run **green with the deploy skipped**. It also pins the three-gate occurrence count, the `deploy-paths` step id, its push-event scoping and its fail-closed missing-parent guard. Runs in CI on every push.
- **NOT a control: the four existing dispatches.** They exercised the workflow, not the path. Every one skipped all three deploy steps, so they demonstrate that `deploy_only` was absent rather than that it works. Counting them would be exactly the error this entry exists to name.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 4 (Significant) — unchanged. No control shortens a recovery that fails when reached for.
- **Likelihood**: 2 (Unlikely) — the pinned gating expression removes the single most likely defect (the boolean-quoting trap), and it is machine-checked rather than remembered. What remains unproven is everything downstream of the gate resolving true, which no test covers.
- **Residual Score**: 8
- **Residual Band**: Medium
- **Within appetite?**: **No.** Appetite is 5, inclusive.

## Treatment

**Mitigate.** The named treatment is one action: **dispatch `release.yml` once with `deploy_only=true`** and confirm the three steps run rather than skip.

It is cheap — one dispatch against already-deployed code, on a green master, at a time of the operator's choosing rather than during an incident. It converts the entry's likelihood from "unproven" to measured, and it is the precondition JTBD-400 asked for in the first place. Until it runs, this entry stays above appetite, because the alternative is scoring an unexercised recovery path as though exercise had happened.

Deliberately NOT proposed: removing the push-tier axis or re-imposing the deferral. The axis is now the proven path and three successful applies are evidence for keeping it.

## Monitoring

- **Trigger to re-assess**: the first `deploy_only=true` dispatch (which should discharge this entry outright), or any change to the deploy-gating expression in `release.yml`. Deliberately NOT "a new pipeline hint with this risk_slug" — that fires on scorer activity rather than on the hazard (P083).
- **Metrics**: count of `workflow_dispatch` runs whose `Deploy new version` step concluded `success`. Currently **zero**; one is enough.

## Related

- Criteria: `RISK-POLICY.md`
- Absorbs: **R025** (deploy axis armed, JTBD-400 manual deploy path unexercised), retired 2026-08-04 into this entry — its own description already cited R020.
- Treatment ADRs: **ADR-001** (risk-gated release process), whose 2026-07-27 amendment authorised the push-tier apply; **ADR-040** (release-pipeline change-type action matrix), which created the axis.
- Siblings: **R021** (the axis's governance level) and **R022** (unstaged `deploy/**` drift arming it). Distinct hazards on the same machinery — see P083 for why they are not consolidated.
- Precedent: **R010** — the same "we will exercise the fallback later" shape, closed 2026-08-02 by actually running the drill.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-27T01:07:31Z: fired in `.risk-reports/2026-07-27T01-07-31-commit.md` (reason: user-stated-precondition)

## Change Log

- 2026-07-27: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated, **re-scoped, and R025 merged in and retired**. Both halves of the premise were checked against the Actions history rather than assumed. The axis half is DISCHARGED: three successful production applies (`33e6c04`, `96e965c`, `2e557b9`), each verified by reading the `Deploy new version` step's conclusion. The recovery half is NOT: all four `workflow_dispatch` runs skipped every deploy step, so `deploy_only=true` has never been dispatched. Scored 12 inherent / 8 residual, above appetite, with a one-action treatment. Curated as part of the P083 register drain.
