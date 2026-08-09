# Problem 084: ESLint 10 / unicorn 72 leave a deliberate lint debt, and nothing but the pre-commit hook enforces it

**Status**: Open
**Reported**: 2026-08-03
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3) — **re-grounded 2026-08-09, product unchanged.** Impact 2 does NOT rest on the flagged surface being off the production path — it is not. Two `.mjs` files in the corpus are bundled into the deployed Cloudflare edge proxy (see the measured section). It rests on the CATCH-POWER of the missing lint: on those files the rules with sites are the formatting and naming classes, so lint's absence there costs formatting, not correctness. The cost of the gap is developer-time-shaped even where the file is production-shaped
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

- **Who is affected**: the maintainer, on the next edit to a flagged file. Mostly no consumer, runtime, publish or deploy path — with the two Cloudflare Worker `.mjs` files as the stated exception, which carry no correctness-class findings.
- **Frequency**: once per touched file, until swept.
- **Severity**: Minor. `RISK-POLICY.md` Impact 1-2 territory — the findings are developer tooling in effect, even on the two files that do reach runtime. Worth noting the secondary shape though: `lint-staged` runs `eslint --fix` and re-stages, so a commit touching a heavily-flagged file silently carries auto-fix churn the author did not review.

## Root Cause Analysis

Eight majors of a rule-heavy plugin were skipped in one step, because `eslint-plugin-unicorn` 66+ requires `eslint >=10.4`, which required `@babel/eslint-parser@8`, which required the whole `@babel/*` stack on 8. Thirteen of the sixteen entries in `.dry-aged-deps.json` were behind that one wall, so nothing could move until all of it did. The lint debt is the accumulated cost of that queue draining at once rather than incrementally.

Contributing: lint is not in CI, so drift accrues invisibly between upgrades. The 102-error pre-migration baseline was itself evidence of that — those errors were not new either.

### Investigation Tasks

- [ ] Sweep the auto-fixable share first, scoped per directory so the diff stays reviewable: `npx eslint service/ --fix`, then `src/`, then `test/`. Expect this to clear all 133 `prettier/prettier` plus the fixable unicorn classes.
- [ ] Work `unicorn/no-this-outside-of-class` (173). Check whether these are genuine CJS-era `this` usages that should become explicit parameters or module-scope references, or whether the rule is wrong for this codebase and belongs in the permanent-off list next to `unicorn/prefer-module` and `unicorn/prefer-top-level-await` (both already off, both citing ADR-005).
- [ ] Work `unicorn/name-replacements` (41), then raise both rules back to `error` per directory as each is cleared.
- [ ] Decide whether lint belongs in CI. It is the reason this debt was invisible until an upgrade forced it.
- [ ] **The `.mjs` blind spot, measured 2026-08-09 rather than left as an observation.** This task previously read as a note appended to the CI question. It is the bigger half, as the architect said at capture, and it now has numbers — see the section below.

### The `.mjs` blind spot, measured

`npx eslint . --format json` on a clean tree at `432700cb`:

| Extension | Files | Errors | Warnings |
| --------- | ----- | ------ | -------- |
| `.mjs`    | 50    | 365    | 256      |
| `.js`     | 46    | 47     | 197      |

47 of 50 `.mjs` files carry a finding, against roughly an eighth the errors in the `.js` corpus that `lint-staged` does cover. Top `.mjs` rules: `prettier/prettier` 137, `unicorn/name-replacements` 75, `security/detect-non-literal-fs-filename` 74, `security/detect-object-injection` 45, `unicorn/filename-case` 35.

**Two gaps compose, and both must close for either to matter.** `lint-staged` matches `*.{js,jsx}` for eslint and `*.{json,css,md}` for prettier, so `.mjs` matches neither; and `npm run lint` is in no hook and no workflow. eslint itself is willing — the flat config puts no `files` restriction on its base block, so `eslint .` lints all 96 files. The corpus is reachable; nothing reaches for it.

**Two of the 50 reach production, which the first draft of this section got wrong.** `deploy/cloudflare-worker/worker.js` imports `./ip-matcher.mjs` and `./safe-ips.mjs`, and `build:worker` bundles them into the deployed Cloudflare edge proxy — `ip-matcher.mjs` being the CIDR matcher behind the ADR-018 `safeIps` auth bypass. Also `client/__tests__/*.mjs` sits under `client/`, which IS a `files` entry, so it ships in the tarball inert. The impact rating does not move, but the ground under it changes twice, and the second correction is the one that matters.

