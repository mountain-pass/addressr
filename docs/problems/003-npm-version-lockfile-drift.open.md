# Problem 003: npm Version Lockfile Drift

**Status**: Open
**Reported**: 2026-04-04
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Unlikely (2)

## Description

Local development uses Node 25 / npm 11, but CI uses Node 22 / npm 10. Lockfiles generated with npm 11 fail `npm ci` in CI due to lockfile format incompatibility. Developers must remember to use `npx -y npm@10 install` instead of `npm install`.

## Symptoms

- CI fails with `npm ci` errors after running `npm install` locally
- Lockfile changes appear in git diff after every local install
- Requires manual workaround (`npx -y npm@10 install`) every time

## Workaround

Always use `npx -y npm@10 install` to regenerate lockfiles before committing.

## Impact Assessment

- **Who is affected**: All developers working on the project
- **Frequency**: Every dependency change or lockfile regeneration
- **Severity**: Medium — blocks CI until fixed, but workaround is known
- **Analytics**: N/A

## Root Cause Analysis

### Investigation Tasks

- [ ] Investigate using `engines` field in package.json to enforce npm version
- [ ] Investigate `.npmrc` `engine-strict=true` or `packageManager` field
- [ ] Investigate upgrading CI to Node 25 / npm 11
- [ ] Create reproduction test
- [ ] Create INVEST story for permanent fix

## Related

- Memory: feedback_npm_version_mismatch.md
