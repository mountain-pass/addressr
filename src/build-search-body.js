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
            {
              multi_match: {
                // ADR 028: sla_range_expanded added HERE ONLY (not in the
                // bool_prefix clause above). phrase_prefix uses best_fields
                // max with tie_breaker default 0.0, so an absent field on
                // non-range docs contributes 0 to the max — no P007-shape
                // asymmetry. Adding sla_range_expanded to the bool_prefix
                // fields would reintroduce the summation asymmetry ADR 025
                // resolved. DO NOT move this field into the clause above.
                fields: ['sla', 'ssla', 'sla_range_expanded'],
                query: searchString,
                // fuzziness: 'AUTO',
                type: 'phrase_prefix',
                lenient: true,
                auto_generate_synonyms_phrase_query: false,
                operator: 'AND',
              },
            },
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
