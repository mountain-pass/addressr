# Risk R022: Unstaged `deploy/**` drift arms a push-tier production apply

> **Filename retained deliberately.** The `<slug>` in this file's name is the dedupe key the ADR-056 Phase 2b drain matches on, so renaming it would let the same hazard re-scaffold as a new entry. The H1, the README row and the body carry the corrected scope; the filename is an identifier, not a description.

**Status**: Active — RE-SCOPED 2026-08-04 (the lockfile half is discharged; the `.tf` half is live)
**Category**: operational (ISO 31000) — production infrastructure change control
**Identified**: 2026-07-27
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-04
**Next review**: 2027-02-04
**Curation**: human-curated 2026-08-04 (superseding the auto-scaffolded pending-review state of 2026-07-27)

## Description

Modified `deploy/.terraform.lock.hcl` is unstaged and user-directed to stay untouched; once the deploy/** axis lands, any future push sweeping that path up fires an unintended production Terraform apply.

> Auto-scaffolded by the Phase 2b drain (ADR-056) from a `wr-risk-scorer:pipeline`
> RISK_REGISTER_HINT bullet. The description is the agent's prefill; scoring
> fields below carry the ADR-026 ungrounded-output sentinel until human curation.

## Re-scope, and why the obvious retirement was wrong

P083's triage listed this entry as a retirement candidate on the grounds that `release.yml` excludes the provider lockfile from the deploy-detection pathspec. That check holds — `release.yml:235` excludes `deploy/.terraform.lock.hcl` by name, with the reasoning written out, and announces the exclusion in the log so it can never be a silent no-deploy.

But retiring on it would have been wrong, and the error is instructive. The entry's TITLE says lockfile; its actual hazard is **unstaged `deploy/**` drift arming a push-tier production apply**. The lockfile was merely the instance that triggered the hint. Excluding one filename discharges one instance and leaves the class untouched — and the class is live right now: `deploy/main.tf` and `deploy/vars.tf` have been modified in the working tree throughout the 2026-08-02 to 2026-08-04 session, deliberately held out of every commit, and NEITHER is excluded by that pathspec.

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

The structural half is done and pinned. The remaining exposure is that `deploy/main.tf` and `deploy/vars.tf` are dirty in the working tree with no mechanism preventing a broad stage from committing them — only the maintainer's habit. Two candidate treatments, neither yet chosen:

1. **Commit or discard the held edits.** They are comment-only tidying held back since 2026-08-02 to ride the next infra change that runs the plan protocol. The longer they sit, the longer the exposure runs for no benefit. This is the cheap one.
2. **A pre-commit guard** that refuses a commit staging `deploy/**` unless the message carries an explicit infra marker. This makes the discipline mechanical rather than remembered.

Recorded rather than decided, because the choice is the maintainer's and option 1 may simply happen at the next infra change.

## Monitoring

- **Trigger to re-assess**: `deploy/**` files present in `git status` at the start of a session, or any change to `release.yml`'s deploy-detection step. Deliberately NOT "a new pipeline hint with this slug" — that fires on scorer activity rather than on the hazard, and is why this register sat uncurated (P083).
- **Metrics**: whether the working tree is clean of `deploy/**` at session start. A boolean the maintainer can check in one command.

## Related

- Criteria: `RISK-POLICY.md`
- Treatment ADRs: **ADR-040** (release-pipeline change-type action matrix) — the decision that created the push-tier axis; **ADR-001** (risk-gated release process) — its 2026-07-26 amendment names the axis and its push-tier score.
- Siblings: **R021** (the axis's governance level) and **R020** (the manual `deploy_only` recovery path, never exercised) — the same machinery from different angles. **Consolidation was considered and REJECTED 2026-08-04**: these are distinct hazards that happen to share the word "terraform apply". R021 is about _who can start_ an apply, R020 about a _recovery route_ that has never run, and this entry about _unreviewed content_ reaching one. Only R025 turned out to be a genuine duplicate, and it merged into R020. See P083.
- Personas affected: `docs/jtbd/addressr-maintainer/`

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-27T01:18:00Z: fired in `.risk-reports/2026-07-27T01-18-00-commit.md` (reason: user-stated-precondition)

## Change Log

- 2026-07-27: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.

## Change Log

- 2026-07-27: Auto-scaffolded by the Phase 2b drain (ADR-056, plugin-scoped). Pending human curation.
- 2026-08-04: Curated and **re-scoped** from the provider lockfile to the `deploy/**` working-tree class. P083's triage had listed this as a retirement candidate; checking the claim showed the lockfile exclusion is real but discharges only the instance, while the class remained live in the working tree throughout the session that proposed the retirement. Scored 15 inherent / 5 residual, at the appetite line, with the procedural control explicitly not credited. Curated as part of the P083 register drain.
