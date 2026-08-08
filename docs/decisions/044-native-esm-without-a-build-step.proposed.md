---
status: 'proposed'
date: 2026-08-08
human-oversight: confirmed
oversight-date: 2026-08-08
decision-makers: [Tom Howard]
consulted: []
informed: []
supersedes: [005-babel-transpilation]
reassessment-date: 2026-11-08
---

# Native ESM without a build step

## Context and Problem Statement

[ADR-005](005-babel-transpilation.superseded.md) chose Babel in 2019 because _"the codebase uses ES module syntax but Node.js historically required CommonJS"_. That premise expired. `engines` declares `node >=22`, `.nvmrc` pins 22, every workflow runs 22.x, and Node has shipped native ESM for years. ADR-005's own Reassessment Criterion 1 — _"Node.js 22 is now the minimum version — native ESM is fully supported"_ — had already fired, and its Consequences already conceded the debt in as many words: _"Babel is unnecessary."_

What forced the issue was not tidiness. Eleven assertions on [P033](../problems/open/033-source-inspection-tests-anti-pattern.md) (source-inspection tests are an anti-pattern) could not be converted to behavioural tests because `src/waycharter-server.js` could not be imported by a raw `node --test` process. Among them are the guards on `buildRest2App`'s middleware registration order, including that the CORS preflight is answered **before** authentication — a security boundary whose only instrument was a regex over source text. That ticket has already produced one confirmed four-month production defect ([P091](../problems/open/091-sla-range-expanded-indexed-at-wrong-path-never-searchable.md)), so the instrument quality is not academic.

The blocker turned out to be two mechanical things rather than anything architectural: **extension-less relative imports** (`'./proxy-auth'` rather than `'./proxy-auth.js'`), which Node's ESM resolver rejects and Babel's CommonJS output resolves by extension-guessing; and **three genuine `require()` calls**. The count is in the table below — 32 across 11 files, once `test/` and `loader.js` were included, having first been measured at 20 across the five source directories alone. Eleven relative imports already carried extensions, so the tree was half-migrated before this started.

## Decision Drivers

- Eleven behavioural assertions blocked, two of them on the pre-authentication path.
- ADR-005's stated premise is false and its own reassessment criterion has fired.
- A build step whose only remaining function was to make source loadable by the runtime that can already load it.
- Tests should exercise the artifact that ships. Under Babel they exercised source that a transpiler then rewrote.

## Considered Options

1. **Native ESM, no build step (chosen)** — `"type": "module"`, ship source, retire Babel.
2. **Keep extracting clean-ESM modules** — the established precedent, applied six times. Cannot reach the registration-order invariants, because what they assert is statement order _inside_ the legacy file; reaching them means extracting the whole app builder.
3. **Dual-resolvable source** — add the extensions and the `require()` conversions, keep Babel. Unblocks nine of eleven, but the same files are then loaded by two module systems, so what is tested is not resolved the way what ships is resolved.

## Decision Outcome

Chosen: **native ESM, no build step**. Option 3 buys most of the benefit but leaves a permanent fidelity gap between test and production resolution, which is a strange thing to introduce in service of better tests. Option 2 cannot reach the assertions that motivated the work.

Measured rather than assumed, and each step verified before the next:

| Change                                               | Detail                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension-less relative imports given a `.js` suffix | 32 across 11 files                                                                                                                                                                                                                  |
| `require()` sites converted                          | 3 — `client/elasticsearch.js` ×2, `service/address-service.js` ×1                                                                                                                                                                   |
| CJS modules converted                                | `cucumber.js`, `scripts/check-version.js`                                                                                                                                                                                           |
| Dead code deleted                                    | `utils/writer.js` (swagger scaffold, zero consumers), `ci/build.js` and `ci/pipeline.mjs` (no caller anywhere; `@dagger.io/dagger` and `env-paths` in neither dependency list; `pipeline.mjs` ended on the retired `npm run build`) |
| Babel devDependencies removed                        | 11, and 169 transitive packages                                                                                                                                                                                                     |
| Build step                                           | retired; `prepack` now runs `genversion` alone                                                                                                                                                                                      |
| Published package                                    | `bin/` and `files` repointed from `lib/` to source                                                                                                                                                                                  |

`client/elasticsearch.js` uses the named `{ Client }` import, matching `src/read-shadow.js`, which was already proven under raw Node ESM.

**`deploy/create-deployment-archive.js` fails the same dead-code test and is deliberately NOT in this change.** Any path under `deploy/` other than the terraform lockfile sets `steps.deploy-paths.outputs.changed=true`, which runs `npm run deploy:prod` — a whole-root-module apply against live Elastic Beanstalk, the OpenSearch domain and the Cloudflare worker, with no plan-approval gate on the push tier. Deleting it here would arm that apply as a rider on a module-system change. It went in its own commit on 2026-08-08, where the apply is the deliberate act that trigger exists to serve. A baseline `terraform-plan` dispatch against master returned an empty change set (`plan-summary.json` = `[]`, 0 resources) before that commit was pushed, so the apply it armed had nothing to apply.

## Consequences

### Good

- `src/waycharter-server.js` imports under raw Node ESM, which is what unblocks P033's remaining conversions.
- Tests exercise exactly the code that ships. There is no transpilation between what is asserted and what runs.
- One resolution path instead of two: no class of bug that appears only in the built artifact.
- 169 fewer packages installed; no build to run, cache, or get stale.

