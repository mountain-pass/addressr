# Risk R022: Unstaged `deploy/**` drift arms a push-tier production apply

> **Filename retained deliberately.** The `<slug>` in this file's name is the dedupe key the ADR-056 Phase 2b drain matches on, so renaming it would let the same hazard re-scaffold as a new entry. The H1, the README row and the body carry the corrected scope; the filename is an identifier, not a description.

**Status**: Active — RE-SCOPED 2026-08-04 (the lockfile half is discharged; the `.tf` half is live)
**Category**: operational (ISO 31000) — production infrastructure change control
**Identified**: 2026-07-27
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state of 2026-07-27)

## Description

Unstaged working-tree changes under `deploy/**` can be swept into a commit, and once pushed, the ADR-040 stage-3 axis fires a whole-root-module production `terraform apply` at push-tier governance with no plan-approval gate.

**Re-scoped 2026-08-04 from the lockfile instance to the `.tf` class.** The original prefill named `deploy/.terraform.lock.hcl` specifically. That instance is discharged by construction — `release.yml:235` excludes the provider lockfile from the deploy pathspec and announces the exclusion with a `::notice::`. The class is not. `deploy/main.tf` and `deploy/vars.tf` sat dirty in the working tree from 2026-08-02 until they were committed on 2026-08-05 (`50f1360`), and neither was ever excluded by the pathspec. That instance is cleared; the class is untouched, because the next unstaged `deploy/**` edit arms the axis in exactly the same way. P083's triage had listed this entry as a retirement candidate on the strength of the lockfile exclusion, which is exactly the label-over-mechanism error that check caught.

The Description is restated here rather than left as the prefill because it is the field the ADR-059 judgement-fallback filter reads — a future scorer matching on the old text would match the discharged instance and miss the live class.

> **Origin.** Auto-scaffolded by the Phase 2b drain (`wr-risk-scorer` ADR-056) from a
> `wr-risk-scorer:pipeline` RISK_REGISTER_HINT bullet. The scoring fields **carried** the
> ADR-026 ungrounded-output sentinel until the curation recorded in the Change Log below;
> they are grounded now. The original description was the agent's prefill.

## Re-scope, and why the obvious retirement was wrong

P083's triage listed this entry as a retirement candidate on the grounds that `release.yml` excludes the provider lockfile from the deploy-detection pathspec. That check holds — `release.yml:235` excludes `deploy/.terraform.lock.hcl` by name, with the reasoning written out, and announces the exclusion in the log so it can never be a silent no-deploy.

But retiring on it would have been wrong, and the error is instructive. The entry's TITLE says lockfile; its actual hazard is **unstaged `deploy/**` drift arming a push-tier production apply**. The lockfile was merely the instance that triggered the hint. Excluding one filename discharges one instance and leaves the class untouched — and the class was live throughout that window: `deploy/main.tf` and `deploy/vars.tf` have been modified in the working tree continuously since 2026-08-02, held out of every commit until 2026-08-05, when they were landed deliberately against a plan verified empty, and NEITHER is excluded by that pathspec.

So this is re-scoped rather than retired. The narrow reading would have closed the register's only entry covering a hazard that fired as a scoring input on more than a dozen commits in three days.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 5 (Severe) — the ADR-040 stage-3 axis runs a whole-root-module `terraform apply` against the live Elastic Beanstalk environment, the AWS-managed OpenSearch domain and the Cloudflare worker, at push-tier governance with no plan-approval gate. `RISK-POLICY.md` Impact 5 names OpenSearch data loss requiring re-indexing; an unreviewed apply against the search domain reaches that.
- **Likelihood**: 3 (Possible) — not a projection. Modified `deploy/*.tf` files sat in the working tree continuously across a three-day session, and this repo has a documented history of commits capturing more or less than intended (P011, P017), including a variant found on 2026-08-03 where a gate-denied `git add X && git commit` runs neither, so the retry commits an unrelated tree.
- **Inherent Score**: 15
- **Inherent Band**: High

## Controls

**Which controls carry the residual, stated explicitly.** Two are structural and one is procedural, and only the structural ones are credited. This matters because the procedural one is the one that has been doing the actual work.

- **Provider-lockfile exclusion — EVIDENCED, but narrow.** `release.yml:235` removes `deploy/.terraform.lock.hcl` from the detection pathspec, so routine provider churn cannot arm the axis. Pinned by `test/js/__tests__/release-workflow-deploy-only.test.mjs`. Discharges the originally-named instance completely and the re-scoped class not at all.
- **Fail-closed detection — EVIDENCED.** The step diffs `github.event.before..GITHUB_SHA -- deploy/` and fails closed on an unresolvable parent (`git cat-file -e`), so branch creation and force-pushed parents yield `changed=false` rather than an accidental arm. `fetch-depth: 0` is load-bearing and pinned by the same test.
- **Explicit-pathspec commits — PROCEDURAL, deliberately NOT credited.** Every commit in the 2026-08-02 to 2026-08-04 session named its files explicitly, which is what kept the axis disarmed. It worked, and it is the discipline to keep. But it is a habit, not a mechanism: nothing enforces it, and a single `git commit -a` defeats it. Crediting a habit for a two-level likelihood drop is exactly the error R010's curation warns against, so the residual below reflects the structural controls only.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 5 (Severe) — irreducible. No control here bounds what an unreviewed apply would do; they bound whether one starts.
- **Likelihood**: 1 (Rare) — the structural controls make an ACCIDENTAL arm from lockfile churn or a malformed parent ref essentially impossible. The remaining path is a deliberate-but-careless broad stage, which is a human action rather than a mechanism.
- **Residual Score**: 5
- **Residual Band**: Medium per `RISK-POLICY.md`'s table (Low under the scorer's ADR-086 bands — the two disagree at exactly this value; the appetite arithmetic is identical either way)
- **Within appetite?**: Yes, at the line. Appetite is 5, inclusive.

