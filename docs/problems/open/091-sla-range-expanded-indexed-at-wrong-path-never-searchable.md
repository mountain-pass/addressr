# Problem 091: `sla_range_expanded` has never been searchable, and the measurement says it should be removed rather than repaired

**Status**: Open
**Reported**: 2026-08-08
**Priority**: 10 (High) — Impact: Minor (2) × Likelihood: Almost certain (5). **Re-rated down 2026-08-08** from Impact 3 after measuring the field's value: it contributes nothing to recall and would be net-harmful if restored, so the harm is dead weight plus an undocumented API leak, not a lost capability. Impact 2 per RISK-POLICY § Impact: the customer-visible effect is ranking-only on `/addresses?q=` — endpoint **recall** works, carried by the whitecomma tokenizer split, so no address is unfindable. The larger harm is to the record: two ADRs and a closed problem ticket rest on a mechanism that has never executed. Likelihood 5: not probabilistic. All **349,540** range-form documents in production are affected, and have been since the code landed 2026-04-20.
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

**This is ADR-028's Option D**, which it rejected in order to preserve an endpoint-ranking win that (a) never executed, and (b) would have been actively harmful in the majority of cases. The evidence says Option D was right, and as of the 2026-08-09 widening it says so on 500 addresses rather than 150 — **within the bare-numeric-leading frame those measurements use, which is narrower than the population `attachRangeAliases` actually fires on.** The frame and its bias direction are set out under Investigation Task 2; do not quote this sentence without it.

**What is left is a product decision, not a measurement.** Removing the field changes the `GET /addresses/{id}` response body for range addresses and therefore their ETag, and amends a decision record to an option it explicitly rejected. That is the maintainer's call. The measurement no longer constrains it.

### Investigation Tasks

- [x] **DECIDED 2026-08-09: deprecate first, remove later.** Maintainer direction — mark the field deprecated in the spec and leave it in place for now. That avoids changing the `GET /addresses/{id}` response body and ETag for 349,540 range addresses, and gives consumers notice before anything disappears.

  **The direction assumed the field was in the spec. It was not, anywhere** — neither the OpenAPI 3 document served at `/api-docs` nor the shipped `api/swagger-2.yaml`. So deprecating it required documenting it first. That is the right way round: this project's own architecture holds the served representation to be the authoritative contract and any spec to be a supplementary view, so "absent from the spec" was never the same as "not promised". A consumer may well be depending on a field the spec never mentioned, which is exactly why silent removal would have been the worse outcome.

  Scope chosen was wider than this ticket's field, because the leak was not one class:

  | field                | served | was in `/api-docs` | was in shipped `swagger-2.yaml` | action                                          |
  | -------------------- | ------ | ------------------ | ------------------------------- | ----------------------------------------------- |
  | `sla_range_expanded` | yes    | no                 | no                              | **deprecated**                                  |
  | `precedence`         | yes    | no                 | no                              | **deprecated** — never promised anywhere either |
  | `mla`, `pid`         | yes    | no                 | yes, and `required`             | documented as supported                         |
  | `geocoding`          | yes    | no                 | under the wrong name, `geo`     | documented, name corrected                      |

  `geo` was the sharpest of these: a shipped artefact naming a property the API has never served. A wrong answer is worse than a missing one.

  Swagger 2.0 has no `deprecated` keyword for schema properties, so that file carries the notice in the property description; the OpenAPI 3 document sets `deprecated: true` **and** repeats it in the description, because whether a given renderer honours the flag is not something this repo can verify and a description is the one thing a spec view cannot omit.

