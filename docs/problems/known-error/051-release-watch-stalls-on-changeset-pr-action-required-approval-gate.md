# Problem 051: release:watch stalls on the changesets release PR's action_required approval gate

**Status**: Known Error
**Reported**: 2026-07-18
**Priority**: 10 (Medium) — Impact: 2 (Minor — maintainer-only friction, manual workaround exists, does not break the release itself) × Likelihood: 5 (Almost Certain — fired on every release observed) — derived at capture
**Origin**: internal
**Effort**: S (M → S — investigation confirmed a single-file ~12-line insert in `scripts/release-watch.sh`; no workflow or settings changes needed; P047 re-rate)
**WSJF**: 20.0 — (10 × 2.0 Known Error) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`release:watch` stalls because the changesets release PR (`changeset-release/master`, titled "chore: release") has its CI runs gated as `action_required` — a human must approve them in the GitHub Actions UI before they run. `release:watch` waits (up to ~5 min) for a check named `build` that never appears, because the release-branch workflow run sits at `conclusion=action_required` until approved, then it times out.

Observed on BOTH releases this session: v3.0.0 (PR #505) and v3.0.1 (PR #506). Manual workaround each time: `gh api -X POST repos/mountain-pass/addressr/actions/runs/<run_id>/approve` before merging (the run shows `conclusion=action_required` in `gh run list --branch changeset-release/master`), after which the checks run and the merge proceeds. The post-merge Release run on `master` runs automatically (no approval gate).

Recurring release-path instability. Candidate fix: make `scripts/release-watch.sh` detect the `action_required` run state on the release PR and either auto-approve via the API or surface a clear "approve this run" instruction with the exact `gh api` command, rather than silently timing out on a missing `build` check.

## Symptoms

- `release:watch` prints "Waiting for build check to complete..." then exits 1 after ~5 minutes with "Build check did not complete within 5 minutes" on every release.
- `gh run list --branch changeset-release/master` shows the release PR's CI run at `completed/action_required`; no `build` check ever reaches SUCCESS/FAILURE.
- After a manual `gh api -X POST .../actions/runs/<id>/approve`, the same run executes and passes, and `release:watch` proceeds normally.

## Workaround

`gh api -X POST repos/mountain-pass/addressr/actions/runs/<run_id>/approve` on the `action_required` release-branch run, then re-run `release:watch` (or merge).

## Impact Assessment

- **Who is affected**: addressr-maintainer (release operator)
- **Frequency**: every release
- **Severity**: low — manual step, no consumer/service impact
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

**Confirmed 2026-07-18.** The repo's GitHub Actions approval policy is set to require approval for first-time contributors (`gh api repos/mountain-pass/addressr/actions/permissions/fork-pr-contributor-approval` → `{"approval_policy":"first_time_contributors"}`). GitHub applies this gate to `pull_request` workflow runs whose triggering actor is `github-actions[bot]` — the changesets action pushes `changeset-release/master` and opens the release PR as the bot, and the bot never graduates out of the gated class. Every release-PR CI run therefore lands at `conclusion=action_required` with no jobs started, so the `build` check `release:watch` polls for never reaches a terminal state and the script exits 1 after its 5-minute loop.

**Evidence** (`gh api 'repos/mountain-pass/addressr/actions/runs?branch=changeset-release/master'`, 2026-07-18):

- Gated runs, all `completed/action_required`, triggering actor `github-actions[bot]`: 29617620780, 29615476815 (v3.0.1 / PR #506), 29478983987, 29478401777 (v3.0.0 / PR #505).
- The same runs after manual approval show triggering actor `tompahoward` and `completed/success`: 29625429322, 29625127275, 29623005178.

**Reproduction**: open any changesets release PR (any commit with a changeset pushed to master causes the bot to open one) and run `gh run list --branch changeset-release/master` — the fresh run shows `completed/action_required`. `npm run release:watch` then times out at step 2. Regression coverage note: the repo has no shell-script test harness and mocking the `gh` CLI for one guard is not worth the harness cost; verification is next-release exercise of the fix (the approve step logs each approved run id, giving an observable pass/fail signal per release).

### Investigation Tasks

- [x] Confirm whether the `action_required` gate is a repo setting — yes: the first-time-contributor approval policy, applied by GitHub to github-actions[bot]-triggered runs. Reconfiguring it was rejected: loosening the policy weakens the gate for ALL fork PRs, while the stall is specific to the bot-authored release PR. Scoped script-side approval keeps the global posture.
- [x] Decide auto-approve vs instruct-only for release-watch.sh — **auto-approve**, scoped to the release PR's own head-branch runs. Rationale: (a) release:watch exists to make the release an unattended deterministic operator step (JTBD-400 "each operator step is an artefact, not tribal knowledge"); instruct-only still stalls unattended flows; (b) the gated branch is generated by the repo's own release workflow from commits already on master — only write-access accounts can alter it, so the approval is a rubber stamp the maintainer already performs mechanically every release; (c) the script runs under the operating maintainer's own gh credentials — the approving actor is the same human who would click approve in the UI.
- [x] Create reproduction/regression coverage — reproduction procedure documented above; automated regression coverage waived (no shell-test harness in repo; see note).

## Fix Strategy

Insert an approval step in `scripts/release-watch.sh` between step 1 (find the release PR) and step 2 (wait for the `build` check): fetch the PR's `headRefOid` via `gh pr view`, list `pull_request` runs on the head branch via `gh api`, and approve ONLY runs whose `head_sha` matches the PR's `headRefOid` AND `conclusion == "action_required"`, via `gh api -X POST repos/<repo>/actions/runs/<id>/approve`, echoing each approved run URL for the release audit trail. A failed approve call (e.g. 403) is a hard stop that prints the manual workaround command, not a silent fall-through into the timeout. The SHA binding (architect review 2026-07-18) prevents the branch-name filter from matching a fork PR that happens to share the branch name — approval is bound to the exact commit the release PR points at, so the repo-wide first-time-contributor approval gate is untouched for all other PRs. The existing 5-minute build-check wait loop then observes the now-running checks unchanged. No workflow-file or repo-settings changes.

**Architect verdict** (2026-07-18): PASS with the SHA-scoping fix applied; no new ADR needed — bug fix making the ADR-001 (risk-gated release:watch) workflow function deterministically; auto-approve sits inside the risk-gated entry point (git-push-gate.sh still gates release:watch itself). Auto-approve-vs-instruct-only resolution recorded in Investigation Tasks above per architect advisory.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P004 (release-watch false-negative — sibling release:watch robustness); P052 (red-master push guard blocks CI-fix pushes — sibling release-path friction)

## Related

(captured via /wr-itil:capture-problem; expand at next investigation)
