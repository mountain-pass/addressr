---
status: proposed
rfc-id: bump-node20-era-action-pins-to-node24-builds
reported: 2026-07-19
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P025]
adrs: []
jtbd: []
stories: []
---

# RFC-005: Bump Node 20-era action pins to Node 24 builds

**Status**: proposed
**Reported**: 2026-07-19
**Problems**: P025
**ADRs**: (none)
**JTBD**: (none)

## Summary

Bump every GitHub Actions pin across `.github/workflows/` that still resolves to a Node 16/Node 20 runtime to an upstream release that declares `runs.using: node24`, before GitHub removes Node 20 from the runner on 2026-09-16 (at which point actions still declaring `node20`/`node16` fail to start, breaking the release pipeline and the G-NAF state-update crons). Fix vehicle for P025 (GitHub Actions using Node.js 20 runtime are deprecated).

## Driving problem trace

- **P025** (GitHub Actions using Node.js 20 runtime are deprecated): CI runs since the v2.3.0 release (2026-04-19) annotate every run with GitHub's Node 20 deprecation warning against `actions/cache@v4` and `changesets/action@v1.4.5`. The 2026-06-02 forced-Node-24 cutover has already passed; the 2026-09-16 runtime removal turns the warnings into hard workflow failures.

## Scope

Bump five pins, all verified (2026-07-19, via each tag's `action.yml` `runs.using` field) to have Node 24 upstream builds available:

| Workflow                       | Pin                                        | Current runtime | Target                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release.yml` (×2 cache steps) | `actions/cache@v4`                         | node20          | `@v6` (node24; v5→v6 is an internal ESM migration, cache inputs unchanged)                                                                                                                                                                        |
| `release.yml` (release job)    | `changesets/action@v1.4.5`                 | node16          | `@v1.9.0` (node24 since v1.6.0; v1.5–v1.9 are minor/patch only — `publish`/`version` inputs and `hasChangesets`/`published` outputs, which the P044/RFC-002 fail-loud assertion consumes, retained)                                               |
| `reusable-update.yml`          | `actions/checkout@v3`                      | node16          | `@v5` (matches the pin already used in `release.yml`)                                                                                                                                                                                             |
| `reusable-update.yml`          | `actions/setup-node@v3`                    | node16          | `@v5` (matches `release.yml`; only input used is `node-version`)                                                                                                                                                                                  |
| `reusable-update.yml`          | `aws-actions/configure-aws-credentials@v4` | node20          | `@v6` (node24; v5's breaking change is invalid-boolean-input handling — not hit, only string inputs `role-to-assume`/`aws-region` are used; v6's breaking change is the node24 runtime itself; ADR-034/035 OIDC role-assumption design unchanged) |

`devcontainers/ci@v0.3` already declares node24; the `actions/checkout@v5` / `actions/setup-node@v5` pins in `release.yml` are already current. Stage 1 of P025's original Fix Strategy (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` early opt-in) is obsolete — the env var became a no-op at the 2026-06-02 cutover — so this RFC is stage 2 only: consume the upstream Node 24 releases.

Companion mechanical amendment: ADR-007's Confirmation criterion pins `changesets/action@v1.4.5` verbatim; loosen it to the version-agnostic "`changesets/action` (v1.x)" in the same change (architect-reviewed 2026-07-19 — substance unchanged, no supersession).

All actions run on GitHub-hosted runners (the ≥ 2.327.1 runner requirement for node24 actions is satisfied there; no self-hosted runners in this repo).

Verification: next CI run on master after push completes green with zero Node deprecation annotations.

## Stories

(none — `stories: []`; single-commit CI-config pin bump, no story decomposition. This repo does not use the story tier.)

## Commits

(rendered from `git log --grep "Refs: RFC-005"` by `/wr-itil:manage-rfc` + `wr-itil-reconcile-rfcs` per ADR-085 — a git-log-derived view, not stored per-commit.)

## Related

- [P025](../problems/open/025-github-actions-node20-deprecation.md) — driving problem ticket
- [GitHub changelog: Deprecation of Node.js 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml), [`.github/workflows/reusable-update.yml`](../../.github/workflows/reusable-update.yml)
- [ADR-007](../decisions/007-changesets-versioning.accepted.md) — Confirmation criterion loosened to version-agnostic form as part of this RFC's change
