# Problem 084: ESLint 10 / unicorn 72 leave a deliberate lint debt, and nothing but the pre-commit hook enforces it

**Status**: Open
**Reported**: 2026-08-03
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3) — derived at capture; developer-time only, no runtime, publish or consumer path, but it lands on whoever next edits `service/` or `src/`
**Origin**: internal
**Effort**: M — derived at capture: the auto-fixable share is one command, the rest is ~214 hand edits across two directories
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Taking `eslint-plugin-unicorn` from 64 to 72 (eight majors) and `eslint` from 9 to 10 moved the tree-wide `eslint .` count from **102 errors to 593**. That was known and accepted at the time, because the alternative was burying a few thousand lines of formatting churn inside a dependency migration and making both unreviewable. This ticket exists so the deferral is tracked rather than rediscovered by whoever hits it.

Two things make it less alarming than the number suggests, and one makes it worse.

**Less alarming.** `eslint` runs in **no workflow** — `grep -n lint .github/workflows/*.yml` returns nothing. `npm run lint` is `eslint . --fix`. Enforcement is entirely the `lint-staged` pre-commit hook, scoped to staged `*.{js,jsx}`. So nothing on the release path reddens, and the pre-existing 102 errors had already been sitting there unenforced.

**Worse.** The hook fails the commit on any error it cannot auto-fix, and the two largest new classes are not auto-fixable and are concentrated in the files under continuous edit. Left at `error` they would have hard-blocked the next edit to `service/` or `src/` for a reason unrelated to that edit.

## Symptoms

`eslint .` after the migration:

| Count | Rule                                          | Auto-fixable |
| ----- | --------------------------------------------- | ------------ |
| 173   | `unicorn/no-this-outside-of-class`            | no           |
| 133   | `prettier/prettier`                           | yes          |
| 41    | `unicorn/name-replacements`                   | no           |
| 27    | `unicorn/no-null`                             | partly       |
| 25    | `unicorn/filename-case`                       | no           |
| 15    | `unicorn/prefer-await`                        | yes          |
| 15    | `unicorn/no-top-level-assignment-in-function` | no           |
| 12    | `unicorn/consistent-boolean-name`             | no           |

### Suppressions granted against this debt

Sites where a violation was deliberately silenced rather than fixed, so the sweep has an exact list rather than a rediscovery exercise. Each carries an inline `-- <reason>` at the site; `grep -rn 'eslint-disable' src/ service/` is the authoritative enumeration.

