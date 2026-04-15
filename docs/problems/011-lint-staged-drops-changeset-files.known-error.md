# Problem 011: P009 changeset missing from commit ef66d39

**Status**: Known Error
**Reported**: 2026-04-15
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Possible (2)

## Description

On 2026-04-15 the P009 release cycle failed because the `.changeset/p009-gateway-auth-enforcement.md` file was not present in commit `ef66d39`. The changesets GitHub Action saw "No changesets found" on the next release and shipped no version bump. Recovery took an extra commit (`e7c9c37`) and an extra release pipeline run.

The recovery commit's diagnosis was that lint-staged had silently dropped the file because `.changeset/*.md` was not in its match globs. **Subsequent literal replay of `ef66d39` (same lint-staged 16.4.0, same config, same fileset) has disproved that diagnosis** — lint-staged retains the file. The real cause was that the changeset was never staged before commit. The post-hoc "lint-staged dropped it" explanation was a wrong guess that shaped the original ticket. This ticket has been revised accordingly.

## Symptoms

- A commit that an agent or developer intended to ship with a changeset lands without the `.changeset/*.md` file.
- `npx changeset status` (locally or in CI) says "No changesets found" despite the file existing in the working tree (un-staged or in a later commit).
- The changesets/action opens no version PR on push; release runs go straight to `changeset publish` with nothing to publish.

## Workaround

After any commit intended to ship a changeset, run `git show --stat HEAD | grep '\.changeset/'` to confirm the file landed. If it didn't, re-stage and commit the changeset file. This check is also captured in the session-level memory `feedback_lint_staged_changeset.md` so every future agent is reminded.

## Impact Assessment

- **Who is affected**: Every developer (or agent) landing a changeset-driven release. Silent data loss in version-control metadata.
- **Frequency**: Once per release-cycle at most, but every missed changeset costs a full round-trip (push → failed release diagnosis → recovery commit → re-push).
- **Severity**: Moderate. No user-facing regression, but delays releases and can mask intended version bumps indefinitely if not spotted.
- **Analytics**: N/A — development-workflow concern.

## Root Cause (Confirmed)

**The changeset was never staged before commit `ef66d39`.** lint-staged did not drop it.

Evidence from literal replay on 2026-04-15:

1. Cloned the repo to `/tmp/p011-replay`, checked out `ef66d39^`, ran `npm ci` (lint-staged 16.4.0 — same version as the original run, same `package-lock.json`).
2. Applied the exact ef66d39 diff with `git cherry-pick -n ef66d39`. Manually added `.changeset/p009-gateway-auth-enforcement.md` with a realistic body.
3. Ran `npx genversion --es6 --semi version.js` so eslint could resolve `../version` during lint-staged.
4. Ran `npx lint-staged`. Result: all 9 files (including the changeset) completed their tasks and were re-staged. `git diff --cached --name-only` after lint-staged still listed `.changeset/p009-gateway-auth-enforcement.md`.
5. `*.{json,css,md}` in the lint-staged config matches `.changeset/foo.md` via micromatch's basename handling. prettier ran on it and re-staged it.

The recovery commit `e7c9c37`'s diagnosis — "silently removed by lint-staged because `.changeset/*.md` is not in its match globs" — was an incorrect guess. The most likely actual cause: the authoring agent did not run `git add .changeset/p009-gateway-auth-enforcement.md` before `git commit`, or ran `git add -u` (which only stages tracked modifications, excluding new files in untracked directories).

## Fix Strategy

Permanent guardrails (ordered by cost):

1. **Session-level reminder in memory** — already in place via `feedback_lint_staged_changeset.md`: every agent is reminded to `git show --stat HEAD | grep '\.changeset/'` after any commit intended to ship a changeset. This is the primary defense.
2. **Regression test** — `test/precommit/changeset-preservation.test.mjs` replays the ef66d39-class scenario and asserts the changeset survives the pre-commit hook. Runs via `npm run test:precommit`. Guards against any future lint-staged / husky change that would actually drop a staged changeset.
3. **(Not implemented, noted for future)** A pre-push hook that parses commit messages on the outgoing range for release-intent keywords (`feat`, `fix`, or explicit changeset language) and warns if no `.changeset/*.md` file is touched. Deferred as heuristic and error-prone; the session memory check is cheaper and already effective.

### Investigation Tasks

- [x] Replay `ef66d39` with era lockfile — done; lint-staged retains the changeset.
- [x] Write regression test at `test/precommit/changeset-preservation.test.mjs` — done; passes on current codebase.
- [x] Correct the root-cause diagnosis in this ticket.
- [x] Wire the regression test into `npm run test:precommit`.
- [ ] Update `docs/BRIEFING.md` to reflect the corrected diagnosis (retrospective).

## Related

- [Problem 009](009-upstream-backends-openly-callable-bypassing-rapidapi.closed.md) — discovery context; lost the changeset on commit `ef66d39` during P009 v2.1.4 release.
- [Problem 003](003-npm-version-lockfile-drift.open.md) — unrelated lockfile-drift issue, but same class of "commit metadata silently wrong" concern.
- Memory file `feedback_lint_staged_changeset.md` — session-level reminder to `git show --stat HEAD` after any `.changeset/` commit.
