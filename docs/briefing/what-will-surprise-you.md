# What Will Surprise You

Domain-data and API-shape surprises specific to G-NAF, OpenSearch, and WayCharter. The rest of this section was split by subject on 2026-07-28 (Tier-3 budget) into:

- [markers-and-edit-gates.md](./markers-and-edit-gates.md) — architect / JTBD / oversight marker mechanics
- [external-comms-marker-mechanics.md](./external-comms-marker-mechanics.md) — external-comms / voice-tone commit gates
- [external-comms-content-rules.md](./external-comms-content-rules.md) — what those gates reject on content
- [decisions-compendium.md](./decisions-compendium.md) — the compendium generator
- [releases-and-ci.md](./releases-and-ci.md) — changesets, workflow traps, the push guard, the risk-appetite gate
- [deploy-infra-and-caching.md](./deploy-infra-and-caching.md) — EB deploys, Cloudflare/RapidAPI edge, HTTP caching, GHCR publishing
- [agent-and-workflow-patterns.md](./agent-and-workflow-patterns.md) — recurring assistant failure modes + ITIL workflow traps
- [testing-tdd-and-code.md](./testing-tdd-and-code.md) — the TDD hook, test anti-patterns, ESM/babel quirks

## Domain data and API shape

- The file `client/elasticsearch.js` and all `ELASTIC_*` env vars reference "elasticsearch" but the system actually runs OpenSearch. Historical naming from before the fork.
- The G-NAF data loader requires up to 8GB RAM (`--max_old_space_size=8196`) and must run as a separate binary before the server.
- The G-NAF LOCALITY table's `PRIMARY_POSTCODE` field is almost empty (~4% in NSW, 0% in OT). Always derive postcodes from ADDRESS_DETAIL records.
- **G-NAF loader's `COVERED_STATES` is case-sensitive against uppercase G-NAF filenames (P034).** `service/address-service.js` matches `${state}_` against filenames like `OT_ADDRESS_DETAIL_psv.psv`. Lowercase `ot` produces an empty filtered list and the loader **silently** indexes 0 documents while logging "data loaded" + "Fin". Reproduced 2026-04-28 with v2.4.3 locally: `COVERED_STATES=ot` → 0 docs; `COVERED_STATES=OT` → 5186 addresses. The 9 `update-{state}.yml` workflows pass uppercase (e.g. `state: OT`); any new caller MUST do the same until the loader is hardened. Defence-in-depth at the loader level is tracked by P034.
- **data.gov.au's CloudFront WAF blocks bare Node `fetch()` (no User-Agent) with HTTP 403** that the loader fails to JSON.parse as an HTML error page. Fixed in v2.4.3 — `service/gnaf-package-fetch.js` now sends `Mozilla/5.0 (compatible; addressr-loader; +https://github.com/mountain-pass/addressr)` on every CKAN call. Affects ALL G-NAF refresh paths — last successful v1 quarterly was 2026-04-16 before the WAF rule landed, and silently broke until v2.4.3.
- WayCharter `itemLoader` returning `links` array works — they become Link headers. But waychaser strips `links` from JSON body content, so never embed link objects in the body.
- WayCharter collection items need `canonical` link follow to reach the item endpoint with custom Link headers. The `item` link from a collection gives a summary only.
- **The context-usage cheap layer reports `hooks bytes=0` and `skills bytes=0` in this repo, and about 37.5% of real context is therefore missing from the table.** `addressr` is an adopter tree with no `packages/` directory, so the source-tree walk honestly finds nothing — while `wr-retrospective-list-plugin-attribution`, which falls back to sniffing `$PATH` for the plugin cache, finds 535,955 bytes of hooks and 1,320,464 of skills (`wr-itil` skills alone are 1,008,146 — larger than the entire `decisions` bucket). Measured 2026-08-20; ADR-043's own contract says the aggregate must equal the sum of the per-plugin rows, and here it does not. Any trim decision made from the bucket table alone is computed over roughly 62% of the picture.
  <!-- signal-score: 2 | last-classified: 2026-08-20 | first-written: 2026-08-20 -->
