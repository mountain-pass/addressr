# Problem 044: changesets/action swallows a failed npm publish → deploy silently skips while the release job goes green

**Status**: Closed
**Reported**: 2026-05-25
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Unlikely (2)
**Origin**: internal
**Effort**: S
**WSJF**: 6.0
**Type**: technical

## Description

The release pipeline gates production deploy on `if: steps.changesets.outputs.published == 'true'` (`.github/workflows/release.yml` Deploy step). During the P042 worker cutover, the `NPM_TOKEN` GH secret was expired, so `changeset publish` failed with `E404 Not Found - PUT https://registry.npmjs.org/@mountainpass%2faddressr`. But `changesets/action@v1.4.5` did **not** propagate that failure: the `release` job completed **green**, `published` stayed `false`, and the Deploy + Smoke steps were silently **skipped**. The operator's only signal that the deploy didn't happen was the _absence_ of a cutover — the workflow itself reported success.

This is distinct from P039 (deploy _coupled_ to publish). P039 is about the coupling; P044 is about the **silent-green failure mode** of that coupling: a publish can fail (bad token, registry outage, scope change) and the release looks successful while no deploy occurs.

## Symptoms

- Release workflow run shows `release` job = success, but the `Deploy new version` / `Wait for deployment to stabilize` / `Smoke test production` steps are `skipped`.
- `package.json` version is ahead of the npm-published version (e.g. master at 2.6.10 while npm latest = 2.6.9) with no failed/red run to explain it.
- Production is not updated despite a "successful" release.
- Buried in the `Create Release Pull Request or Publish to npm` step log: `🦋 error ... E404` (or other publish error), with the job still green.

## Workaround

Manual post-release check: compare `package.json` version on master against `npm view @mountainpass/addressr version` after each release run; if master is ahead with a green run, re-run the publish after fixing the cause (as done in P042 — refresh the expired `NPM_TOKEN`, then re-trigger the release workflow).

## Root cause

`changesets/action`'s publish path reports publish failures as log lines but (in this version/config) does not fail the action, so `outputs.published` is `false` and the downstream `if:` gate evaluates false → skip, not fail. There is no assertion that "version ahead of npm ⇒ publish must have succeeded."

## Impact

- **Who**: Addressr Contributor/Maintainer (operator). Silent non-deploys erode trust in the green-release signal (JTBD-400: "infra-boundary release steps are checkable artefacts, not memory" — a green run that didn't deploy is the opposite).
- **Frequency**: any time `npm publish` fails (token expiry, registry hiccup, scope/permission change). Realised once during P042 (expired `NPM_TOKEN`).
- **Severity**: deferred — but note it masks both the non-deploy AND, downstream, any real deploy/smoke regression (the steps never run).

## Fix Strategy (candidates — decide at investigation)

1. **Fail loud on publish failure**: add a step after `changesets/action` that asserts `package.json` version == npm-published version (or that `published == 'true'` when the version is ahead), failing the job otherwise.
2. **Decouple deploy from publish (P039)**: if deploy no longer depends on `published`, this specific silent-skip disappears — but a publish failure should still fail loudly.
3. Pin/justify `NPM_TOKEN` lifecycle (expiry monitoring) so the most common trigger is pre-empted.

Composes with **P039** (decouple deploy from publish) — fixing P039 removes the skip, but the silent-green-on-publish-failure should be fixed regardless.

**Chosen (2026-07-16)**: candidate 1, scoped in RFC-002 (fail-loud publish assertion in release workflow). Candidates 2 and 3 remain P039 territory.

**Release vehicle**: none — CI-workflow-only change, no changeset (workflow changes ship no package behaviour); the fix is live on master and exercised by the next release run.

## Fix Released

Fail-loud publish assertion added to `.github/workflows/release.yml` `release` job (RFC-002, 2026-07-16): when `steps.changesets.outputs.published != 'true'` and `package.json` version differs from `npm view` published version, the job fails red with a P044-citing error instead of green-skipping Deploy + Smoke; empty `npm view` (first publish / registry read error) warns and passes to avoid false failures. Workflow-only — no changeset; live on master immediately. Exercise evidence: YAML parses; assertion logic verified locally for all three cases (versions equal → pass, version ahead + published false → fail, empty npm view → skip); package.json (2.6.30) == npm (2.6.30) so the next routine run passes green. Awaiting user verification on the next release run (green pass on a routine run, or red on a genuinely swallowed publish).

## Related

- **P039** — decouple SaaS deployment from npm publish (the coupling; P044 is its silent-failure mode).
- **P042 / ADR 032** — the Cloudflare Worker cutover during which this surfaced (the expired token blocked the first cutover attempt silently).
- `.github/workflows/release.yml` — `release` job, `Create Release Pull Request or Publish to npm` + `Deploy new version` steps.

## RFCs

| RFC     | Status   | Title                                           |
| ------- | -------- | ----------------------------------------------- |
| RFC-002 | proposed | Fail-loud publish assertion in release workflow |

## Verified (2026-07-19 — review close-on-evidence)

Recorded verification condition was "verify the step passes green on the next release run". Observed: the fail-loud step "Fail if a publish was expected but did not happen (P044)" executed with conclusion `success` on release.yml run 29676393589 (head `0ced418`, 2026-07-19). Note the residual: this run had no expected publish, so it verifies the step wiring and the no-false-positive leg; the failure-detection leg only fires on an actual swallowed publish failure. Closed per ADR-044 framework-mediated verification close. Recovery: rerun `/wr-itil:transition-problem 044 known-error` to reopen.
