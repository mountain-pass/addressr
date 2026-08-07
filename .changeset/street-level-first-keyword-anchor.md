---
'addressr': patch
---

Search: return the street address itself, not its sub-units

Typing a street address that has units returned the units and never the address. `8 WATERS RD, NEUTRAL BAY NSW 2089` returned eight UNIT records at that address and not the address itself, which was in the index the whole time. Measured on a random national sample, 60% of addresses with sub-units did this.

The cause was that the query asked whether a field _contains_ what you typed, not whether it _starts with_ it. A sub-unit's address contains its parent's whole address, so under "contains" there was nothing in the text to tell parent and child apart, and the ranking was deciding a question with no correct answer.

`/addresses?q=` now anchors on the existing `sla.raw` / `ssla.raw` keyword subfields, which is native "starts with". On a freshly drawn 150-address national sample the failure rate is 0.0%. Partial-prefix recall is unchanged, and typing either `14/2 Parkes St` or `Unit 14, 2 Parkes St` still finds the same record. No re-index, no mapping change, and no extra round trip — latency is within noise of baseline.

Recorded in [ADR-043 — Keyword-prefix anchor for street-level-first ranking](docs/decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.proposed.md), which supersedes [ADR-042](docs/decisions/042-anchored-span-phrase-clause-for-street-level-first-ranking.superseded.md) and amends [ADR-028](docs/decisions/028-range-number-endpoint-only.proposed.md). Fixes [issue #375](https://github.com/mountain-pass/addressr/issues/375).