The first draft of this correction said the rating holds because those two files are pure functions with behavioural cover in `cloudflare-worker-ip-matcher.test.mjs`. **That is a category error and is withdrawn.** Cover is a control on LIKELIHOOD — it makes a defect less probable. It cannot make an auth-bypass defect on the production edge proxy less CONSEQUENTIAL, which is what an impact argument has to do.

What actually holds Impact 2 is the catch-power of the missing lint. On `ip-matcher.mjs` the rules with sites are the formatting and naming classes — the mask expression is a `prettier/prettier` candidate and nothing more; there is no computed member access for `detect-object-injection` to fire on, and no I/O for `detect-non-literal-fs-filename`. So what lint's absence costs on that file is formatting, not correctness. The surface is production-shaped; the findings are not.

**Re-rate trigger, because that ground is conditional on today's corpus and this ticket argues below that the corpus is not frozen**: a new `.mjs` joining the Worker bundle that is not a pure function, or any `security/*` rule acquiring a site under `deploy/cloudflare-worker/`, moves Impact to 3.

**Non-amplifying per file, growing per corpus.** Touching a `.mjs` file mechanically changes nothing, since it matches no glob, so there is no per-edit churn. But the corpus is not frozen: the unit tier is `.mjs` by convention at 34 of the 50, and its growth driver is P033's conversion programme. Nor is the finding count frozen — this ticket exists because unicorn 64 to 72 took the tree from 102 to 593 in one upgrade, and the same would re-price the `.mjs` share wholesale. The Effort grade has a shelf life, which argues for the auto-fix sweep sooner rather than later.

**Sequencing constraint.** Widening the glob first would make the next person to touch any `.mjs` file responsible for that file's whole backlog, mid-unrelated-change — which is how a gate gets bypassed with `--no-verify` rather than obeyed. Green first, or land the gate with findings explicitly baselined. And per the ADR-014 note below, the widening is a deviation from an accepted decision rather than a free change.

- [ ] Sweep the `.mjs` auto-fixables as their own commit, touching nothing else, so the formatting churn is reviewable as formatting.
- [ ] Triage the ~119 untriaged `security/*` findings. The `.js` corpus carries site-scoped disables with stated reasons; these have never been looked at. `scripts/check-not-cli2-tags.mjs` first, since it runs as a pre-commit gate rather than a test.
- [ ] Only then widen the `lint-staged` glob — and check whether `.cjs` needs it too, which nobody has looked at.

## Dependencies

- **Blocks**: (none — the `warn` downgrade removes the blocking property)
- **Blocked by**: (none)
- **Composes with**: (none)

## Withdrawn duplicate

**P096 was opened for the `.mjs` half of this ticket on 2026-08-09 and withdrawn the same day, before it was ever committed.** On reading this ticket it was clear the scope was already here — investigation task 4 named the `.mjs` gap and called it the bigger one, and the Related section below already cites the ADR that pins the glob. Two tickets at identical Priority, Effort and WSJF in the same selection band would have meant whichever was picked left the other live with overlapping fix steps, which a cross-reference annotates rather than prevents. The measurements it had gathered are folded into the section above. **ID 096 is retired rather than reused**, so an external reference to it does not later resolve to something unrelated.

## Related

- **The migration commit** — took `@babel/*` to 8, `eslint` to 10, `@eslint/js` to 10 and `eslint-plugin-unicorn` to 72, clearing 13 of the 16 `.dry-aged-deps.json` exclusions. Only `chai`, `express` and `lint-staged` remain.
- **ADR-014** (ESLint 9 flat configuration) — its Confirmation pins `lint-staged` to `*.js` and `*.jsx`, so today's `.mjs` blind spot is compliant as recorded. The architect flagged the record as stale (dated 2025-01-01, older than six months) during the same review. Any change to lint enforcement should check whether that ADR needs superseding rather than amending.
- **ADR-005** — cited by the two unicorn rules already permanently off. If `no-this-outside-of-class` turns out to be the same class of Babel/CJS incompatibility, it belongs alongside them with the same citation.

Origin: internal, surfaced 2026-08-03 when the Babel 8 / ESLint 10 wall came down and eight majors of unicorn rules landed at once. Captured at the migration commit as remediation R2 from the risk gate, so the deferral is on the ledger rather than in a commit message.