## Treatment

**Mitigate**, and the honest statement is that the mitigation is incomplete.

The structural half is done and pinned. The exposure this entry was raised on — `deploy/main.tf` and `deploy/vars.tf` dirty in the working tree — is cleared as of 2026-08-05. What remains is the class: the next unstaged `deploy/**` edit with no mechanism preventing a broad stage from committing them — only the maintainer's habit. Two candidate treatments. **Option 1 was taken on 2026-08-05**; option 2 remains open:

1. **Commit or discard the held edits.** They were comment-only tidying held back since 2026-08-02, and this option was TAKEN on 2026-08-05 and committed at `50f1360` against a plan verified empty on four prior runs, rather than left to ride the next infra change. While they sat, the exposure ran for no benefit — which is the argument that carried, four days in. This was the cheap one, and it is now done — see the Change Log.
2. **A pre-commit guard** that refuses a commit staging `deploy/**` unless the message carries an explicit infra marker. This makes the discipline mechanical rather than remembered.

Option 1 is now done — the held edits were landed deliberately against a verified-empty plan rather than left to ride along with the next infra change, which was the outcome this sentence had been hedging toward. Option 2 remains the maintainer's call.

## Monitoring

- **Trigger to re-assess**: `deploy/**` files present in `git status` at the start of a session, or any change to `release.yml`'s deploy-detection step. Deliberately NOT "a new pipeline hint with this slug" — that fires on scorer activity rather than on the hazard, and is why this register sat uncurated (P083).
- **Metrics**: whether the working tree is clean of `deploy/**` at session start. A boolean the maintainer can check in one command.

## Related

- Criteria: `RISK-POLICY.md`
- Treatment ADRs: **ADR-040** (release-pipeline change-type action matrix) — the decision that created the push-tier axis; **ADR-001** (risk-gated release process) — its 2026-07-26 amendment names the axis and its push-tier score.
- Siblings: **R021** (the axis's governance level) and **R020** (the manual `deploy_only` recovery path, exercised 2026-08-05 against a no-op plan only) — the same machinery from different angles. **Consolidation was considered and REJECTED 2026-08-04**: these are distinct hazards that happen to share the word "terraform apply". R021 is about _who can start_ an apply, R020 about a _recovery route_ proven only against a no-op plan, and this entry about _unreviewed content_ reaching one. Only R025 turned out to be a genuine duplicate, and it merged into R020. See P083.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-27T01:18:00Z: fired in `.risk-reports/2026-07-27T01-18-00-commit.md` (reason: user-stated-precondition)

## Change Log

- 2026-07-27: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated and **re-scoped** from the provider lockfile to the `deploy/**` working-tree class. P083's triage had listed this as a retirement candidate; checking the claim showed the lockfile exclusion is real but discharges only the instance, while the class remained live in the working tree throughout the session that proposed the retirement. Scored 15 inherent / 5 residual, at the appetite line, with the procedural control explicitly not credited. Curated as part of the P083 register drain.

- 2026-08-05: **Live subject CLEARED.** `deploy/main.tf` and `deploy/vars.tf` were committed (`50f1360`) after four days dirty, and pushed. The class this entry prices is unchanged — the next unstaged `deploy/**` edit arms the axis exactly as before — but the standing instance that had fired this entry's re-assess trigger every session since 2026-08-02 is gone.
  The exercise was deliberate and is worth recording as evidence rather than as an incident. The diff was comment text plus one `variable` `description` string, attributed line by line rather than asserted; `alarm_description` (a real CloudWatch API field on two resources in the same module) appears zero times in it. Four `terraform plan` runs against committed refs all reported "No changes", and the push's own deploy step then reported the same and applied nothing. Run `31002259787`: detection `success`, `Deploy new version` `success` with an empty plan, stabilise `success`, smoke `success` — no false red on this occasion.
  Residual stays at **5**. It prices the class, not the instance, and the class is untouched: the axis still has no plan-approval gate, and the explicit-pathspec habit that kept these files out for four days remains a habit rather than a mechanism.
- 2026-08-05: Cross-references to R020 corrected after the `deploy_only` path was exercised. Both falsifications sat in the same sentence-block — the parenthetical, and then the Siblings clause forty words later — which is the miss-a-sibling-in-the-same-file shape R028's Controls section describes, found by the risk scorer after a phrase grep reported the file clean.
