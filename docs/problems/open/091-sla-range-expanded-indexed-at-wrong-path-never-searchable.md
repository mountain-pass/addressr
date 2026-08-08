# Problem 091: `sla_range_expanded` has never been searchable, and the measurement says it should be removed rather than repaired

**Status**: Open
**Reported**: 2026-08-08
**Priority**: 10 (High) — Impact: Minor (2) × Likelihood: Almost certain (5). **Re-rated down 2026-08-08** from Impact 3 after measuring the field's value: it contributes nothing to recall and would be net-harmful if restored, so the harm is dead weight plus an undocumented API leak, not a lost capability. Impact 2 per RISK-POLICY § Impact: Impact 3 per RISK-POLICY § Impact: the customer-visible effect is ranking-only on `/addresses?q=` — endpoint **recall** works, carried by the whitecomma tokenizer split, so no address is unfindable. The larger harm is to the record: two ADRs and a closed problem ticket rest on a mechanism that has never executed. Likelihood 5: not probabilistic. All **349,540** range-form documents in production are affected, and have been since the code landed 2026-04-20.
**Origin**: internal — surfaced 2026-08-08 when the maintainer asked for the `108 GAZE RD` case to be tested and the field turned out to be empty on every production document.
**Effort**: S — on the leading option (remove the field) this is deleting generation and mapping; no re-index is needed for correctness because nothing queries it, and the `_source` change rides the next load. Re-rated L → M → S across 2026-08-08 as the measurements narrowed the work.
**WSJF**: 10.0 — (10 × 1.0) / 1
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

`sla_range_expanded` is **generated correctly and stored at the wrong path**, so the mapped, queried field has always been empty.

Measured against production `addressr6`, 2026-08-08:

```
_source.sla_range_expanded            = undefined
_source.structured.sla_range_expanded = ["96 GAZE RD, CHRISTMAS ISLAND OT 6798",
                                         "108 GAZE RD, CHRISTMAS ISLAND OT 6798"]
```

Those are exactly the two endpoint aliases [ADR-028](../../decisions/028-range-number-endpoint-only.proposed.md) specifies. `expandRangeAliases` works. `mapAddressDetails` attaches its output. The defect is downstream, in document assembly.

`service/address-service.js`, the bulk-index body builder:

```js
const { sla, ssla, ...structured } = item;
indexingBody.push({ sla, ssla, structured, confidence: …, locality_pid: … });
```

`sla` and `ssla` are hoisted to the top level. **Everything else is swept into `structured`** — including `sla_range_expanded`. Meanwhile `src/init-index-config.js` declares `sla_range_expanded` as a **top-level** field, and every query that ever targeted it targeted the top level. The two have never met.

## Symptoms

Confirmed three independent ways against production, with a control proving the method works:

| probe                                           | count      |
| ----------------------------------------------- | ---------- |
| `exists: sla_range_expanded`                    | **0**      |
| `match sla_range_expanded: "GAZE"`              | **0**      |
| `match sla_range_expanded: "RD"`                | **0**      |
| control — `match sla: "GAZE"`                   | 397        |
| documents whose `sla` is a range form (`N-M …`) | 349,540    |
| total documents                                 | 16,905,824 |

## Workaround

None required at the API surface. Endpoint recall is unaffected: the whitecomma tokenizer splits `103-107` into `103` and `107`, so `bool_prefix` reaches range documents by either endpoint number regardless. Only the ranking contribution ADR-026 and ADR-028 intended is missing.

## Impact Assessment

- **Who is affected**: consumers of `/addresses?q=` querying range addresses. Ranking only, and only where the range document's own `sla` does not already prefix-match the query.
- **Frequency**: every range-form document, continuously, since 2026-04-20.
- **Severity**: no result is lost. A ranking mechanism that two decisions depend on has silently never run.
- **Analytics**: not instrumented.

## Root Cause Analysis

**Confirmed, not hypothesised.** The destructure at the bulk-index assembly site names `sla` and `ssla` explicitly and rest-spreads the remainder into `structured`. When `sla_range_expanded` was added to `mapAddressDetails` on 2026-04-20 (`11697415`), the assembly site was not updated to hoist it alongside its siblings, so it inherited the rest-spread. The mapping was written for the intended path, the query for the intended path, and the document for the actual one.

### Why nothing caught it

Three layers of green over a field that does not work. This is tracked as its own problem — [P033](033-source-inspection-tests-anti-pattern.md), which **named this exact example when it was filed on 2026-04-28**, eight days after the defect landed:

1. `test/js/__tests__/address-service.test.mjs` asserts `/rval\.sla_range_expanded\s*=\s*expandRangeAliases\(/` **against the source text**. The assignment does exist. The test passes and proves nothing about the indexed document.
2. `test/js/__tests__/elasticsearch.test.mjs` asserts the **mapping declares** the field. It does. Declaration is not population.
3. ADR-028's Cucumber endpoint scenarios pass — via the tokenizer split, exactly as [ADR-043](../../decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.accepted.md) analysed. They would pass identically with the field absent, which is what they have been doing.

**No test at any level asserted that a range document is retrievable by its alias.** Note that a naive behavioural test would also have missed it: `mapAddressDetails` **does** return the right object. The loss happens after it returns. The invariant that needed pinning is end-to-end — what goes into the index is what the query can find.

