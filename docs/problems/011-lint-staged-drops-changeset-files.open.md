# Problem 011: lint-staged silently drops `.changeset/*.md` files

**Status**: Open
**Reported**: 2026-04-15
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Possible (2)

## Description

Addressr's pre-commit hook runs `lint-staged`. If the staged fileset includes a path (e.g. `.changeset/p*.md`) that doesn't match any entry in the lint-staged configuration, the file is silently removed from the commit — the commit succeeds, but the working-tree content is _not_ included.

This is undocumented behaviour of lint-staged and confused the P009 release cycle on 2026-04-15. A changeset file was staged alongside code in commit `ef66d39`, but after lint-staged ran, only the code made it into the commit. The changesets GitHub Action then saw "No changesets found" on the next release and shipped no version bump. Recovery took an extra commit (`e7c9c37`) and an extra release pipeline run.

## Symptoms

- `git add .changeset/foo.md && git commit -m "..."` finishes successfully, but `git show --stat HEAD` does not list `.changeset/foo.md`.
- `npx changeset status` (locally or in CI) says "No changesets found" despite the file existing in the working tree.
- The changesets/action opens no version PR on push; release runs go straight to `changeset publish` with nothing to publish.

## Workaround

After any commit that touches `.changeset/`, run `git show --stat HEAD | grep '\.changeset/'` to confirm the file landed. If it didn't, re-stage and commit the changeset file alone (lint-staged leaves it untouched when it's the only staged file).

## Impact Assessment

- **Who is affected**: Every developer (or agent) landing a changeset-driven release. Silent data loss in version-control metadata.
- **Frequency**: Once per release-cycle at most, but every missed changeset costs a full round-trip (push → failed release diagnosis → recovery commit → re-push).
- **Severity**: Moderate. No user-facing regression, but delays releases and can mask intended version bumps indefinitely if not spotted.
- **Analytics**: N/A — development-workflow concern.

## Root Cause Analysis

### Preliminary Hypothesis

lint-staged's design: it runs the configured tasks on _matched_ files, then re-stages only the matched files. If a path doesn't match any config entry, lint-staged does not strip it per se — but if `lint-staged` is invoked with an explicit glob that excludes the path, OR if a task modifies and re-stages a narrower set, the original stage can be effectively overwritten.

The exact drop path in this repo has not yet been diagnosed. Need to read the lint-staged config (`package.json` `lint-staged` key or `.lintstagedrc.*`) and the `husky` pre-commit hook to locate the drop.

### Fix Strategy (to be confirmed)

Options:

1. **Add `.changeset/**/\*.md`to the lint-staged match set** with a no-op task (e.g.`"prettier --write"`or just`cat`) so the files are retained. Simplest fix.
2. **Add a post-commit guard** that diffs the staged fileset (captured in `pre-commit` via `git diff --cached --name-only`) against `HEAD^..HEAD` and errors if anything vanished.
3. **Pre-commit abort if staged `.changeset/*.md` would be dropped** — computed before lint-staged runs.

Leaning toward (1) as cheapest, but (2) is a more general guard against this class of silent-drop bug for other paths too.

### Investigation Tasks

- [ ] Read the lint-staged config and confirm which entry (if any) is filtering out `.changeset/*.md`.
- [ ] Write a regression test: a commit that stages only `.changeset/test.md` should retain it in the resulting commit. Could live as a bats test under `.claude/hooks/test/` or as a standalone shell test.
- [ ] Choose between options 1 and 2 above and implement.
- [ ] Update `docs/BRIEFING.md` entry to point at this ticket and note the fix once landed.

## Related

- [Problem 009](009-upstream-backends-openly-callable-bypassing-rapidapi.closed.md) — discovery context; lost the changeset on commit `ef66d39` during P009 v2.1.4 release.
- [Problem 003](003-npm-version-lockfile-drift.open.md) — unrelated lockfile-drift issue, but same class of "commit metadata silently wrong" concern.
- Memory file `feedback_lint_staged_changeset.md` — session-level reminder to `git show --stat HEAD` after any `.changeset/` commit.
