// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// Two steps of the indexing path, extracted from `service/address-service.js`
// into clean ESM so behavioural tests can execute them instead of regex-matching
// their source (P033). Same reason and same shape as `src/build-search-body.js`
// and `src/init-index-config.js`: the service file is babel-only and cannot be
// imported by raw Node ESM, so anything left inside it can only be asserted as
// text.
//
// WHY THIS PARTICULAR CODE. `sla_range_expanded` was generated correctly and
// then assembled into the wrong place, so it is populated on 0 of 16.9M
// production documents and has never been searchable (P091). The assertion that
// existed greps the service source for `rval.sla_range_expanded =
// expandRangeAliases(` — it matches, and the assignment it matches is correct.
// The loss happens ~70 lines later, at the assembly site below, which had no
// test of any kind. Attachment and assembly are different sites; the test named
// after the feature was watching the one that worked.

import { expandRangeAliases } from '../service/range-expansion.js';

/**
 * Attach the endpoint aliases for a range-numbered address (ADR 026 / ADR 028).
 *
 * Mutates and returns `rval`. Population is deliberately ASYMMETRIC: non-range
 * documents leave the field absent rather than carrying an empty array, so the
 * absent-field semantics the query relies on stay intact. `expandRangeAliases`
 * returns `[]` for an invalid span, which is treated the same as non-range.
 *
 * @param {object} rval - a mapped address, carrying `structured`
 * @returns {object} the same object
 */
export function attachRangeAliases(rval) {
  if (rval.structured.number?.last?.number === undefined) return rval;
  const s = rval.structured;
  const streetType = s.street.type ? ` ${s.street.type.name}` : '';
  const streetSuffix = s.street.suffix ? ` ${s.street.suffix.name}` : '';
  const aliases = expandRangeAliases(
    Number(s.number.number),
    Number(s.number.last.number),
    `${s.street.name}${streetType}${streetSuffix}`,
    `${s.locality.name} ${s.state.abbreviation} ${s.postcode}`,
  );
  if (aliases.length > 0) rval.sla_range_expanded = aliases;
  return rval;
}

/**
 * Assemble the document body sent to the index.
 *
 * REPRODUCES TODAY'S SHAPE EXACTLY, rest-spread included. That is deliberate:
 * moving `sla_range_expanded` to the top level would drop a field from
 * `GET /addresses/{id}` and change the ETag on every range document, because
 * `getAddress` spreads this `structured` bucket straight into its response and
 * hashes the result. That is P091's decision to make, not a refactor's, and its
 * leading option is to remove the field rather than relocate it.
 *
 * Note what `structured` is in the mapping: `{ type: 'object', enabled: false }`.
 * Nothing nested under it is indexed at all. A field that must be searchable has
 * to be a top-level key here — that is the invariant, and it is the one the
 * `sla_range_expanded` defect violates.
 *
 * `confidence` is legitimately `undefined` when the G-NAF row carries an empty
 * CONFIDENCE column; the key then drops at serialisation. Do not "tidy" that
 * with a default — it is a document-shape change wearing a refactor's clothes.
 *
 * @param {object} options
 * @param {object} options.item - a mapped address from `mapAddressDetails`
 * @param {string} [options.localityPid] - from the source row, not from `item`
 * @returns {object} the document body
 */
export function buildIndexedDocument({ item, localityPid }) {
  const { sla, ssla, ...structured } = item;
  return {
    sla,
    ssla,
    structured,
    confidence: structured.structured?.confidence,
    ...(localityPid !== undefined && { locality_pid: localityPid }),
  };
}