- [ ] **Remove the field.** Deferred by the decision above, not cancelled. The trigger is the next full load — the `_source` change rides a load boundary naturally, so removal costs nothing extra when taken there. Original task text follows.
- [ ] **Decide the feature question before any plumbing.** On the measurement above the answer is to remove `sla_range_expanded` entirely — stop generating it in `mapAddressDetails`, drop it from the mapping, and stop leaking it into the API response — making ADR-028 Option D outright. Repairing the path first would be building plumbing for a feature the data says we do not want.
- [x] **Widened 2026-08-09. The 0-not-in-page result holds WITHIN THE FRAME MEASURED — see the frame caveat below before quoting this.** Fresh draw, fresh seed, 500 range addresses against production `addressr6` via `test/perf/range-alias-value-probe.mjs`:

  |                                                                     | 2026-08-08 (n=150, one seed) | 2026-08-09 (n=500, fresh seed) |
  | ------------------------------------------------------------------- | ---------------------------- | ------------------------------ |
  | neither endpoint exists — the only case the alias could help        | 33.3%                        | **38.6%** (193)                |
  | at least one endpoint exists — alias competes with the real address | 66.7%                        | **61.4%** (307)                |
  | endpoint probes, gap cases only                                     | 100                          | **386**                        |
  | range doc found at rank #1                                          | 92                           | **368** (95.3%)                |
  | range doc found in page                                             | 100                          | **386**                        |
  | **NOT in page**                                                     | **0**                        | **0**                          |

  Figures above are the corrected run. A first pass at n=500 read 39.2% / 60.8% before two instrument defects were fixed: the endpoint-existence lookup requested `size: chunk.length` on a `terms` query, which under-returns when G-NAF primary/secondary pairs share an `sla` and therefore misclassifies a _competing_ case as a _gap_ case; and the draw admitted `first >= last` forms, for which `expandRangeAliases` never emits an alias at all. Both inflated the gap share.

  **The two runs differ by 0.6 points, and that difference cannot be attributed to the correction.** They used different seeds, so the comparison confounds the fix with sampling variance: at n=500 and p≈0.39 the standard error on the difference between two independent proportions is about 3.1 points, and 0.6 is roughly one-fifth of one standard error — three addresses in five hundred. The accurate statement is that the corrected instrument at one seed agrees with the uncorrected instrument at another to well within sampling variance, and the defects' contribution is not separately resolvable at this N. `--seed` exists to reproduce a run and would attribute it cleanly, at the cost of ~50 more full-index passes for a three-address question.

  Scope the null carefully: it says **these two defects, at this frame, at this N** were not resolvable. It is not evidence that instrument defects here are generally immaterial — the open items below are the standing counter-argument.

  The alias contributes **nothing** to recall in the only case where it could, and in the majority case it would boost a range document against the actual address at that number.

  **What this measurement does NOT settle, stated because the conclusion is otherwise easy to over-read.** The frame is `^(\d+)-(\d+)\s+…` — a bare numeric range at the start of the `sla`. `attachRangeAliases` fires on a broader population than that: its trigger is `structured.number.last.number` being present, which also catches alpha-affixed ranges (`103A-107B GAZE RD, …`) and level/flat/building-prefixed ones (`UNIT 5, 103-107 GAZE RD, …`, which the `^` anchor rejects). So "0 not in page" is established **within the bare-numeric-leading frame** and is untested outside it.

  The bias direction is conservative for removal, and the reason is worth following. For those excluded cases `attachRangeAliases` builds its alias from `number.number` and `number.last.number` only — no prefix, no suffix, no flat, no level. So `UNIT 5, 103-107 GAZE RD, …` generates the alias `103 GAZE RD, …`: the _street-level_ address, with the unit silently dropped. Those are precisely the cases most likely to collide with a genuinely different real address, and a hit there would be an ADR-025 street-level-first violation rather than a recall win. Correcting the frame can only strengthen the case for Option D, never weaken it. The `349,540` figure in Symptoms shares the same frame and is therefore a floor.

  **The competing share is a floor for a SECOND reason, independent of the frame.** `present` is built from exact `sla.raw` matches, so an endpoint number occupied only by sub-unit addresses (`UNIT 1, 103 GAZE RD, …`) is counted as a _gap_ — "the only case the alias could help" — when the alias `103 GAZE RD` would in fact compete with those documents at street level. That is the same ADR-025 street-level-first collision the frame caveat identifies, arriving by a different route. So 61.4% understates the harm side twice over, for two unrelated reasons.

  **And the recall test was strictly harder than described.** The draw dedupes by `sla` and keeps one `_id`; the recall check matches that exact `_id`. Where G-NAF primary/secondary pairs share an `sla`, a result page containing the _sibling_ document scores as not-found. `0 not in page` was obtained under that stricter test.

  **The two measurements are independent in seed and sample size, NOT in frame.** Both use the same population definition, so their agreement is evidence about sampling variance and about nothing else. It says the first sample was not being reproduced by construction; it says nothing about whether the frame is the right one.

  The probe redraws per run by default; `--seed` reproduces a specific run and labels its own output non-discharging, per ADR-043 Confirmation 1.

