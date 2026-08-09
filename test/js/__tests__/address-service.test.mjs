import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAddressSearchBody } from '../../../src/build-search-body.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// P033 caveat: the source-inspection tests remaining in this file were written
// when `service/address-service.js` could not be imported by raw Node ESM. That
// constraint is gone — ADR-044 retired Babel on 2026-08-08, the module resolves
// under raw Node ESM, and `waycharter-server.test.mjs` already imports it
// transitively through `buildRest2App` — and nothing structural replaced it.
// Every path they cover reaches OpenSearch only through `globalThis.esClient`, a
// stubbable global, and `mapAddressDetails` reaches no client at all. What
// remains is effort, not an obstacle; do not read this caveat as a licence to
// leave them. Source inspection guards the integration shape only — behavioural
// correctness of imported helpers is covered by their own *.test.mjs files.
//
// Partially discharged 2026-08-07: the searchForAddress query-clause pins
// (ADR 027 / ADR 028) are now behavioural assertions against
// src/build-search-body.js, following the extraction-to-clean-ESM path this
// caveat anticipated. The read-shadow, progress-logging and getAddress blocks
// below are still source-inspection.

// ADR 031: searchForAddress must call mirrorRequest after the primary
// search so v2 OpenSearch caches warm with realistic production query
// distribution before cutover. Behavioural correctness of mirrorRequest
// itself is covered by test/js/__tests__/read-shadow.test.mjs.
describe('service/address-service.js — read-shadow integration (ADR 031)', () => {
  it('imports mirrorRequest from src/read-shadow', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    assert.match(
      source,
      /import\s+\{\s*mirrorRequest\s*\}\s+from\s+['"]\.\.\/src\/read-shadow(\.js)?['"]/,
      'service/address-service.js must import mirrorRequest from ../src/read-shadow (ADR 031)',
    );
  });

  it('searchForAddress calls mirrorRequest after the primary client.search', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const startIndex = source.indexOf('export async function searchForAddress');
    assert.notEqual(startIndex, -1, 'searchForAddress must exist');
    const endMarker = source.indexOf('\nexport ', startIndex + 1);
    const functionBody = source.slice(
      startIndex,
      endMarker === -1 ? source.length : endMarker,
    );
    const searchIndex = functionBody.indexOf('globalThis.esClient.search');
    assert.notEqual(
      searchIndex,
      -1,
      'searchForAddress must call globalThis.esClient.search',
    );
    const mirrorIndex = functionBody.indexOf('mirrorRequest({');
    assert.notEqual(
      mirrorIndex,
      -1,
      'searchForAddress must call mirrorRequest (ADR 031)',
    );
    assert.ok(
      mirrorIndex > searchIndex,
      'mirrorRequest must be called AFTER the primary client.search await',
    );
    // mirrorRequest must NOT be awaited (fire-and-forget per ADR 031)
    const mirrorRegion = functionBody.slice(
      Math.max(0, mirrorIndex - 20),
      mirrorIndex,
    );
    assert.ok(
      !/await\s*$/.test(mirrorRegion),
      'mirrorRequest must NOT be awaited (fire-and-forget per ADR 031)',
    );
  });

  it('searchForAddress passes method=search and the same body to mirrorRequest', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const startIndex = source.indexOf('export async function searchForAddress');
    const endMarker = source.indexOf('\nexport ', startIndex + 1);
    const functionBody = source.slice(
      startIndex,
      endMarker === -1 ? source.length : endMarker,
    );
    assert.match(
      functionBody,
      /mirrorRequest\(\{[\s\S]*?method:\s*['"]search['"]/,
      'mirrorRequest must be called with method: "search"',
    );
  });
});

// P012: the loader used to JSON.stringify(rval) on every 1% / 10K rows of
// progress logging, producing ~60K lines per QLD reindex and drowning out
// real errors. The progress signal is the percent/row log that follows it —
// the JSON dump adds no diagnostic value that is not also available by
// enabling DEBUG=api locally on a small sample.
describe('service/address-service.js — progress logging (P012)', () => {
  it('mapAddressDetails does not JSON.stringify the address in progress logging', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const startIndex = source.indexOf('function mapAddressDetails');
    assert.notEqual(
      startIndex,
      -1,
      'function mapAddressDetails must exist in service/address-service.js',
    );
    // mapAddressDetails spans ~160 lines (~8000 chars). Read a generous
    // window and confirm JSON.stringify(rval, ...) is absent from the
    // progress-logging region inside the function body.
    const functionBody = source.slice(startIndex, startIndex + 10_000);
    const endIndex = functionBody.indexOf('\nasync function ');
    const scopedBody =
      endIndex === -1 ? functionBody : functionBody.slice(0, endIndex);
    assert.equal(
      scopedBody.match(/JSON\.stringify\(rval/g),
      null,
      'mapAddressDetails must not JSON.stringify(rval, ...) in progress logging — see P012',
    );
  });
});

// P014: getAddress's catch block used to dereference error_.body.found and
// error_.body.error.type without null-checking error_.body first. For non-
// OpenSearch errors (network timeouts, connection refused) error_.body is
// undefined, so the catch block itself threw a TypeError and the API
// returned 500 instead of the intended 404/503. The sibling getAddresses
// catch block at ~line 1905 already had the guards — getAddress must match.
describe('service/address-service.js — getAddress catch block (P014)', () => {
  it('guards error_.body before accessing .found and .error.type', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const startIndex = source.indexOf('export async function getAddress(');
    assert.notEqual(
      startIndex,
      -1,
      'export async function getAddress must exist in service/address-service.js',
    );
    const nextFunctionIndex = source.indexOf(
      '\nexport async function ',
      startIndex + 1,
    );
    const functionBody =
      nextFunctionIndex === -1
        ? source.slice(startIndex)
        : source.slice(startIndex, nextFunctionIndex);
    const catchStart = functionBody.indexOf(
      'error getting record from elastic search',
    );
    assert.notEqual(catchStart, -1, 'getAddress catch block must exist');
    const catchBody = functionBody.slice(catchStart);

    assert.match(
      catchBody,
      /error_\.body\s*&&\s*error_\.body\.found\s*===\s*false/,
      'getAddress catch must guard error_.body before reading .found — see P014',
    );
    assert.match(
      catchBody,
      /error_\.body\s*&&\s*error_\.body\.error\s*&&\s*error_\.body\.error\.type\s*===\s*['"]index_not_found_exception['"]/,
      'getAddress catch must guard error_.body.error before reading .type — see P014',
    );
  });

  it('maps RequestTimeout to 504 to align with getAddresses', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const startIndex = source.indexOf('export async function getAddress(');
    const nextFunctionIndex = source.indexOf(
      '\nexport async function ',
      startIndex + 1,
    );
    const functionBody =
      nextFunctionIndex === -1
        ? source.slice(startIndex)
        : source.slice(startIndex, nextFunctionIndex);

    assert.match(
      functionBody,
      /displayName\s*===\s*['"]RequestTimeout['"][\s\S]{0,200}statusCode:\s*504/,
      'getAddress must map RequestTimeout errors to 504 Gateway Timeout — see P014',
    );
  });
});

// ADR 026 / ADR 028 — the sla_range_expanded attachment assertions MOVED; they
// were not deleted, so ADR 028's re-point-not-delete precedent holds. They were
// three source-inspection regexes over this file's source: an import check, an
// assignment check, and a gate check. All three now EXECUTE the code, in
// `test/js/__tests__/build-indexed-document.test.mjs`, against
// `attachRangeAliases` extracted to `src/build-indexed-document.js` (P033).
//
// Worth recording why they were worth moving rather than keeping. The
// assignment regex matched `rval.sla_range_expanded = expandRangeAliases(`
// throughout the four months in which that field reached 0 of 16.9M production
// documents (P091). It was matching correct code. The defect sat at the
// assembly site seventy lines below, which had no test of any kind — a test
// named after the feature was watching the half that worked.

// ADR 028 (query-side wiring for sla_range_expanded), ADR 027 (bool_prefix
// fuzziness) and ADR 043 (the keyword-prefix anchor). These were
// source-inspection regexes over service/address-service.js until 2026-08-07 —
// the P033 anti-pattern. The query body now lives in src/build-search-body.js
// (clean ESM), so they assert on the built object instead.
//
// ADR 028's pins have now been re-pointed TWICE, both times re-pointed rather
// than deleted, so its Reassessment Criterion 5 has never fired: first from
// source regex to built object, then from the phrase_prefix clause to ADR 043's
// dis_max. The one pin that could NOT move is the old
// `phrase_prefix fields includes sla_range_expanded` assertion, because ADR 043
// removes that field from the query entirely. Its successor is the POSITIVE
// assertion below that the anchor targets exactly sla.raw and ssla.raw — and
// deliberately NOT a blanket "sla_range_expanded must never reappear", which
// would pre-block ADR 043 Reassessment Criterion 4, the criterion that exists to
// re-open precisely that question.
const clausesFor = (q = '278 ROSS RIVER RD') =>
  buildAddressSearchBody({ searchString: q, page: 1, pageSize: 8 }).query.bool
    .should;
const byType = (type) =>
  clausesFor().find((c) => c.multi_match?.type === type)?.multi_match;
const anchorIn = (clauses) => clauses.find((c) => c.dis_max)?.dis_max;

describe('src/build-search-body.js — the keyword-prefix anchor (ADR 043)', () => {
  it('anchors on exactly sla.raw and ssla.raw, with the query uppercased', () => {
    const anchor = anchorIn(clausesFor('8 waters rd'));
    assert.ok(anchor, 'a dis_max anchor clause must exist');
    assert.deepStrictEqual(anchor.queries, [
      { prefix: { 'sla.raw': '8 WATERS RD' } },
      { prefix: { 'ssla.raw': '8 WATERS RD' } },
    ]);
  });

  it('the anchor declares no explicit tie_breaker (ADR 028 pin, re-pointed)', () => {
    // Max across fields, not a sum. NOTE the original rationale for this pin
    // does not survive the move: absent-field-contributes-0 mattered because
    // sla_range_expanded was absent on non-range docs, whereas sla.raw and
    // ssla.raw are populated on EVERY document, so nothing is absent and a
    // raised tie_breaker could not act as a malus. Do not restore the old
    // message — it would state a false reason.
    assert.ok(
      !('tie_breaker' in anchorIn(clausesFor())),
      'the dis_max anchor MUST NOT declare tie_breaker. It is load-bearing for ADR 025 Decision Driver 4 (no tuning parameters): any non-zero value is a magic number needing its own justification. See ADR 028 Reassessment Criterion 5 as amended by ADR 043.',
    );
  });

  it('omits the anchor until the query advances past the street number', () => {
    // Selectivity, not length. "1" measured 2651 ms against a 334 ms baseline;
    // "10" is two characters and still cost +191 ms; "A" was FASTER than
    // baseline. The predicate is a non-space followed by whitespace, which is
    // NOT the same as "contains whitespace" — they differ on a leading space.
    for (const q of ['1', '10', '278', 'A', '  ', ' 8']) {
      assert.equal(
        anchorIn(clausesFor(q)),
        undefined,
        `must not anchor on ${JSON.stringify(q)}`,
      );
    }
    // The trailing space is where the clause becomes cheap AND useful: it is
    // the first keystroke at which there is anything to discriminate.
    for (const q of ['8 ', '8 W', '8 WATERS RD']) {
      assert.ok(anchorIn(clausesFor(q)), `must anchor on ${q}`);
    }
    // Accepted no-op: gated ON, but a leading space prefixes nothing, so the
    // anchor contributes zero and bool_prefix carries the query. Recorded so a
    // future reader does not read it as a defect.
    const leading = anchorIn(clausesFor(' 8 WATERS RD'));
    assert.deepStrictEqual(leading.queries[0], {
      prefix: { 'sla.raw': ' 8 WATERS RD' },
    });
  });
});

describe('src/build-search-body.js — searchForAddress query clauses (ADR 027 / ADR 028)', () => {
  it('bool_prefix multi_match fields is exactly [sla, ssla] (protects ADR 025)', () => {
    const bool = byType('bool_prefix');
    assert.ok(bool, 'bool_prefix multi_match clause must exist');
    assert.deepStrictEqual(
      bool.fields,
      ['sla', 'ssla'],
      'bool_prefix multi_match MUST NOT reference sla_range_expanded — bool_prefix sums across fields and would reintroduce P007-shape asymmetry (see ADR 025 and ADR 028)',
    );
  });

  it('bool_prefix multi_match declares fuzziness: "AUTO:5,8"', () => {
    const bool = byType('bool_prefix');
    assert.equal(
      bool.fuzziness,
      'AUTO:5,8',
      'bool_prefix multi_match fuzziness MUST be "AUTO:5,8" per ADR 027. Do not revert to plain "AUTO" (numeric fuzz reintroduced) or tighten further to "AUTO:6,8" (loses 5-char typo tolerance — see baseline query 8).',
    );
  });

  it('omits the should clauses entirely when searchString is empty', () => {
    const body = buildAddressSearchBody({
      searchString: '',
      page: 1,
      pageSize: 8,
    });
    assert.ok(
      !('should' in body.query.bool),
      'empty query must not build clauses',
    );
  });

  it('page-undefined first call starts at from: 0', () => {
    // `(page - 1 || 0)` is load-bearing: NaN || 0 -> 0. A `(page ?? 1) - 1`
    // rewrite would yield NaN here and break the first-page call.
    const body = buildAddressSearchBody({
      searchString: 'x',
      page: undefined,
      pageSize: 8,
    });
    assert.equal(body.from, 0);
  });
});
