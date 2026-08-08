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

Sites where a violation was deliberately silenced rather than fixed, so the sweep has an exact list rather than a rediscovery exercise. Each carries an inline `-- <reason>` at the site; `grep -rn 'eslint-disable' src/ service/ test/` is the authoritative enumeration. Note the scope: it was `src/ service/` until a suppression was proposed under `test/`, at which point the enumeration would have stopped covering the table that cites it.

| Site                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Rule                                                | Why not fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Granted    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/waycharter-server.js` (2 sites)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `unicorn/no-useless-else`                           | the `else` carries the If-None-Match branch of the address-collection cache; collapsing it rewrites live control flow                                                                                                                                                                                                                                                                                                                                                        | 2026-08-08 |
| `src/waycharter-server.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `unicorn/consistent-conditional-object-spread`      | the site is the `/health` response body; restructuring it changes a shipped response shape                                                                                                                                                                                                                                                                                                                                                                                   | 2026-08-08 |
| `src/graceful-shutdown.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `unicorn/prefer-await`, `unicorn/prefer-then-catch` | **not deferred — the rules are wrong here.** The two-argument `.then(onFulfilled, onRejected)` keeps the success and failure paths disjoint **by construction**; `.then(f).catch(r)` would also route a throw from the success handler into `r`, and `await` needs a nested try/catch for the same guarantee. Not a claim of a live bug — `proc.exit(0)` is synchronous, so nothing downstream throws today. Candidate for a permanent per-file exemption, not a sweep item. | 2026-08-08 |
| `service/print-version.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `unicorn/no-top-level-side-effects`                 | `dotenv.config()` at module scope IS this module's contract: consumers import it precisely so `process.env` is populated before they read it. Moving it inside `printVersion()` would make the side effect conditional on calling a logger.                                                                                                                                                                                                                                  | 2026-08-08 |
| `client/elasticsearch.js`, `src/server2.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `unicorn/no-global-object-property-assignment`      | `globalThis.esClient` is how the OpenSearch client reaches the step definitions and the shutdown path. Rewiring it changes how the app shares state.                                                                                                                                                                                                                                                                                                                         | 2026-08-08 |
| `loader.js`, `src/server2.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `unicorn/prefer-await`                              | top-level entry-point chains, not function bodies. `await` at module top level changes when the process settles and how an unhandled rejection surfaces on a CLI whose exit code is its contract.                                                                                                                                                                                                                                                                            | 2026-08-08 |
| **The native-ESM migration (ADR-044) added the three rows dated 2026-08-08 above.** Flipping to `"type": "module"` staged 21 `.js` files at once, and each dragged its pre-existing debt into the `lint-staged` gate: 14 errors across six files, none of them caused by the migration. Two were trivially safe and were fixed rather than suppressed (`unicorn/operator-assignment`, `unicorn/prefer-url-href`). The rest are behavioural and are recorded above. Worth noting for the sweep: the migration's own new files carry no suppressions at all. |

Three of the first four surfaced only because extracting the CORS preflight (P033) staged that file for `lint-staged`; none is in a region that change touched. The common reason for deferring rather than fixing: each is a behavioural rewrite of live server code, and `src/waycharter-server.js` has no unit-level cover to catch a mistake — which is precisely the gap P033 exists to close. Fixing them is cheap **after** that ticket lands cover, and reckless before.

**One suppression has already been retired that way, and it is the argument for sequencing the two tickets in this order.** The fourth row granted 2026-08-08 was `unicorn/no-top-level-assignment-in-function` on `src/waycharter-server.js:996` — the module-level `server` handle that `stopServer()` and `forceCloseConnections()` closed over. Later the same day, P033's third conversion moved those two functions into `src/graceful-shutdown.js` behind a `createServerLifecycle()` factory, so the singleton is a `const` initialised once and nothing assigns to module scope from inside a function. The rule stopped firing. **The violation was removed rather than relocated or silenced**, and it was removed as a side effect of landing the behavioural cover whose absence was the reason for deferring it. Expect more of this debt to fall out the same way as P033 proceeds — a sweep pass run first would have hand-edited a line that no longer exists.

Deliberately **site-scoped `eslint-disable-next-line` comments, not one region disable.** The first draft on `waycharter-server.js` opened a `/* eslint-disable */` before `buildRest2App` and closed it at end-of-file — 477 lines covering four violations, which would have silently absorbed any future violation of those three rules anywhere in the server, including the pre-auth registration region, with no CI lint to notice.

### A suppression that was proposed, checked, and withdrawn

Worth recording because the check is the transferable part, not the outcome.

Four `unicorn/no-global-object-property-assignment` violations in `test/js/world.js` blocked a commit that added a single `await` (P033). A row was drafted for the table above on the stated ground that `globalThis.expect` and `globalThis.driver` are how the Cucumber world shares state across step definitions, that every step file reads them, and that rewiring is therefore a test-infrastructure change with all three tiers downstream.

**Every clause of that was false, and the risk gate caught it by reading the tree instead of the claim.** `globalThis.expect` had **zero** readers anywhere — all three step files import `expect` from `chai` directly, so the assignment was dead code and the `chai` import with it. `globalThis.driver` had exactly **one** reader, `world.js:88`, in the same file as its three writers. Nothing was downstream of either.

So both were deleted rather than suppressed: the dead global and its import removed, and the driver moved to a field on a module-level `const` holder — a field rather than a bare `let` for the same reason `createServerLifecycle()` closes over its handle, since assigning a module binding from inside a function is what `unicorn/no-top-level-assignment-in-function` objects to. Net effect on this ticket: **four violations removed, zero suppressions granted, and one piece of dead code deleted**, in place of a table row asserting a constraint that did not exist. Verified across all three Cucumber profiles, which take different branches of the switch that assigns it — 37/232 embedded, 38/234 rest2, 33/208 cli2.

The general lesson for the sweep: _"this is load-bearing, leave it"_ is a claim about the tree, and a `grep` settles it in seconds. Two of the deferrals in the table above are worth re-checking the same way before the sweep prices them.

**It is also the clearest evidence for the CI-lint investigation task below.** `world.js` ends in `.js`, so `lint-staged` covers it — and it hard-blocked a one-word edit on violations that pre-date the change by months. Had it been `.mjs` like its neighbours in `test/js/__tests__/`, nothing would have linted it at all. The enforcement surface is not "risky files": it is whichever files happen to end in `.js`, which is why the same repo can block a one-word edit and let an entire directory drift unchecked.

The narrow form is what made the retirement above visible. Under the region disable, moving the server handle out would have left the blanket in place, still suppressing three rules across 477 lines, and nothing would have shown that one of its reasons had expired. Per-site comments also keep the debt countable — `grep -rn 'eslint-disable' src/ service/ test/` returns an exact list rather than a set of regions to re-derive.

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
