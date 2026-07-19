# Problem 025: GitHub Actions using Node.js 20 runtime are deprecated

**Status**: Verification Pending
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

- [x] Track `actions/cache` GitHub releases for a Node 24 build. Bump the pin when available. _(2026-07-19: v5.0.0 ships `runs.using: node24`; v6 line is an internal ESM migration, inputs unchanged. Bumped `v4` → `v6`.)_
- [x] Track `changesets/action` GitHub releases for a Node 24 build. Bump the pin (and note: `v1.4.5` is the current latest tag — upstream may jump to v2.x). _(2026-07-19: v1.6.0 upgraded to Node 24 LTS; latest stable v1.9.0 declares `runs.using: node24`. v1.5–v1.9 are minor/patch only — `publish`/`version` inputs and `hasChangesets`/`published` outputs, which the P044/RFC-002 fail-loud assertion consumes, all retained. v2.0.0 is still pre-release (`-next.3`). Bumped `v1.4.5` → `v1.9.0`.)_
- [x] ~~As a stop-gap before the 2026-06-02 cutover, set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`~~ _(Obsolete — never applied; the env var became a no-op at the 2026-06-02 cutover, which has now passed. CI has been running with actions forced onto Node 24 since then without failures, which itself validates the transition.)_
- [x] Verify all other actions used in `.github/workflows/*.yml` are on versions that support Node 24. _(2026-07-19 full survey via each tag's `action.yml` `runs.using` field: `actions/checkout@v5` node24 ✓, `actions/setup-node@v5` node24 ✓, `devcontainers/ci@v0.3` node24 ✓ — all already current. Three ADDITIONAL offenders found in `reusable-update.yml`: `actions/checkout@v3` (node16), `actions/setup-node@v3` (node16), `aws-actions/configure-aws-credentials@v4` (node20). All three bumped — checkout/setup-node to `v5` matching `release.yml`; configure-aws-credentials to `v6` (v5's breaking change is invalid-boolean-input handling, not hit by our string-only `role-to-assume`/`aws-region` usage; v6's breaking change is the Node 24 runtime itself; ADR-034/035 OIDC design unchanged).)_

**Reproduction test**: not applicable as a local failing test — the defect surface is GitHub's hosted runner runtime, observable only as CI annotations. The verification signal is the absence of Node deprecation annotations on the next CI run (see RFC-005 verification clause).

## Fix Strategy

Executed 2026-07-19 as stage 2 only of the original two-stage proposal — stage 1 (the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` early opt-in) was never applied and became a no-op at the 2026-06-02 cutover, so it was dropped as obsolete. The fix is the five pin bumps scoped in [RFC-005](../../rfcs/RFC-005-bump-node20-era-action-pins-to-node24-builds.proposed.md): `actions/cache@v4→v6` (×2, `release.yml`), `changesets/action@v1.4.5→v1.9.0` (`release.yml`), `actions/checkout@v3→v5`, `actions/setup-node@v3→v5`, `aws-actions/configure-aws-credentials@v4→v6` (all `reusable-update.yml`). Companion mechanical amendment: ADR-007's Confirmation criterion loosened from the verbatim `changesets/action@v1.4.5` pin to version-agnostic `changesets/action` (v1.x) (architect-reviewed).

**Release vehicle**: master push of the fix commit itself — CI-workflow-config only, no npm changeset (no package behaviour changes).

## Related

- GitHub Actions changelog: [Deprecation of Node.js 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — workflow file containing the pinned actions
- CI annotation output from release run `72041445878` (2026-04-19) first surfaced the warning against the repo's own workflow.
- **Upstream report pending** -- false positive; root cause is GitHub's platform-wide Node 20 retirement and every affected upstream action has already shipped a Node 24 build (verified 2026-07-19) — nothing to report upstream.

## Fix Released

Landed on master 2026-07-19 in the `fix(ci)` commit that ships this transition (Refs: RFC-005) — CI-workflow-config only, no npm changeset. Five action pins bumped to Node 24 builds (`actions/cache@v6` ×2, `changesets/action@v1.9.0`, `actions/checkout@v5`, `actions/setup-node@v5`, `aws-actions/configure-aws-credentials@v6`); ADR-007 Confirmation loosened to version-agnostic in the same commit. Takes effect on the next CI run after push (orchestrator owns push cadence). Awaiting user verification: next `release.yml` run AND next `reusable-update.yml` state-update cron run both green with zero Node deprecation annotations.

## RFCs

| RFC     | Status   | Title                                          |
| ------- | -------- | ---------------------------------------------- |
| RFC-005 | proposed | Bump Node 20-era action pins to Node 24 builds |