| Site                                 | Rule                                           | Why not fixed                                                                                                                                 | Granted    |
| ------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/waycharter-server.js` (2 sites) | `unicorn/no-useless-else`                      | the `else` carries the If-None-Match branch of the address-collection cache; collapsing it rewrites live control flow                         | 2026-08-08 |
| `src/waycharter-server.js`           | `unicorn/consistent-conditional-object-spread` | the site is the `/health` response body; restructuring it changes a shipped response shape                                                    | 2026-08-08 |
| `src/waycharter-server.js`           | `unicorn/no-top-level-assignment-in-function`  | the module-level `server` handle that `stopServer()` and `forceCloseConnections()` close over — graceful-shutdown lifecycle, P067's territory | 2026-08-08 |

All four surfaced only because extracting the CORS preflight (P033) staged the file for `lint-staged`; none is in a region that change touches. The common reason for deferring rather than fixing: each is a behavioural rewrite of live server code, and `src/waycharter-server.js` has no unit-level cover to catch a mistake — which is precisely the gap P033 exists to close. Fixing them is cheap **after** that ticket lands cover, and reckless before.

Deliberately **four site-scoped `eslint-disable-next-line` comments, not one region disable.** The first draft opened a `/* eslint-disable */` before `buildRest2App` and closed it at end-of-file — 477 lines covering four violations, which would have silently absorbed any future violation of those three rules anywhere in the server, including the pre-auth registration region, with no CI lint to notice. It also makes the debt uncountable: per-site comments give this ticket an exact `grep -c`.

## Workaround

Applied at the migration commit, as the risk gate's remediation R1: `unicorn/no-this-outside-of-class` and `unicorn/name-replacements` are set to `warn` in `eslint.config.js`, with a comment saying why and that they should be raised as the sweep lands. That takes the blocking count from 593 errors to 379 and removes the forward-blocking property, while keeping the signal visible.

This is a workaround, not the fix. The rules are real and the code does violate them.

## Impact Assessment

- **Who is affected**: the maintainer, on the next edit to a flagged file. No consumer, runtime, publish or deploy path.
- **Frequency**: once per touched file, until swept.
- **Severity**: Minor. `RISK-POLICY.md` Impact 1-2 territory — developer tooling that does not affect build, publish or runtime. Worth noting the secondary shape though: `lint-staged` runs `eslint --fix` and re-stages, so a commit touching a heavily-flagged file silently carries auto-fix churn the author did not review.

## Root Cause Analysis

Eight majors of a rule-heavy plugin were skipped in one step, because `eslint-plugin-unicorn` 66+ requires `eslint >=10.4`, which required `@babel/eslint-parser@8`, which required the whole `@babel/*` stack on 8. Thirteen of the sixteen entries in `.dry-aged-deps.json` were behind that one wall, so nothing could move until all of it did. The lint debt is the accumulated cost of that queue draining at once rather than incrementally.

Contributing: lint is not in CI, so drift accrues invisibly between upgrades. The 102-error pre-migration baseline was itself evidence of that — those errors were not new either.

### Investigation Tasks

- [ ] Sweep the auto-fixable share first, scoped per directory so the diff stays reviewable: `npx eslint service/ --fix`, then `src/`, then `test/`. Expect this to clear all 133 `prettier/prettier` plus the fixable unicorn classes.
- [ ] Work `unicorn/no-this-outside-of-class` (173). Check whether these are genuine CJS-era `this` usages that should become explicit parameters or module-scope references, or whether the rule is wrong for this codebase and belongs in the permanent-off list next to `unicorn/prefer-module` and `unicorn/prefer-top-level-await` (both already off, both citing ADR-005).
- [ ] Work `unicorn/name-replacements` (41), then raise both rules back to `error` per directory as each is cleared.
- [ ] Decide whether lint belongs in CI. It is the reason this debt was invisible until an upgrade forced it. Note the architect separately observed that `lint-staged` is scoped to `*.{js,jsx}` while the repo has substantial `.mjs` surface (`test/js/__tests__/`, `test/precommit/`, `scripts/*.mjs`) that **nothing** lints — that gap is arguably the bigger one and would be closed by the same change.

## Dependencies

- **Blocks**: (none — the `warn` downgrade removes the blocking property)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- **The migration commit** — took `@babel/*` to 8, `eslint` to 10, `@eslint/js` to 10 and `eslint-plugin-unicorn` to 72, clearing 13 of the 16 `.dry-aged-deps.json` exclusions. Only `chai`, `express` and `lint-staged` remain.
- **ADR-014** (ESLint 9 flat configuration) — its Confirmation pins `lint-staged` to `*.js` and `*.jsx`, so today's `.mjs` blind spot is compliant as recorded. The architect flagged the record as stale (dated 2025-01-01, older than six months) during the same review. Any change to lint enforcement should check whether that ADR needs superseding rather than amending.
- **ADR-005** — cited by the two unicorn rules already permanently off. If `no-this-outside-of-class` turns out to be the same class of Babel/CJS incompatibility, it belongs alongside them with the same citation.

Origin: internal, surfaced 2026-08-03 when the Babel 8 / ESLint 10 wall came down and eight majors of unicorn rules landed at once. Captured at the migration commit as remediation R2 from the risk gate, so the deferral is on the ledger rather than in a commit message.
