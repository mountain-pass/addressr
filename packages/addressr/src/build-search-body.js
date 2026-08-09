// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// The OpenSearch request body for `/addresses?q=`, in clean ESM so a
// behavioural test can assert the exact query production sends — the same
// reason `init-index-config.js` exists for the index config (ADR-041 / P069).
//
// Before this module the body was built inline in `searchForAddress` and
// hand-copied into `test/integration/search-analysis.test.mjs` under a comment
// claiming it was "the exact query searchForAddress builds". It was not: the
// copy carried no `from`, no `sort` and no `highlight`. That divergence made
// ADR-041's superset-property gate non-load-bearing — it would stay green while
// production changed underneath it (P074 Fix Strategy prerequisite 3, P033).
//
// Returns the BODY only. The index name is the caller's business: this module
// must not reach for `ES_INDEX_NAME`, or a test that targets its own fixture
// index cannot use it.

/**
 * Build the `/addresses?q=` search body.
 *
 * @param {object} options
 * @param {string} options.searchString - the raw user query; falsy omits the
 *   `should` clauses entirely, matching the previous inline behaviour.
 * @param {number} [options.page] - 1-based page number. May be undefined.
 * @param {number} options.pageSize
 * @returns {object} the OpenSearch request body
 */
export function buildAddressSearchBody({ searchString, page, pageSize }) {
  // ADR 043's selectivity gate: has the user typed past the street number?
  //
  // GATED ON SELECTIVITY, NOT LENGTH. A prefix on a ~16.9M-term keyword
  // dictionary costs whatever it matches. Measured against production: `1` took
  // 2651 ms against a 334 ms baseline, `10` is two characters and still cost
  // +191 ms, while `A` was FASTER than baseline because almost no SLA begins
  // with a letter. So a character count is the wrong rule.
  //
  // The space is itself the selectivity: `prefix: '1'` enumerates 1…, 10…,
  // 100…, 11…, whereas `prefix: '1 '` reaches only street-number-exactly-1 and
  // measured within noise of baseline. That is why the predicate is a non-space
  // followed by whitespace, and NOT merely "contains whitespace" — the two
  // differ on a leading-space query, and ADR 043 Reassessment Criterion 2
  // exists to protect this predicate specifically.
  //
  // Nothing is lost before the gate opens: the page is 8 rows drawn from
  // millions either way, so there is no discrimination available to add.
  const isAnchored = /\S\s/.test(searchString ?? '');
  return {
    // `(page - 1 || 0)` is load-bearing and deliberately not `(page ?? 1) - 1`:
    // for the undefined-page first call `NaN || 0` yields 0. Changing it also
    // changes the page=0 and non-numeric cases.
    from: (page - 1 || 0) * pageSize,
    size: pageSize,
    query: {
      bool: {
        ...(searchString && {
          should: [
            {
              multi_match: {
                fields: ['sla', 'ssla'],
                query: searchString,
                // ADR 027: AUTO:5,8 (not default AUTO / AUTO:3,6) so that
                // 3-4 digit street numbers and postcodes require exact
                // match. Default AUTO lets `138` fuzzy-match `137`, `135`
                // etc., which tf-inflates adjacent-number docs above the
                // actual target (P026). 5+ char tokens still get 1 edit
                // (Muray → Murray), 8+ char tokens get 2 edits.
                fuzziness: 'AUTO:5,8',
                type: 'bool_prefix',
                lenient: true,
                auto_generate_synonyms_phrase_query: false,
                operator: 'AND',
              },
            },
            ...(isAnchored
              ? [
                  {
                    // ADR 043: "starts with", not "contains".
                    //
                    // This replaced a phrase_prefix clause, which matches a
                    // phrase ANYWHERE in the field. A sub-unit's sla contains
                    // its parent's whole token sequence, so under "contains"
                    // the parent-vs-child discriminator was absent from the
                    // text by construction and no scoring adjustment was
                    // well-posed. 60% of sub-unit-bearing addresses returned a
                    // sub-unit ahead of the address itself.
                    //
                    // Two fields because the user may type either notation:
                    // `14/2 PARKES` matches ssla, `UNIT 14, 2 PARKES` matches
                    // sla (ADR 025 — either way, It Will Just Work). dis_max
                    // takes the better of the two rather than summing them,
                    // which matters because sla === ssla on every address
                    // WITHOUT a sub-unit: a plain `should` pair would
                    // double-score exactly those docs, which is the summation
                    // asymmetry ADR 025 resolved.
                    //
                    // No explicit tie_breaker, so this is max and not a blend.
                    // That pin is ADR 028's, re-pointed here. Its ORIGINAL
                    // rationale does NOT survive the move: absent-field-
                    // contributes-0 mattered only while sla_range_expanded was
                    // absent on non-range docs. sla.raw and ssla.raw are
                    // populated on every document, so nothing is absent and a
                    // raised tie_breaker could not act as a malus. The pin
                    // survives on ADR 025 Driver 4: no tuning parameters.
                    //
                    // Uppercased because G-NAF stores SLAs uppercase and .raw
                    // carries no normalizer. .raw also carries no ignore_above,
                    // and that absence is load-bearing here — a limit would
                    // silently strand long SLAs from this clause. Pinned in
                    // test/js/__tests__/elasticsearch.test.mjs.
                    dis_max: {
                      queries: [
                        { prefix: { 'sla.raw': searchString.toUpperCase() } },
                        { prefix: { 'ssla.raw': searchString.toUpperCase() } },
                      ],
                    },
                  },
                ]
              : []),
          ],
        }),
      },
    },
    sort: [
      '_score',
      { confidence: { order: 'desc' } },
      { 'ssla.raw': { order: 'asc' } },
      { 'sla.raw': { order: 'asc' } },
    ],
    highlight: {
      fields: {
        sla: {},
        ssla: {},
      },
    },
  };
}
