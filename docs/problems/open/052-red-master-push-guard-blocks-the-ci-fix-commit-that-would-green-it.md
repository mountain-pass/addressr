# Problem 052: red-master push guard blocks the CI-fix commit that would green it

**Status**: Open
**Reported**: 2026-07-18
**Priority**: 6 (Medium) — Impact: 2 (Minor — maintainer-only, `--no-verify` workaround exists) × Likelihood: 3 (Possible — only when a pushed commit breaks CI and needs a follow-up fix) — derived at capture
**Origin**: internal
**Effort**: M — derived at capture (harden the push-gate so a commit whose HEAD supersedes the failing run is allowed)
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`push:watch` (and `git push` via the push-gate hook) refuses to push when master's latest CI run concluded `failure`. But a CI-fix commit can only turn master green by being pushed — the guard blocks the very commit that would resolve the red state. Chicken-and-egg.

Encountered this session on v3.0.1: commit `df9086a` pushed a lockfile that broke CI's `npm ci`; the fix commit `242d186` was then blocked by the guard because the prior run was still red. Escape used: `git push --no-verify origin master` for the CI-fix commit (the user has authorised this framing explicitly — "Push is allowed for commits that just fix the broken CI").

The guard's intent (don't pile changes onto a red master) is sound, but it has no carve-out for the fix that greens it. Candidate fix: allow the push when the failing run's head SHA is an ancestor of the pushing HEAD (i.e. the new commit supersedes the run that failed), or add an explicit CI-fix affordance that does not require the blunt `--no-verify` (which also skips the risk-score and external-comms gates).

## Symptoms

(deferred to investigation)

## Workaround

`git push --no-verify origin master` for a commit that only fixes the broken CI (user-authorised framing). Note this also bypasses the risk-score + external-comms push gates, so it should be reserved for genuine CI-fix commits.

## Impact Assessment

- **Who is affected**: addressr-maintainer (release/push operator)
- **Frequency**: only when a push breaks CI and needs a follow-up fix
- **Severity**: low — workaround exists but is blunter than ideal (skips all push gates, not just the red-master check)
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

### Investigation Tasks

- [ ] Locate the red-master check in the push-gate hook (`.claude/hooks/git-push-gate.sh` or equivalent)
- [ ] Design a carve-out: allow when the failing run's head SHA is an ancestor of the pushing HEAD, OR a scoped CI-fix affordance that still runs the risk + external-comms gates
- [ ] Create regression coverage

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P051 (release:watch stalls on action_required gate — sibling release-path friction)

## Related

(captured via /wr-itil:capture-problem; expand at next investigation)
