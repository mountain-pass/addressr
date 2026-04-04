# Problem 004: release:watch Script Reports False Negative

**Status**: Open
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

### Preliminary Hypothesis

The script likely checks `steps.changesets.outputs.published` or parses `gh run watch` output to detect whether the deploy step ran. The changesets action first reports "No changesets found, attempting to publish any unpublished packages" (because the changeset was consumed during the version PR). The script may be matching on the "No changesets found" message and concluding nothing was published, even though the publish command runs successfully afterward.

### Investigation Tasks

- [ ] Read `scripts/release-watch.sh` and trace the deploy detection logic
- [ ] Identify the specific condition that triggers the false "skipped" message
- [ ] Create reproduction test
- [ ] Create INVEST story for permanent fix

## Related

- `scripts/release-watch.sh`
- `.github/workflows/release.yml` — changesets action step
