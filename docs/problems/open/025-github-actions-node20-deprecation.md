# Problem 025: GitHub Actions using Node.js 20 runtime are deprecated

**Status**: Open
**Reported**: 2026-04-19
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

## Description

CI release runs emit GitHub's Node.js 20 deprecation warning for multiple third-party actions pinned in `.github/workflows/release.yml`:

- `actions/cache@v4` (flagged in the `build-and-test` job)
- `changesets/action@v1.4.5` (flagged in the `release` job)

GitHub's announced timeline ([changelog 2025-09-19](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)):

- **2026-06-02**: actions forced to run on Node.js 24 by default. The `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var becomes a no-op on that date.
- **2026-09-16**: Node.js 20 removed from the runner entirely. Any action that still declares `runs.using: node20` and has not published a Node 24 build will fail to start.

After the v2.3.0 release on 2026-04-19, the warnings surfaced in every CI run. They are advisory today but will become hard failures on those dates.

## Symptoms

- Deprecation warning annotations on every CI run: "Node.js 20 actions are deprecated. The following actions are running on Node.js 20 and may not work as expected: …"
- Release workflow `release:watch` and `push:watch` both surface the warning.
- No current functional failure.

## Workaround

None needed immediately. The warnings do not block CI. Release pipeline continues to publish + deploy + smoke-test as of 2026-04-19.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer persona (J7 — Ship releases reliably from trunk). After 2026-09-16, consumers indirectly via release cadence: if CI breaks and cannot publish, patch/minor releases cannot ship until the actions are unpinned or replaced.
- **Frequency**: Every CI run emits warnings today. Hard failure would begin on one of the two deadlines above.
- **Severity**: Moderate — release pipeline breakage on a scheduled-known date. Ample runway to fix.
- **Analytics**: N/A.

## Root Cause Analysis

GitHub is retiring the Node.js 20 runtime that JavaScript actions can declare in their `action.yml` as `runs.using: node20`. Action authors must republish with `runs.using: node24` before the deadlines. Action consumers (us) must upgrade to versions that ship a Node 24 build.

Pinned versions in `.github/workflows/release.yml`:

- `actions/cache@v4` — v4 is the latest major. `actions/cache` will release a v4.x patch with `runs.using: node24` before the deadline, or a v5 major. We need to track their release and bump the pin.
- `changesets/action@v1.4.5` — changesets/action is a third-party action; they will publish an updated version. Track their release and bump.

First-party GitHub actions already pinned in the workflow are already on current major versions (`actions/checkout@v5`, `actions/setup-node@v5`) and are expected to ship Node 24 updates uneventfully.

### Investigation Tasks

- [ ] Track `actions/cache` GitHub releases for a Node 24 build. Bump the pin when available.
- [ ] Track `changesets/action` GitHub releases for a Node 24 build. Bump the pin (and note: `v1.4.5` is the current latest tag — upstream may jump to v2.x).
- [ ] As a stop-gap before the 2026-06-02 cutover, set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at the workflow or job level to opt in early and confirm both actions still work on Node 24. This becomes a no-op after the cutover but validates the transition.
- [ ] Verify all other actions used in `.github/workflows/*.yml` are on versions that support Node 24 (`actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@*`, etc.). The deprecation warning currently only calls out `actions/cache@v4` and `changesets/action@v1.4.5`, but the full survey is worth doing.

## Fix Strategy (proposed)

Two-stage:

1. **Now** (2026-04-19 onward): add `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` to `.github/workflows/release.yml` job envs. This opts in to Node 24 early, surfaces any incompatibility before the 2026-06-02 cutover. Safe to revert if something breaks.
2. **When upstream ships Node-24-compatible releases**: bump the pinned versions of `actions/cache` and `changesets/action` to the new tags. Remove the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var once all pinned actions declare `runs.using: node24` natively.

Alternative: wait and bump pinned versions only when upstream releases Node-24-compatible versions. Simpler but leaves no validation window before the runtime is forced. Rejected — the env-var opt-in is cheap insurance.

## Related

- GitHub Actions changelog: [Deprecation of Node.js 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — workflow file containing the pinned actions
- CI annotation output from release run `72041445878` (2026-04-19) first surfaced the warning against the repo's own workflow.
