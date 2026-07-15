# Problem 004: release:watch Script Reports False Negative

**Status**: Known Error
**Reported**: 2026-04-04
**Priority**: 4 (Low) — Impact: Minor (2) x Likelihood: Unlikely (2)

## Description

The `scripts/release-watch.sh` script reports "Deploy job: skipped (no new version published)" even when the CI pipeline successfully published to npm, deployed via Terraform, and passed smoke tests. This misleading output caused unnecessary investigation to confirm the release actually succeeded.

## Symptoms

- `npm run release:watch` output ends with "Deploy job: skipped (no new version published)"
- Actual CI logs show: publish succeeded, Terraform applied (2 added, 1 changed, 2 destroyed), smoke test returned `{"status":"healthy","version":"2.0.1"}`
- npm registry confirms v2.0.1 was published

## Workaround

After `release:watch` reports "no new version published", verify the actual outcome by checking:

1. `npm view @mountainpass/addressr version` — confirms npm publish
2. `gh run view <run-id> --log | grep "Smoke test"` — confirms deploy and health

## Impact Assessment

- **Who is affected**: Developers running the release pipeline
- **Frequency**: Every release that goes through the changeset PR flow
- **Severity**: Low — cosmetic/misleading output only, no functional impact
- **Analytics**: N/A

## Root Cause Analysis

### Confirmed Root Cause

`scripts/release-watch.sh` lines 142-143 (prior to fix) queried for a job named "Deploy":

```bash
DEPLOY_JOB=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | select(.name | contains("Deploy")) | .conclusion' 2>/dev/null || echo "skipped")
```

No such job exists in `.github/workflows/release.yml`. The release workflow is a single job named `release` that contains a step called "Deploy new version" (Terraform apply) plus "Smoke test production" — both gated on `steps.changesets.outputs.published == 'true'`.

Because the `contains("Deploy")` select matched no job, `DEPLOY_JOB` was empty. The `${DEPLOY_JOB:-skipped (no new version published)}` default at line 148 then printed the false-negative message on every run, regardless of whether a publish actually occurred.

Verified via `gh run view <id> --json jobs`:

- Run 24435520535 (real publish): step "Deploy new version" conclusion = `success`
- Run 24485702660 (no publish): step "Deploy new version" conclusion = `skipped`

### Investigation Tasks

- [x] Read `scripts/release-watch.sh` and trace the deploy detection logic.
- [x] Identify the specific condition that triggers the false "skipped" message — nonexistent job name in the `gh run view` query.
- [x] Create reproduction test — query step-level conclusions of known historical runs confirms the new logic distinguishes success from skipped (see Fix Released).
- [x] Implement permanent fix — query the Deploy step inside the release job instead of searching for a nonexistent "Deploy" job.

## Fix Released

**Date**: 2026-04-19

Replaced the broken job-name lookup with a step-level conclusion query:

```bash
DEPLOY_STATUS=$(gh run view "$RUN_ID" --json jobs \
  --jq '.jobs[] | select(.name == "release") | .steps[] | select(.name == "Deploy new version") | .conclusion' 2>/dev/null || echo "")
```

Summary output now distinguishes three outcomes:

- `success` — "Deploy step: success (Terraform applied, smoke test passed)" / "The new version has been published to npm and deployed to AWS."
- `skipped` — "Deploy step: skipped (no new version published by changesets)" / "No new version published (no actionable changesets). The release job completed but no deploy occurred."
- anything else — "Deploy step: <status>" / "Deploy step status: <status> — check the workflow logs."

Renamed the local variable `DEPLOY_JOB` → `DEPLOY_STATUS` to reflect reality (it's a step status, not a job conclusion).

**Verification path**: Run `npm run release:watch` on the next actual release PR. Expected message: "Deploy step: success (Terraform applied, smoke test passed)".

## Related

- `scripts/release-watch.sh`
- `.github/workflows/release.yml` — changesets action + Deploy new version step
- Architect review 2026-04-19 — PASS, no ADR conflicts
