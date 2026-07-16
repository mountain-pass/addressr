---
status: proposed
rfc-id: fail-loud-publish-assertion-release-workflow
reported: 2026-07-16
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P044]
adrs: []
jtbd: []
stories: []
---

# RFC-002: Fail-loud publish assertion in release workflow

**Status**: proposed
**Reported**: 2026-07-16
**Problems**: P044
**ADRs**: (none)
**JTBD**: (none)

## Summary

Add a step to the `release` job in `.github/workflows/release.yml`, immediately after `changesets/action`, that fails the job loudly when a publish should have happened but didn't — closing the silent-green non-deploy failure mode P044 (changesets/action swallows a failed npm publish → deploy silently skips) documented during the P042 worker cutover.

## Driving problem trace

- **P044** (changesets/action swallows a failed npm publish → deploy silently skips): `changesets/action@v1.4.5` reports `npm publish` failures (e.g. expired `NPM_TOKEN` → E404) as log lines without failing the job; `outputs.published` stays `false`, so the `if: steps.changesets.outputs.published == 'true'` Deploy/Smoke gates evaluate to skip — the run goes green while production is never updated.

## Scope

Fix Strategy candidate 1 from P044 (the surgical fail-loud assertion; candidate 2 — decoupling deploy from publish — remains P039's scope):

Add a `Fail if a publish was expected but did not happen (P044)` step to the `release` job, gated `if: steps.changesets.outputs.published != 'true'` (it only needs to run on the no-publish path — when `published == 'true'` the deploy gate opens and no assertion is needed):

1. Read the local version from `package.json` and the published version via `npm view <package> version`.
2. If `npm view` returns nothing (first publish or registry read error), warn and exit 0 — never false-fail a no-op run.
3. If the local version differs from the npm version while `published != 'true'`, a publish was expected (the release PR merged and bumped `package.json` ahead of npm) but was silently swallowed — `exit 1` with a clear error citing P044 so the run goes red instead of green-with-skipped-deploy.
4. Otherwise (versions equal — the routine release-PR-creation run), pass.

CI-workflow-only change: no published package behaviour, so no changeset (per the workflow-only changeset-discipline rule).

## Stories

(stories: [] — fix-time capture under AFK time budget; back-fill ≥1 story on a story map at the `/wr-itil:manage-rfc accepted` transition per ADR-089. The implementing commit uses the `Refs: RFC-002` cross-cutting trailer.)

## Commits

(rendered from `git log --grep "Refs: RFC-002"` by `/wr-itil:manage-rfc` — no commits at capture.)

## Related

- P044 — driving problem (silent-green failure mode).
- P039 — decouple SaaS deployment from npm publish (the coupling itself; composes, does not block).
- P042 / ADR 032 — the Cloudflare Worker cutover during which the expired `NPM_TOKEN` surfaced this.
