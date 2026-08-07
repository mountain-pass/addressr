import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAddressSearchBody } from '../../../src/build-search-body.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// P033 caveat: the remaining source-inspection tests in this file exist because
// service/address-service.js is babel-only and cannot be imported by raw Node
// ESM. Source inspection guards the integration shape only — behavioural
// correctness of imported helpers is covered by their own *.test.mjs files.
//
// Partially discharged 2026-08-07: the searchForAddress query-clause pins
// (ADR 027 / ADR 028) are now behavioural assertions against
// src/build-search-body.js, following the extraction-to-clean-ESM path this
// caveat anticipated. The read-shadow, progress-logging, getAddress and
// sla_range_expanded-attachment blocks below are still source-inspection.

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
      /import\s+\{\s*mirrorRequest\s*\}\s+from\s+['"]\.\.\/src\/read-shadow['"]/,
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

// ADR 026: range-number address expansion. mapAddressDetails must attach
// `sla_range_expanded` to the indexed document when the G-NAF address is
// range-numbered (`structured.number.last.number` set). Non-range docs
// leave the field absent (asymmetric population per ADR 026). The helper
// is imported from `./range-expansion` as a pure sibling module.
describe('service/address-service.js — sla_range_expanded attachment (ADR 026)', () => {
  it('imports expandRangeAliases from ./range-expansion', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    assert.match(
      source,
      /import\s*\{[^}]*\bexpandRangeAliases\b[^}]*\}\s*from\s*['"]\.\/range-expansion(?:\.js)?['"]/,
      'address-service.js must import expandRangeAliases from ./range-expansion per ADR 026',
    );
  });

  it('attaches rval.sla_range_expanded using expandRangeAliases', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    assert.match(
      source,
      /rval\.sla_range_expanded\s*=\s*expandRangeAliases\(/,
      'mapAddressDetails must attach rval.sla_range_expanded via expandRangeAliases per ADR 026',
    );
  });

  it('gates the attachment on structured.number.last being set (range addresses only)', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    // The attachment must appear inside a guard that references
    // `structured.number.last` (or an equivalent check on the last-number
    // field). Non-range docs MUST NOT receive the field per ADR 026's
    // asymmetric-population rule.
    const match = source.match(
      /(if\s*\([^)]*structured\.number[^)]*\.last[^)]*\)[\s\S]{0,400}rval\.sla_range_expanded)|(rval\.structured\.number\?\.last[^;]*\?[\s\S]{0,200}expandRangeAliases)/,
    );
    assert.notEqual(
      match,
      null,
      'rval.sla_range_expanded assignment must be gated on structured.number.last being set per ADR 026 (asymmetric population)',
    );
  });
});

// ADR 028 (query-side wiring for sla_range_expanded) and ADR 027 (bool_prefix
// fuzziness). These four assertions were source-inspection regexes over
// service/address-service.js until 2026-08-07 — the P033 anti-pattern. The
// query body now lives in src/build-search-body.js (clean ESM), so they assert
// on the built object instead. The invariants are unchanged; only the
// instrument is. Re-pointed rather than deleted per ADR 028 Reassessment
// Criterion 5, which fires on deletion or skipping of the tie_breaker pin.
const clausesFor = (q = '278 ROSS RIVER RD') =>
  buildAddressSearchBody({ searchString: q, page: 1, pageSize: 8 }).query.bool
    .should;
const byType = (type) =>
  clausesFor().find((c) => c.multi_match?.type === type)?.multi_match;

describe('src/build-search-body.js — searchForAddress query clauses (ADR 027 / ADR 028)', () => {
  it('phrase_prefix multi_match fields includes sla_range_expanded', () => {
    const phrase = byType('phrase_prefix');
    assert.ok(phrase, 'phrase_prefix multi_match clause must exist');
    assert.ok(
      phrase.fields.includes('sla_range_expanded'),
      'phrase_prefix multi_match fields array must include sla_range_expanded per ADR 028',
    );
  });

  it('bool_prefix multi_match fields does NOT include sla_range_expanded (protects ADR 025)', () => {
    const bool = byType('bool_prefix');
    assert.ok(bool, 'bool_prefix multi_match clause must exist');
    assert.ok(
      !bool.fields.includes('sla_range_expanded'),
      'bool_prefix multi_match MUST NOT reference sla_range_expanded — bool_prefix sums across fields and would reintroduce P007-shape asymmetry (see ADR 025 and ADR 028)',
    );
  });

  it('phrase_prefix multi_match must not declare an explicit tie_breaker (must stay at default 0.0)', () => {
    const phrase = byType('phrase_prefix');
    assert.ok(
      !('tie_breaker' in phrase),
      'phrase_prefix multi_match MUST NOT declare tie_breaker — raising it above 0.0 would let absent sla_range_expanded on non-range docs act as a malus, reintroducing the P007 asymmetry pattern. Any change here must either switch to ADR 028 Option C (symmetric population) first, or re-evaluate ADR 028.',
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