### What this falsifies elsewhere

- **ADR-026 and ADR-028's index-side mechanism has never executed in production.** ADR-028's endpoint-query ranking win was never delivered, so ADR-043 could not have "lost" it.
- **[P015](../closed/015-range-number-addresses-not-searchable-by-base-number.md) was closed on a fix that never ran.** Range addresses are findable by base number — via the tokenizer, not the aliases.
- **[P075](075-adr041-inverts-exact-vs-range-on-one-address.md)'s stated mechanism is wrong for `addressr6`.** It attributes the inversion to _"ADR-028's `sla_range_expanded` last-endpoint alias"_; that alias is not in the index. The cause is what P075 itself names as the common parent — ADR-041 co-positioning compressing BM25 ratios.
- **ADR-043's recorded cost was overstated.** "`sla_range_expanded` leaves the query" removed a field carrying nothing, so the measured consequence is nil. ADR-043 and ADR-028's 2026-08-08 amendment both describe a suspended benefit that was never active, and need correcting.

### THE FIELD SHOULD PROBABLY BE REMOVED, NOT REPAIRED

Measured against production 2026-08-08, 150 randomly drawn range addresses:

|                                                                                                     | count | share |
| --------------------------------------------------------------------------------------------------- | ----- | ----- |
| neither endpoint exists as its own address — the only case the alias could help                     | 50    | 33.3% |
| at least one endpoint exists — the alias would make the range doc **compete with the real address** | 100   | 66.7% |

And in those 50 gap cases, **without** the alias, using only the whitecomma tokenizer split:

|                                 |         |
| ------------------------------- | ------- |
| probes run                      | 100     |
| range doc found at rank #1      | 92      |
| range doc found in page (top 8) | **100** |
| not in page                     | **0**   |

So the alias contributes **nothing to recall** where it is the only candidate, and where it is not, it boosts a range document against the actual address at that number — which is precisely the defect [P075](075-adr041-inverts-exact-vs-range-on-one-address.md) reports.

**This is ADR-028's Option D**, which it rejected in order to preserve an endpoint-ranking win that (a) never executed, and (b) would have been actively harmful in two-thirds of cases. The evidence says Option D was right.

### Investigation Tasks

- [ ] **Decide the feature question before any plumbing.** On the measurement above the answer is to remove `sla_range_expanded` entirely — stop generating it in `mapAddressDetails`, drop it from the mapping, and stop leaking it into the API response — making ADR-028 Option D outright. Repairing the path first would be building plumbing for a feature the data says we do not want.
- [ ] Widen the sample before acting. 150 range addresses with one fixed seed is enough to make removal the leading option, not enough to close it. Re-draw and confirm the 0-not-in-page result holds.
- [ ] Note the one unavoidable consequence: removing the field from `_source` changes the `GET /addresses/{id}` response body and therefore the ETag (`md5(JSON.stringify(json))`) for range addresses — the same blast radius as the rejected hoist. The difference is that here it is the deliberate removal of an undocumented field rather than a side effect, and it rides a load boundary naturally. `mla` leaks the same way and should be decided at the same time.
- [ ] Add the test that would have caught this: index a range document and assert what the query can actually find. End-to-end, not a return-value check and not a source-inspection regex — see [P033](033-source-inspection-tests-anti-pattern.md).
- [ ] Amend ADR-028 to Option D, and correct ADR-026, ADR-043 and [P015](../closed/015-range-number-addresses-not-searchable-by-base-number.md)'s closure once the decision lands.
- [ ] **If** the decision instead goes to keeping the field, the fix shape matters. Do NOT hoist it in the loader: `getAddress` builds its response as `{ ..._source.structured, sla }`, so hoisting removes a served field and flips every range address's ETag. Map the path the data already occupies (`structured.sla_range_expanded`) instead — no loader change, no response change, no ETag change, and an in-place `_update_by_query` rather than a full load.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P033, P075

## Related

- [P033](033-source-inspection-tests-anti-pattern.md) — the test class that let this stay green for four months, and which named this exact example in its Description eight days after the defect landed. Re-rated on this evidence.
- [ADR-028 — Range-number address expansion, endpoint-only](../../decisions/028-range-number-endpoint-only.proposed.md) — its index-side mechanism has never run.
- [ADR-026 — Range-number address expansion](../../decisions/026-range-number-address-expansion.superseded.md) — the originator of the field.
- [ADR-043 — Keyword-prefix anchor for street-level-first ranking](../../decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.accepted.md) — corrected 2026-08-08: its `sla_range_expanded` cost is recorded as nil, and the two places that wrongly credited the field with the `108 GAZE RD` fix are corrected.
- [ADR-029 — OpenSearch blue/green two-phase upgrade](../../decisions/029-opensearch-blue-green-two-phase-upgrade.accepted.md) — the re-index route.
- [P075](075-adr041-inverts-exact-vs-range-on-one-address.md) — its stated mechanism is falsified by this ticket.
- [P015](../closed/015-range-number-addresses-not-searchable-by-base-number.md) — closed on a mechanism that never executed.
- Captured via `/wr-itil:capture-problem`. Step 2a title-only grep matched P015, P075 and P033; P033 is the test-class parent and was **updated rather than duplicated**. Step 2b mechanical pre-filter returned 0 candidates.
