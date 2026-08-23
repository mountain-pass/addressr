# Problem 129: The deployment artefact/ignore contract is enforced at three sites and written down at none

**Status**: Open
**Reported**: 2026-08-24
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3). Impact 3 rather than higher because the control currently _works_: three sites assert it and the credentials have not leaked. Impact 3 rather than lower because what it protects is disclosure of live cleartext secrets from a public repository, and the RISK-POLICY.md disclosure clause reaches that. Likelihood 3: not a probability estimate. `.gitignore`'s own comments record **two silent rule strips in a single day**, and the defect that prompted this capture is a third instance of the same shape — one of the three enforcement sites was examining nothing while reporting green.
**Origin**: internal
**Effort**: M — the contract already exists and is fully described across three test-file comments. The work is reading them, resolving what they say against each other, and writing one decision record. No code change.
**WSJF**: 4.5 — (9 × 1.0) / 2
**JTBD**: JTBD-401
**Persona**: addressr-maintainer

## Description

`apps/addressr-deployment` produces build artefacts that must never enter git. `tfplan.json` carries `TF_VAR_aws_secret_key`, the [ADR-024](../../decisions/024-origin-gateway-auth-header-enforcement.accepted.md) proxy-auth secret and the Cloudflare API token **in cleartext**, and this repository is **public**. An ignore rule silently dropped from `.gitignore` therefore turns the next deploy into a commit offer for a file full of live credentials.

That is a security control. It is asserted in three independent places and stated as a contract in none of them.

| Site                                                 | Reach                                                                                                                                                                                            | What it cannot see                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `test/js/__tests__/deploy-artefact-ignores.test.mjs` | Rule-level. Runs `git check-ignore --no-index` over a named artefact list, so it is state-independent and covers artefacts a PLAN_ONLY run cannot produce — `plan.out`, the task-definition JSON | Whether `deploy.sh` writes somewhere the list does not name                                     |
| `test/js/__tests__/deploy-sh-plan-only.test.mjs`     | Behavioural. Runs `deploy.sh` in an isolated tracked-only copy and asks whether the repo's rules would cover each artefact actually produced                                                     | Artefacts of code paths a PLAN_ONLY run does not reach; in-place modification of a tracked file |
| `test/js/__tests__/schedule-hook-wiring.test.mjs`    | Uses the same `ls-files` + `check-ignore` pair for a different subject                                                                                                                           | Not about deployment artefacts at all — it is a third restatement of the same technique         |

Each file records **its own** reach, honestly, in a comment. None records the division of labour, and no comment can: the contract is the relationship _between_ them, and a comment lives inside one.

No decision record mentions `tfplan`, `gitignore` or `cleartext`. Grepped across all 53.

## Why this is owed a record rather than left as comments

Three restatement sites of an unwritten contract is the condition under which a decision is owed. The evidence that it rots is not hypothetical:

- `.gitignore`'s own comments record two rules silently stripped in one day, during the 2026-08-10 directory moves. Both were caught by accident of pattern shape, not by design — the unanchored `*.zip` survived because it carries no mid-pattern separator.
- The behavioural site was, until [P123](../closed/123-engine-floor-flake-skips-the-release-job-and-nothing-says-so.md)'s second pass, **examining nothing at all** on any machine that had run `npm run deploy:prod`. It imported the artefacts it was supposed to judge into its own baseline and filtered them out as pre-existing. A risk review found that, not a test.

So the failure mode is established: a site weakens, the other two do not notice because nothing says what each is responsible for, and the green is read as coverage of the whole contract.

## The deliverable is an ADR, not a code fix

Stated explicitly because it is the thing most likely to go wrong. If this ticket's deliverable is recorded as a code change it will close on one, and the contract will still be unwritten — which is exactly the outcome the ticket exists to prevent. The precedent is P033, which named its deliverable as a convention in `AGENTS.md` and split the remainder into tracked successors rather than folding it into a code fix.

## Investigation Tasks

- [ ] Write the ADR. It must state: what the artefacts are and why they are dangerous specifically here; the division of labour across the three sites; and **what each site cannot reach**, since that is the half a reader will otherwise assume away.
- [ ] Resolve the three files' comments against each other and against the ADR. Where a comment now restates the contract, point it at the record instead — three copies of a contract is how they drift.
- [ ] Decide whether `schedule-hook-wiring.test.mjs` belongs in the contract at all, or is merely a fourth user of the same `ls-files`/`check-ignore` technique. If the latter, say so in the ADR so it is not later mistaken for coverage.
- [ ] Record whether the artefact list in the rule-level site is meant to be exhaustive. If it is, something must fail when `deploy.sh` writes a path it does not name; if it is not, the ADR should say what bounds it.
- [ ] Check whether the `deployment/` trailing-slash subtlety needs stating: the rule matches directories, so what a file-level check actually sees is `deployment/package.json`. Two sites already record this separately, which is itself a small instance of the drift this ticket is about.

## Notes

Captured during [P123](../closed/123-engine-floor-flake-skips-the-release-job-and-nothing-says-so.md)'s second pass, on an architect-gate advisory. The advisory's argument for deferring it out of that commit is worth keeping: the ADR should describe the contract **as it will stand**, not as it stood while one of its three assertions was vacuous.

Inflow discipline: a capture-time hang-off check was run against the open backlog and returned PROCEED_NEW. The closest candidate was [P116](116-nine-workflow-pins-imply-coverage-they-cannot-provide-and-say-nothing-about-it.md) (workflow pins implying coverage they cannot provide), rejected on three grounds — disjoint file population, and P116's remedy is a per-file header comment, which is precisely the remedy this ticket reports as already applied and insufficient. [P076](076-adr-confirmation-items-can-be-prescribed-and-never-implemented.md) is the inverse shape: prescribed-but-not-implemented, where this is implemented-but-never-prescribed.
