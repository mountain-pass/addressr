---
'@mountainpass/addressr': patch
---

Internal refactor: nothing changes for callers of this package.

The `/addresses?q=` OpenSearch query body moved into its own module, `src/build-search-body.js`. The emitted body is byte-identical, including key order, verified across the undefined-page, page-zero and empty-query cases.

Why it moved: the body was built inline in `searchForAddress` and separately hand-copied into the integration test for [ADR-041 Equivalent Synonyms with a Synonym-Free Search Analyzer](docs/decisions/041-equivalent-synonyms-with-synonym-free-search-analyzer.accepted.md), under a comment claiming the copy was the exact query production sends. It was not. The copy carried no `from`, no `sort` and no `highlight`, so the ADR-041 superset-property gate could have stayed green through a real query change. Both now build from one source.

Four assertions covering the `bool_prefix` fuzziness setting from [ADR-027 Disable Fuzziness on Short Tokens via AUTO:5,8](docs/decisions/027-fuzziness-auto-5-8.proposed.md) and the `phrase_prefix` field wiring from [ADR-028 Range-Number Address Expansion, Endpoint-Only](docs/decisions/028-range-number-endpoint-only.proposed.md) also moved, from regexes over the service source to behavioural assertions against the builder's output.
