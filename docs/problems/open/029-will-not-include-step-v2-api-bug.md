# Problem 029: Cucumber `will NOT include:` step crashes on v2 API responses

**Status**: Open
**Reported**: 2026-04-21
**Priority**: 4 (Low) — Impact: Minor (2) x Likelihood: Unlikely (2)

## Description

The Cucumber step definition `Then the returned address list will NOT include:` at [`test/js/steps.js:379-393`](../../test/js/steps.js) reads response content from `this.current.json` only, without the `this.current.json || this.current.content` fallback that the sibling `Then the returned address list will include:` step uses at [`steps.js:337`](../../test/js/steps.js).

For v1 API scenarios (`addresses.feature`) the response lands on `.json` and the step works. For v2 API scenarios (`addressv2.feature` — served by waycharter-based HATEOAS) the response lands on `.content`, so `this.current.json` is `undefined` and the step throws `TypeError: Cannot read properties of undefined (reading 'find')`.

Discovered when v2.4.0 was pushed to master with two new `addressv2.feature` scenarios that used `will NOT include:` to assert absence of false-positive matches (mid-range range doc for ADR 028 correctness, and fuzzy-adjacent 109 GAZE RD for ADR 027 + ADR 028 joint integration). CI `test:rest2:nogeo` failed. Fixed forward in commit `cccac53` by rewording the scenarios to use `1st "item" link is followed` + `returned address summary will be:` instead, which implicitly excludes the unwanted doc from the top slot but doesn't prove absence from the entire list.

Evidence:

```js
// steps.js:331-346 — will include (v1/v2 compatible, works correctly)
Then(
  'the returned address list will include:',
  async function (documentString) {
    const entity = JSON.parse(documentString);
    const responseBody = this.current.json || this.current.content;  // ← v2 fallback present
    const found = responseBody.find((a) => { ... });
    expect(found).to.not.be.undefined;
  },
);

// steps.js:379-393 — will NOT include (v1 only, crashes on v2)
Then(
  'the returned address list will NOT include:',
  async function (documentString) {
    const entity = JSON.parse(documentString);
    const found = this.current.json.find((a) => {                    // ← no v2 fallback; crashes
      return a.sla === entity.sla && a.links.self.href === entity.links.self.href;
    });
    expect(found).to.be.undefined;
  },
);
```

## Symptoms

- Every v2 Cucumber scenario that uses `Then the returned address list will NOT include:` fails with `TypeError: Cannot read properties of undefined (reading 'find')` at `steps.js:383`.
- v1 scenarios using the same step work correctly.
- CI pipeline `test:rest2:nogeo` (v2 profile) blocks any push that introduces such a scenario.

## Workaround

Use `1st "item" link is followed` + `returned address summary will be:` to assert the first result positively. Proves the unwanted doc is not ranked first, but doesn't prove it's absent from the entire list. Good enough for most ranking-invariant assertions; weaker than a direct absence assertion.

Currently in use in `addressv2.feature` lines 164-188 (ADR 028 mid-range scenario) and 228-259 (ADR 027 + ADR 028 joint integration scenario).

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer persona (J7 — Ship releases reliably from trunk) when authoring v2 Cucumber regression guards. Any future ADR that needs to assert _absence_ of a doc from v2 results hits this step.
- **Frequency**: Low — `will NOT include:` is less common than the positive `will include:` assertion. But when it is needed, it is needed.
- **Severity**: Minor — the workaround covers most first-result scenarios. The gap is "prove X is absent from the entire list of results", which is strictly weaker without the step fix.
- **Analytics**: N/A.

## Root Cause Analysis

### Confirmed cause

[`test/js/steps.js:383`](../../test/js/steps.js) reads `this.current.json` directly. The v1 API flow (via `rels/address-search` link template follow) stores response body on `.json`. The v2 API flow (via waycharter HATEOAS collection + `canonical` link) stores response body on `.content`. The sibling `will include:` step at [`steps.js:335`](../../test/js/steps.js) correctly handles both via the `|| this.current.content` fallback; the `will NOT include:` step was written earlier or simply missed the same treatment when v2 was added.

### Why it persisted

- No v2 scenario had used `will NOT include:` before v2.4.0's ADR 028 work, so the bug never fired. The `will include:` step was well-exercised; the negative assertion wasn't.
- The step's error message points at "reading 'find'" on line 383, not at the missing fallback — readers must trace back to see what `this.current.json` is to diagnose.

### Investigation Tasks

- [x] Root cause confirmed — `will NOT include:` step reads `.json` without `.content` fallback.
- [x] Workaround documented and in use in `addressv2.feature`.
- [ ] Add failing test or convert the workaround scenarios back to `will NOT include:` form as the regression test.
- [ ] Fix `steps.js:383` to use the same `|| this.current.content` fallback as line 335.
- [ ] Verify v2 scenarios pass with the fix.
- [ ] Audit steps.js for any other steps that read `this.current.json` directly without the fallback — same class of bug may exist on `contain many`, `NOT include` siblings for localities/postcodes/states (lines 428, 448, 471).

## Fix Strategy (proposed)

One-line change plus follow-up audit:

1. Edit `test/js/steps.js:383` to use `const responseBody = this.current.json || this.current.content;` and update `.find(...)` to use `responseBody`.
2. Rework the two `addressv2.feature` scenarios (currently using `1st item` workaround) back to direct `will NOT include:` assertions to regain the stronger "absent from entire list" semantic.
3. Audit the three other locality/postcode/state `will include:` / `will NOT include:` step pairs for the same bug pattern; fix any that are affected.

Estimated effort: 30-60 minutes including running the full Cucumber suite locally.

Eligible to transition straight to Known Error once the reproduction test is in place — root cause is confirmed and workaround is documented.

## Related

- [ADR 028 — Range-number endpoint-only](../decisions/028-range-number-endpoint-only.proposed.md) — the scenarios rewording lives in that ADR's Confirmation section.
- [ADR 027 — `fuzziness: 'AUTO:5,8'`](../decisions/027-fuzziness-auto-5-8.proposed.md) — the joint-integration scenario workaround.
- [ADR 009 — Cucumber BDD testing](../decisions/009-cucumber-bdd-testing.accepted.md) — unchanged by this fix.
- [`test/js/steps.js:337`](../../test/js/steps.js) — the sibling `will include:` step with the correct v2 fallback.
- [`test/js/steps.js:379-393`](../../test/js/steps.js) — the buggy step.
- [`test/resources/features/addressv2.feature`](../../test/resources/features/addressv2.feature) — scenarios 164-188 and 228-259 currently use the workaround.
- Commit `cccac53` — fix-forward that introduced the workaround.