### Neutral

- Source ships instead of `lib/`. The tarball carries the same modules under their real paths, and the `bin` **names** are unchanged, so `npx addressr-loader` and `npx addressr-server-2` are unaffected for consumers.
- `version.js` is generated by `genversion` and gitignored. It shipped inside `lib/` before and is now an explicit `files` entry, with `prepack` generating it.

### Bad

- **Stable bin names do not make the layout move consumer-neutral, and this repo contains the counterexample.** The Docker image's `CMD` is the _resolved script path_, not the bin shim, because the Distroless base has no shell and no `/usr/bin/env` to resolve one — so it hardcodes a package-internal path and broke on the move. The risk gate caught it; `cli2` could not, because it exercises the npm channel and never builds the image. Repointed, and pinned by a test asserting the CMD path against `package.json`'s `bin` and `files`, so the next layout change fails a test rather than a container start.
- Every `.js` file in the repo is now ESM, so any future file mixing `require()` with `import` fails at load rather than being quietly transpiled. That is the intended trade, but it is a sharper edge.
- Consumers on a Node older than `engines` declares now fail at import rather than running transpiled output. `engines: >=22` already excluded them; the failure is louder.
- **A silent-green trap was found and must not be reintroduced.** Under CommonJS, `module.exports = { default, rest2, cli2 }` was cucumber's profile map. Under ESM the default export is the _default profile's own options_, and other profiles come from **named** exports. With the CommonJS shape left in place, `-p rest2` errors honestly but `-p default` matches cucumber's built-in empty default and reports `0 scenarios / 0 steps` with **exit 0** — a green run that executed nothing. Measured: all three profiles reported 0 while passing, until the export shape was corrected. The rationale is recorded at the site in `cucumber.js`, and the Confirmation criterion above is the standing guard — the original detection was a person noticing the counts had changed, which is not a control.

## Confirmation

- `package.json` contains `"type": "module"`, no `build` script, and no `@babel/*` dependency.
- `.babelrc` does not exist.
- `node --input-type=module -e "import('./src/waycharter-server.js')"` resolves and returns `buildRest2App`.
- All three Cucumber profiles passed at their pre-migration counts at the time of the migration: **nodejs 37/232, rest2 38/234, cli2 33/208**. Those figures are a **migration-fidelity check about an event**, not a standing criterion — they move whenever a scenario is added, and a future reader should not treat a mismatch as a regression. The cli2 figure is the load-bearing one: that profile runs `npm pack && npm install -g` and drives the globally installed binary, so it is the check that the published package still works with no build step.
- `npm run test:js` passes (341 at the time of writing — likewise an event, not a standing number).
- **Every local module reachable by static import from a declared `bin` entry, `loader.js` or `src/server2.js` is covered by a `package.json` `files` entry.** Pinned by `test/js/__tests__/package-graph-ships.test.mjs`, which resolves the graph with esbuild rather than a hand-rolled walk. Stated as a property rather than as a list of directories: the first draft of this criterion listed `version.js, loader.js, bin/, src/, service/, client/` and omitted `utils/`, which the loader reaches through `../utils/stream-down.js` — so it would have gone green on a tarball that cannot run the loader, which is the exact failure class it appears to cover. Before this decision the property held by accident, because `files` listed `lib/` and `babel . -d lib` compiled the whole tree into it.
- **The benefit is realised, not merely enabled.** Everything above verifies Babel is gone; this verifies the decision achieved what it was taken for. `waycharter-server.test.mjs`'s row in P033's Remaining population table falls from 7, and the `buildRest2App` registration-order assertions — including the guard that the CORS preflight is registered ahead of `proxyAuthMiddleware` — execute the function instead of matching its source text. Without this criterion the decision can be fully confirmed with zero P033 progress, which would make it a tidy-up wearing a defect-prevention justification.
- **The silent-green trap cannot recur unnoticed.** `test/js/__tests__/cucumber-profiles.test.mjs` resolves each of the three profiles through cucumber's own `loadConfiguration` and fails if any resolves to zero feature paths, zero step-definition imports, a non-empty `require` list, or an empty scenario plan. Mutation-proved against three reversions: the CommonJS profile-map shape, `--import` back to `--require`, and a tag typo that selects nothing. Each fails; the last is caught only by the scenario-plan floor, which is why the floor is there as well as the shape.

## Reassessment Criteria

- TypeScript adoption would reintroduce a build step, at which point this decision is revisited rather than assumed.
- A dependency that ships CommonJS only, with no ESM entry and no working `cjs-module-lexer` named-export detection, forcing a `createRequire` shim in more than one place.
- Node's ESM implementation changing such that automatic module-syntax detection is no longer available on the supported floor.

## Pros and Cons of the Options

### Native ESM, no build step

- Good, because tests and production resolve identically.
- Good, because it unblocks the behavioural conversions, including the pre-authentication guard.
- Bad, because it is the largest change of the three, touching the published package shape.

### Keep extracting clean-ESM modules

- Good, because it is precedented and each step is small.
- Bad, because a statement order inside a file cannot be extracted, so a residue of source-inspection tests survives indefinitely.

### Dual-resolvable source

- Good, because it is the smallest change that unblocks most of the work.
- Bad, because it makes the same files load under two module systems permanently, and the resolution difference is real: `@opensearch-project/opensearch` has a conditional exports map, so the test would resolve `index.mjs` while production resolves `index.js`.
