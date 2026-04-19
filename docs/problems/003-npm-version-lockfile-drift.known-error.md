# Problem 003: npm Version Lockfile Drift

**Status**: Known Error
**Reported**: 2026-04-04
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Unlikely (2)

## Description

Local development uses Node 25 / npm 11, but CI uses Node 22 / npm 10. Lockfiles generated with npm 11 fail `npm ci` in CI due to lockfile format incompatibility. Developers must remember to use `npx -y npm@10 install` instead of `npm install`.

## Symptoms

- CI fails with `npm ci` errors after running `npm install` locally
- Lockfile changes appear in git diff after every local install
- Requires manual workaround (`npx -y npm@10 install`) every time

## Workaround

- Use `npx -y npm@10 install` to regenerate lockfiles before committing.
- Use `nvm use` in the project root to pick up the pinned Node 22 from `.nvmrc` (fixed 2026-04-19); this brings along the bundled npm 10 and removes the need for the `npx` workaround on nvm-managed setups.

## Impact Assessment

- **Who is affected**: All developers working on the project
- **Frequency**: Every dependency change or lockfile regeneration
- **Severity**: Medium — blocks CI until fixed, but workaround is known
- **Analytics**: N/A

## Root Cause Analysis

### Investigation Findings (2026-04-19)

- `package.json` declares `"engines": { "node": ">=22" }` — a minimum, not a pin; permits Node 25 (npm 11) locally.
- `package.json` declares `"packageManager": "npm@10.9.4"` — ignored unless corepack is enabled. CI workflows (`.github/workflows/release.yml`, `reusable-update.yml`) use `actions/setup-node@v5` with `node-version: '22.x'` and **do not** run `corepack enable`, so the `packageManager` field provides no enforcement in CI today.
- `.nvmrc` was pinned to `14.21.2` — wildly stale (predated the Node 22 cutover). Local devs using `nvm use` silently got Node 14, or ignored the file and used whatever Node they had installed.
- ADR 020 references "Node 22 (the project's CI version)" as a supporting fact but does not formalise a Node version decision; no ADR pins `.nvmrc`.

### Root Cause (Confirmed)

Multiple config sources disagreed: `engines` allowed anything `>=22`, `packageManager` specified npm 10.9.4 but wasn't enforced because corepack was disabled, and `.nvmrc` pointed at Node 14. Devs on a modern macOS or Linux setup without project-specific version management ran whatever Node their system shipped — typically Node 25 with npm 11 — regenerating lockfiles in a format CI (npm 10) could not parse.

### Investigation Tasks

- [x] Investigate using `engines` field in package.json to enforce npm version — engines pins node minimum only; no npm pin possible via engines
- [x] Investigate `.npmrc` `engine-strict=true` or `packageManager` field — `packageManager` is set but corepack not enabled in CI; effectively inert
- [x] Investigate upgrading CI to Node 25 / npm 11 — deferred; separate decision (see Fix Strategy below)
- [x] Align `.nvmrc` with CI's `node-version: '22.x'` — done 2026-04-19

## Fix Released

**Date**: 2026-04-19

Updated `.nvmrc` from `14.21.2` to `22`. Local devs using nvm (`nvm use` in the project root) now pick up Node 22 + bundled npm 10, which matches CI's `setup-node@v5` configuration. No CI workflow changes. No `package.json` changes. The `npx -y npm@10 install` workaround is no longer needed on nvm-managed setups but remains valid for devs who don't use nvm.

Architect reviewed (PASS, no ADR conflict, no new ADR warranted — this is reversing config drift, not an architectural decision).

Awaiting user verification: next `nvm use` in the project root should switch to Node 22 + npm 10, and a clean `rm -rf node_modules package-lock.json && npm install` on the current branch should produce the same lockfile format CI expects.

## Fix Strategy — remaining options (future work)

The minimal `.nvmrc` fix addresses the most common failure mode (devs who use nvm). Two larger options remain for a fuller fix, each requiring a new ADR before it lands because each changes developer or CI workflow:

1. **Enable corepack in CI.** Add `corepack enable` + `corepack prepare npm@10.9.4 --activate` after the `setup-node` step in `.github/workflows/release.yml` and `reusable-update.yml`. This honours the `packageManager` field and locks the exact npm version across local (if devs also `corepack enable`) and CI. Scope: all workflow files, docs update.
2. **Upgrade CI to Node 25 (npm 11).** Bump `node-version` in all workflows from `'22.x'` to `'25.x'` (or explicit LTS). Matches current local-dev default. Risk: deploy target (AWS Elastic Beanstalk) platform must support Node 25; verify before proposing. Scope: CI workflows, `Dockerfile` base image, `engines` field, `test:performance` k6 setup.

Either change warrants an ADR proposal at the time it is undertaken.

## Related

- Memory: `feedback_npm_version_mismatch.md` — explicit user direction 2026-04-13: "Local npm 11 incompatible with CI npm 10; use npx npm@10 install"
- [ADR 020: MCP smoke testing](../decisions/020-mcp-smoke-testing.proposed.md) — names Node 22 as the CI version in passing
- [ADR 013: Docker image](../decisions/013-docker-image.accepted.md) — base image Node version
