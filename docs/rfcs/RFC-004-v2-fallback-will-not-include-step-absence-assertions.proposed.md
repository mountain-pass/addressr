---
status: proposed
rfc-id: v2-fallback-will-not-include-step-absence-assertions
reported: 2026-07-19
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P029]
adrs: []
jtbd: []
stories: []
---

# RFC-004: Fix v2 fallback in Cucumber will-NOT-include step and restore absence assertions

**Status**: proposed
**Reported**: 2026-07-19
**Problems**: P029
**ADRs**: (none)
**JTBD**: (none)

## Summary

Fix the Cucumber step `Then the returned address list will NOT include:` so it works on v2 API responses, and restore the two stronger absence assertions in `addressv2.feature` that commit `cccac53` downgraded to first-result workarounds because of the step bug.

## Driving problem trace

- P029 (Cucumber `will NOT include:` step crashes on v2 API responses) — the step at `test/js/steps.js:379-393` reads `this.current.json` without the `|| this.current.content` fallback its sibling `will include:` step has, so every v2 scenario using it throws `TypeError: Cannot read properties of undefined (reading 'find')`.

## Scope

Single-commit, test-only fix derived from P029's Root Cause Analysis and Fix Strategy:

1. **Step fix** — `test/js/steps.js` `will NOT include:` step gains `const responseBody = this.current.json || this.current.content;` (mirroring the sibling `will include:` step at line 335). The matcher also gains the sibling's `pid` alternative plus a guarded links branch — `a.sla === entity.sla && (a.pid === entity.pid || (entity.links?.self?.href !== undefined && a.links?.self?.href === entity.links?.self?.href))` — because v2 collection items (`src/waycharter-server.js` collectionLoader) are `{sla, ssla?, highlight, score, pid}` with no `links` object: the old unconditional `a.links.self.href` would throw whenever an sla matched, and an unguarded optional-chained comparison would degrade to vacuous `undefined === undefined` matching (architect advisory, 2026-07-19).
2. **Restore absence assertions** — `test/resources/features/addressv2.feature`: the "P015 Mid-range" scenario regains `Then the returned address list will NOT include:` the 103-107 range doc (GAOT_717321171) before following the 1st item link, and the "Joint ADR 027 + ADR 028 integration" scenario regains the NOT-include for fuzzy-adjacent 109 GAZE RD (GAOT_717321172). Entities use `sla` + `pid` (the original `links.self.href` form cannot match v2 items). Scenario comments referencing the bug as unfixed are updated.
3. **Audit** — the locality/postcode/state list steps already carry the fallback (steps.js lines 421, 431, 443, 451, 467, 473, 484); no other step is affected.

TDD ordering per project mandate: the feature-file assertions land first and fail with a TypeError under the unfixed step; the steps.js fix turns the run green (`test:rest2:nogeo` profile).

## Stories

(none — single-commit test-only fix; work tracked via the `Refs: RFC-004` commit trailer, no story decomposition)

## Commits

(rendered from `git log --grep "Refs: RFC-004"` by `/wr-itil:manage-rfc` — no commits at capture)

## Related

- [P029](../problems/known-error/029-will-not-include-step-v2-api-bug.md) — driving problem ticket
- [ADR 027 — fuzziness AUTO:5,8](../decisions/027-fuzziness-auto-5-8.proposed.md) — restored fuzz-exclusion assertion strengthens its Confirmation coverage
- [ADR 028 — range-number endpoint-only](../decisions/028-range-number-endpoint-only.proposed.md) — restored mid-range absence assertion strengthens its Confirmation coverage
- Commit `cccac53` — the fix-forward workaround this RFC reverses