- [ ] **Import the alias generator into the probe instead of restating it.** `test/perf/README.md` states the rule the probe currently breaks: the search body is imported and never restated, because a hand-copied body is what let the ADR-041 gate stay green while production diverged. The probe honours that for the query and breaks it for the population — `^(\d+)-(\d+)(\s+.*)$` is a hand-copy of what `attachRangeAliases` does, reconstructed by string surgery on the rendered `sla` where the generator builds from `structured.number`. The fix is cheap and closes the frame gap at the root rather than caveating it: `structured` is `enabled: false` but IS present in `_source` (this ticket's own Description proves it), so `_source: ['sla', 'structured.number']` returns the generator's real trigger at no extra query cost. Filter on `structured.number?.last?.number` and build aliases with the real `expandRangeAliases`. That subsumes the hand-coded `first >= last` skip and dissolves a rendered-vs-constructed normalisation class nobody has bounded — a zero-padded `007-011 …` gives probe aliases `007 …`/`011 …` where the generator emits `7 …`/`11 …`. **Needs a re-run, and the reason to hold it is atomicity rather than load.** The n=500 figures recorded above were produced by the CURRENT probe; landing the rewrite without re-running would put the committed instrument out of correspondence with the recorded numbers, so a later reader could not separate frame-widening from regression. Code and re-run belong in one hop.

  Recording the weaker reason I gave first, because it was wrong and the correction is the useful part: I initially deferred this as a production-load decision for the maintainer. That does not hold — the same probe was run against production three times in 48 hours without gating any of them, so declaring the fourth a load decision is inconsistent with the first three. **And a slice of this needs no production load at all**: exercising the rewritten probe against the local OT fixture proves the `_source: ['sla', 'structured.number']` route returns what is claimed and settles the zero-padding question outright. It cannot discharge the frame question — ADR-043 Confirmation 3 forbids reading fixture-scale as evidence about this property — but it is not load-gated and should be done first.

- [ ] **De-duplicate the restated facts rather than adding a fourth copy.** The frame caveat now lives in the ticket and the README; the load characterisation lives near-verbatim in the probe docblock and the README, sharing four hardcoded figures. They agree today. The mechanised half is defined work rather than an appeal to care: the `no entry contradicts a fact it declares canonical` check in `risk-register-invariants.test.mjs` is scoped to `docs/risks/` while three of its siblings already walk all of `docs/`. Widening it would let this ticket declare a canonical frame row and have it enforced.
- [ ] Note the one unavoidable consequence: removing the field from `_source` changes the `GET /addresses/{id}` response body and therefore the ETag (`md5(JSON.stringify(json))`) for range addresses — the same blast radius as the rejected hoist. The difference is that here it is the deliberate removal of an undocumented field rather than a side effect, and it rides a load boundary naturally. `mla` leaks the same way and should be decided at the same time.
- [ ] **Finish the spec-vs-response join.** The guard added 2026-08-09 (`waycharter-server.test.mjs`) catches drift of the SPEC against a hand-maintained key list — a key dropped, a phantom added, a notice stripped, all mutation-proved. It does NOT catch drift of the CODE against that list, which is the mechanism that produced this ticket: add a key in `mapAddressDetails` and the response grows one while every case stays green. The derivation that closes it is cheap — `buildIndexedDocument` does `const { sla, ssla, ...structured } = item`, so `Object.keys(buildIndexedDocument({ item }).structured)` IS the response key set, computed by production code. Also extend the join to `api/swagger-2.yaml`, which ships in the tarball, carries two of this batch's three corrections, and has no test of any kind.
- [ ] **Sweep the CLASS, not the instance: post-ADR-044 "babel-only" and "cannot be imported by raw Node ESM" claims, wherever they live.** Two were corrected on 2026-08-09 (`src/waycharter-server.js`'s graceful-shutdown re-export note, found by the risk scorer inside a batch that had already swept for a sibling class). `build-indexed-document.test.mjs` still asserts `mapAddressDetails` is "still babel-only and still without behavioural cover"; it went native ESM on 2026-08-08 and imports cleanly, so that note is actively hiding the derivation task above. Grep by bare token (`babel`, `cannot be imported`), not by phrase — one instance in this batch survived a phrase grep purely because prettier had wrapped it across a line boundary.
- [ ] **Extend the documented-vs-served join to `api/swagger-2.yaml`.** Split out of the derivation task above because it was a trailing clause there, which meant ticking the derivation would have silently closed it. That file ships in the tarball, carries two of the 2026-08-09 corrections, and has no test of any kind.
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
