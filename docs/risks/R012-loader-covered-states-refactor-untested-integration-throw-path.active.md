# Risk R012: The COVERED_STATES predicate is tested; the caller that uses it is not

**Status**: Active
**Category**: operational (ISO 31000) — data loader correctness
**Identified**: 2026-07-18
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05
**Curation**: curated 2026-08-05 (superseding the auto-scaffolded pending-review state of 2026-07-18); re-scoped to the half that is genuinely uncovered

## Description

The entry was raised as "no behavioural test of `loadGnafData` integration or the throw path". Half of that has since been discharged and half has not, so the entry is re-scoped to the remaining half rather than closed.

**Covered.** `service/covered-states.js` was extracted as a pure module and `test/js/__tests__/covered-states.test.mjs` exercises case-normalisation, trimming, the empty/whitespace case, verbatim state-code derivation, and `matchesCoveredStatePrefix` including its negative and no-states-covered branches.

**Not covered.** `covered-states.js` deliberately exposes a should-throw **predicate** — its own comment says _"the caller performs the throw"_ — so the composition lives in `service/address-service.js`, which raw-Node ESM tests cannot import because it uses babel-only extensionless bare imports. Two caller compositions are unexercised:

1. **The fail-fast throw** (`address-service.js:1351-1355`) — the predicate is tested, the wiring is not.
2. **The `filesToCount` filter** (`address-service.js:1318-1324`) — composes `matchesCoveredStatePrefix` with an `/Authority/` regex disjunction. **This is the more dangerous of the two**, because it fails by silently miscounting rather than by throwing: a wrong filter here changes which files are loaded and the run reports success.

**A constraint on how this can be discharged**: `const COVERED_STATES = getCoveredStates()` sits at **module scope** (`address-service.js:47`), so it is frozen at import time. Any test that sets `process.env.COVERED_STATES` after importing the module gets the wrong answer. Whatever discharges this cannot be a naive env-var-then-import test.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 3 (Moderate) — a wrong state filter loads the wrong subset of G-NAF. Consumers get missing addresses rather than wrong ones, and it is recoverable by reloading, but it is a data-completeness defect in the product's core dataset.
- **Likelihood**: 3 (Possible) — the loader is quarterly and operator-driven, not per-request, so the code path runs rarely; but it runs unattended and the miscount branch is silent.
- **Inherent Score**: 9
- **Inherent Band**: Medium

## Controls

- **`test/js/__tests__/covered-states.test.mjs`** — evidenced unit coverage of the extracted predicate: normalisation, prefix matching, negative cases, and one `assert.throws`. Covers the parsing surface completely.
- **Low exercise frequency** — the loader runs on the quarterly G-NAF refresh under operator supervision, not on the request path, so a defect has a human in front of it rather than reaching consumers directly.
- **CI loads a cached G-NAF with an OT fixture** — the loader path is executed in CI on every build, so a hard failure (the throw case) would surface even without a targeted test. This does **not** cover the silent-miscount case.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 3 (Moderate) — unchanged. No control makes an incomplete dataset less incomplete.
- **Likelihood**: 2 (Unlikely) — the throw branch is effectively exercised by CI's loader run; what remains uncovered is the silent `filesToCount` miscount, which is the narrower branch.
- **Residual Score**: 6
- **Residual Band**: Medium
- **Within appetite?**: **No** — appetite is 5 inclusive, so 6 is one point over.

## Treatment

**Mitigate.** The treatment is the established precedent for exactly this shape: extract the caller composition into a clean-ESM sibling module and pin it with a test that re-expresses the composition, rather than grepping `address-service.js` for it.

`service/gnaf-directory.js` (2026-08-03) is the worked example — its _"composes with the caller arithmetic"_ test asserts the composition behaviourally rather than by source inspection, which is what keeps it clear of P033 (source-inspection tests are an anti-pattern). `service/gnaf-package-fetch.js` and `service/covered-states.js` itself are earlier instances of the same move.

Sequencing note: this sits one point above appetite on a quarterly, supervised code path. It is not urgent, but it should not be quietly re-scored to 5 to make it disappear.

## Monitoring

- **Trigger to re-assess**: any change to `COVERED_STATES` handling, the `filesToCount` filter, or the loader's file-selection logic; also a quarterly refresh that loads an unexpected file count.
- **Metrics**: files selected vs files expected on each quarterly load.

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: [P034](../problems/closed/034-loader-covered-states-case-sensitive.md) — the case-sensitivity defect that prompted the extraction.
- Precedent for the treatment: `service/gnaf-directory.js` + `test/js/__tests__/gnaf-directory.test.mjs`.
- Personas affected: [self-hosted-operator](../jtbd/self-hosted-operator/persona.md) — this is the operator's loader, not the hosted API path.

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-16T05:53:49Z: fired in `.risk-reports/2026-07-16T05-53-49-commit.md` (reason: above-appetite-residual)

## Change Log

- 2026-07-18: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
- 2026-08-05: Curated under P083 and re-scoped. The parsing half was discharged by the P034 extraction and its tests; the caller-composition half was not, and the architect identified a second uncovered composition (`filesToCount`) plus the module-scope-freeze constraint that shapes how it can be tested. Scored 9 inherent / 6 residual, one point above appetite.
