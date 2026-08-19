# Problem 105: @changesets/cli ships as a production dependency of the published package

**Status**: Open
**Reported**: 2026-08-19
**Priority**: 10 (High) — Impact: 2 × Likelihood: 5 — derived at capture per Step 4a.
Impact 2 because the package installs and runs correctly: nothing is disrupted, so Impact 3 ("publish
pipeline disrupted") does not apply, and no address data is wrong, so Impact 4 does not either. What
consumers get is a larger artefact and a wider transitive dependency surface, not a broken one.
Likelihood 5 because it is not a risk of harm — it manifests on **every** install and every image build,
and has since 2026-08-10. Impact is the cost of the defect itself and Likelihood is how often it fires;
the two are deliberately not the same event, after P104 was rescored 12 → 8 today for conflating them.

**Origin**: internal
**Effort**: M — revised 2026-08-19 from S. The edit is one line, but WSJF's divisor is cost-to-complete, and
the cost here is the verification: a forced-`CI` dry run under a clean pinned install, a reviewed lockfile
diff, and confirmation on a real release. Rating that S because the _diff_ is small is the same mistake as
rating a change safe because it is short.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`packages/addressr/package.json` lists `@changesets/cli` among its **production** dependencies, and that
package is published (`"private": false`). So a release-tooling CLI is shipped to every consumer of
`@mountainpass/addressr` as a runtime dependency.

Nothing in the shipped package uses it:

- No `@changesets` import anywhere in `packages/addressr/src`, `/service` or `/api`.
- No script in `packages/addressr/package.json` references `changeset`.

The actual consumers are **root** `package.json` scripts — `add-changeset`, `ci:version`, `ci:publish`.
Those work only because npm hoists the dependency up out of the package into the root `node_modules`.
It belongs in root `devDependencies`, where the scripts that call it live.

### Evidence

- Entered production dependencies at `8199e5b9` (2026-08-10, the ADR-046 workspace restructure). The count
  of `@changesets/cli` in `packages/addressr/package.json` goes **0 → 1** across `a3261242` → `8199e5b9`.
- Absent from root `devDependencies` — so the restructure **moved** it rather than added it.
- The `@changesets` scope alone is 25M in `node_modules`, before its transitive subtree.

## Symptoms

1. Every `npm install @mountainpass/addressr` pulls a release-management CLI and its subtree into a
   runtime dependency set.
2. Every Docker image build carries the same payload into the shipped image.
3. The transitive dependency surface of the published artefact is wider than the service needs, which is
   also the surface that advisories are counted against.
4. Nothing detects it. There is no assertion that a publishable package's production dependencies are
   actually used by the code it ships.

## Workaround

None available to a consumer. The dependency set of a published version is fixed at publish time.

## Impact Assessment

- **Who is affected**: every consumer of the published npm package and the Docker image — including paying
  RapidAPI-adjacent self-hosters, not only this repo's maintainer.
- **Frequency**: every install and every image build since 2026-08-10.
- **Severity**: Minor in function, real in artefact hygiene. The package works; it is simply not what it
  should be. No evidence of a security advisory arriving through the added subtree, and this ticket does
  not claim one.
- **Analytics**: 1 misplaced dependency; 25M in the `@changesets` scope alone; 9 days shipped at capture.

## Root Cause Analysis

The ADR-046 restructure moved dependencies from the root manifest into `packages/addressr`. The production
dependencies of the service moved correctly. `@changesets/cli` moved with them, but it was never a
dependency of the service — it was tooling for the repo, and its callers stayed at the root.

**This is a fifth invariant of a family ADR-046 already names four members of.** ADR-048 enumerates
ADR-046's four Confirmation criteria — the root `workspaces` glob, `npx npm@10 ci` resolution, name and
directory agreement, and `private`/publishable placement. Dependency-section correctness for a publishable
package is the same kind of invariant, and none of the four asserts it. The restructure was checked for
whether packages resolve, not for whether what they declare is what they use.

### Investigation Tasks

- [ ] Move `@changesets/cli` from `packages/addressr` `dependencies` to root `devDependencies`.
- [ ] Verify the root scripts still resolve it under a clean install — and note the check as first written
      **could not have run**. `ci:version` and `ci:publish` are guarded:

      ```
          ci:version: [ "$CI" = true ] && changeset version || echo "Dry run: changeset version"
          ```

          Locally `CI` is unset, so both take the `||` branch, echo a string, never invoke `changeset`, and exit 0
          **whether or not the binary resolves**. A local `npm run ci:publish` passes identically in the broken and
          the working case. Force the guard (`CI=true`) or, better, assert resolution without mutating anything:
          `npx --no-install changeset --version` from the root after a clean install, which fails hard when the
          binary is unresolvable.

- [ ] Pin the install to `npx npm@10 ci`. Local npm 11 is not CI npm 10, and ADR-046's own Confirmation
      criteria name `npx npm@10 ci` resolution — an unpinned "clean `npm ci`" reproduces a divergence this
      repo has already been bitten by.
- [ ] Require a **minimal reviewed lockfile diff** rather than "don't regenerate it". Moving a dependency
      between manifests necessarily changes `package-lock.json` in at least two nodes (the `packages/addressr`
      entry and the root `packages[""]` devDependencies entry). The constraint that matters is that those are
      the _only_ changes — no version churn, no re-resolution elsewhere. "Don't regenerate" reads as "don't
      touch it", which is not achievable.
- [ ] Check which entry point the release workflow actually invokes: the root also defines
      `turbo:ci:version` → `turbo run //#ci:version` and `turbo:ci:publish`. Which of the two runs determines
      the resolution context, and the first draft of this ticket enumerated only the inner three scripts.
- [ ] Confirm on a real release that versioning and publishing still work. This is unavoidable: the only
      context where resolution is genuinely exercised is a CI run with `CI=true`, which per R015 is the same
      job that publishes to npm and then deploys. Sequence this deliberately rather than discovering it.
- [ ] Audit the remaining 18 production dependencies the same way — is each one actually imported by
      shipped code? This ticket found one by accident; nothing looked for the others.
- [ ] Add an assertion that a publishable package declares no production dependency its shipped source
      never imports, so the next misplacement is caught rather than shipped. Note the guard must sit
      outside the thing it protects, per ADR-048.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: the ADR-046 restructure's uncovered-collateral family — see Related.

## Related

- **ADR-046** ([`046-packages-are-distributable-apps-are-deployed.proposed.md`](../../decisions/046-packages-are-distributable-apps-are-deployed.proposed.md))
  — the restructure that moved the dependency. Its four Confirmation criteria do not include dependency-section
  correctness; this ticket is the fifth invariant of that family.
- **ADR-048** ([`048-moved-path-referrers-resolved-by-executable-guard.proposed.md`](../../decisions/048-moved-path-referrers-resolved-by-executable-guard.proposed.md))
  — enumerates those four criteria, and establishes that a guard sits outside the tier it protects.
- **P103** ([`103-workflow-referrers-outside-guard-coverage-rot-unseen.md`](103-workflow-referrers-outside-guard-coverage-rot-unseen.md))
  — **sibling, not parent.** Both are ADR-046 restructure collateral, but P103 owns referrers that fail to
  resolve inside `.github/workflows`, and self-bounds its impact as touching "no publish or deploy path".
  Here the dependency resolves fine and the defect is on the publish path, so absorbing this would falsify
  P103's own recorded severity. Hang-off check returned PROCEED_NEW on those grounds.
- **P106** ([`106-license-compliance-gate-scans-an-empty-tree-and-exits-zero.md`](106-license-compliance-gate-scans-an-empty-tree-and-exits-zero.md))
  — same origin commit, and **this ticket should be done first**. `spawndamnit@3.0.1`, one of the four
  packages P106 had to hand-clear, reaches the production tree only via `@changesets/git` via
  `@changesets/cli`; the whole `@changesets` subtree is inside the 234-package corpus P106 must cover. Fixing
  this shrinks that ticket's problem. The ordering argument is composition, not the effort divisor.
- **P104** ([`104-perf-probe-retrieve-threshold-passes-on-zero-samples.md`](104-perf-probe-retrieve-threshold-passes-on-zero-samples.md))
  — found in the same sitting; the scoring convention used here is the one P104 was corrected to.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer`.

Captured via `/wr-itil:capture-problem` after reading pre-commit hook output rather than skipping past it.
Hang-off check dispatched against P101, P102 and P103 — verdict PROCEED_NEW, on the grounds that all three
share ADR-046 only as a causal origin, not as a root cause or fix locus.
