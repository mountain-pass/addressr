# Problem 051: release:watch stalls on the changesets release PR's action_required approval gate

**Status**: Open
**Reported**: 2026-07-18
**Priority**: 10 (Medium) — Impact: 2 (Minor — maintainer-only friction, manual workaround exists, does not break the release itself) × Likelihood: 5 (Almost Certain — fired on every release observed) — derived at capture
**Origin**: internal
**Effort**: M — derived at capture (edit `scripts/release-watch.sh` to detect the action_required run + auto-approve or emit the exact gh api command)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`release:watch` stalls because the changesets release PR (`changeset-release/master`, titled "chore: release") has its CI runs gated as `action_required` — a human must approve them in the GitHub Actions UI before they run. `release:watch` waits (up to ~5 min) for a check named `build` that never appears, because the release-branch workflow run sits at `conclusion=action_required` until approved, then it times out.

Observed on BOTH releases this session: v3.0.0 (PR #505) and v3.0.1 (PR #506). Manual workaround each time: `gh api -X POST repos/mountain-pass/addressr/actions/runs/<run_id>/approve` before merging (the run shows `conclusion=action_required` in `gh run list --branch changeset-release/master`), after which the checks run and the merge proceeds. The post-merge Release run on `master` runs automatically (no approval gate).

Recurring release-path instability. Candidate fix: make `scripts/release-watch.sh` detect the `action_required` run state on the release PR and either auto-approve via the API or surface a clear "approve this run" instruction with the exact `gh api` command, rather than silently timing out on a missing `build` check.

## Symptoms

(deferred to investigation)

## Workaround

`gh api -X POST repos/mountain-pass/addressr/actions/runs/<run_id>/approve` on the `action_required` release-branch run, then re-run `release:watch` (or merge).

## Impact Assessment

- **Who is affected**: addressr-maintainer (release operator)
- **Frequency**: every release
- **Severity**: low — manual step, no consumer/service impact
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

### Investigation Tasks

- [ ] Confirm whether the `action_required` gate is a repo setting ("Require approval for all PRs" / first-time-contributor gating on the github-actions bot branch) that could be reconfigured instead of scripted around
- [ ] Decide auto-approve vs instruct-only for release-watch.sh (auto-approve removes a deliberate security checkpoint)
- [ ] Create reproduction/regression coverage

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P004 (release-watch false-negative — sibling release:watch robustness); P052 (red-master push guard blocks CI-fix pushes — sibling release-path friction)

## Related

(captured via /wr-itil:capture-problem; expand at next investigation)
