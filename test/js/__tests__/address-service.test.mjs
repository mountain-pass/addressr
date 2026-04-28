import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// P033 caveat: this file uses source-inspection tests because
// service/address-service.js is babel-only and cannot be imported by raw
// Node ESM. A future extraction to clean ESM (per the gnaf-package-fetch.js
// precedent) would let these become behavioural tests. Until then, source
// inspection guards the integration shape only — behavioural correctness of
// imported helpers is covered by their own *.test.mjs files.

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

// ADR 026: query-side wiring for sla_range_expanded. The new field is added
// ONLY to the phrase_prefix multi_match clause of searchForAddress. It is
// deliberately excluded from the bool_prefix clause because bool_prefix sums
// scores across fields — adding a field populated only on range docs would
// reintroduce the P007-shape asymmetry that ADR 025 resolved. Additionally,
// phrase_prefix tie_breaker must remain at the OpenSearch default of 0.0:
// with best_fields max combination and tie_breaker=0, an absent field
// contributes 0 to the max and non-range docs are unaffected. This invariant
// is load-bearing per ADR 026 Consequences > Bad.
describe('service/address-service.js — searchForAddress query clauses (ADR 026)', () => {
  it('phrase_prefix multi_match fields includes sla_range_expanded', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const functionStart = source.indexOf(
      'export async function searchForAddress(',
    );
    assert.notEqual(functionStart, -1, 'searchForAddress must exist');
    const nextFunctionIndex = source.indexOf(
      '\nexport async function ',
      functionStart + 1,
    );
    const functionBody =
      nextFunctionIndex === -1
        ? source.slice(functionStart)
        : source.slice(functionStart, nextFunctionIndex);

    // Find the phrase_prefix multi_match and confirm its fields array
    // contains sla_range_expanded. Use a non-greedy match against the
    // multi_match block surrounding `type: 'phrase_prefix'`.
    const phrasePrefixBlock = functionBody.match(
      /multi_match\s*:\s*\{[\s\S]*?type\s*:\s*['"]phrase_prefix['"][\s\S]*?\}/,
    );
    assert.notEqual(
      phrasePrefixBlock,
      null,
      'phrase_prefix multi_match block must be parseable',
    );
    assert.match(
      phrasePrefixBlock[0],
      /fields\s*:\s*\[[^\]]*['"]sla_range_expanded['"][^\]]*\]/,
      'phrase_prefix multi_match fields array must include sla_range_expanded per ADR 026',
    );
  });

  it('bool_prefix multi_match fields does NOT include sla_range_expanded (protects ADR 025)', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const functionStart = source.indexOf(
      'export async function searchForAddress(',
    );
    const nextFunctionIndex = source.indexOf(
      '\nexport async function ',
      functionStart + 1,
    );
    const functionBody =
      nextFunctionIndex === -1
        ? source.slice(functionStart)
        : source.slice(functionStart, nextFunctionIndex);

    const boolPrefixBlock = functionBody.match(
      /multi_match\s*:\s*\{[\s\S]*?type\s*:\s*['"]bool_prefix['"][\s\S]*?\}/,
    );
    assert.notEqual(
      boolPrefixBlock,
      null,
      'bool_prefix multi_match block must be parseable',
    );
    assert.doesNotMatch(
      boolPrefixBlock[0],
      /sla_range_expanded/,
      'bool_prefix multi_match MUST NOT reference sla_range_expanded — bool_prefix sums across fields and would reintroduce P007-shape asymmetry (see ADR 025 and ADR 026)',
    );
  });

  it('phrase_prefix multi_match must not declare an explicit tie_breaker (must stay at default 0.0)', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const functionStart = source.indexOf(
      'export async function searchForAddress(',
    );
    const nextFunctionIndex = source.indexOf(
      '\nexport async function ',
      functionStart + 1,
    );
    const functionBody =
      nextFunctionIndex === -1
        ? source.slice(functionStart)
        : source.slice(functionStart, nextFunctionIndex);

    const phrasePrefixBlock = functionBody.match(
      /multi_match\s*:\s*\{[\s\S]*?type\s*:\s*['"]phrase_prefix['"][\s\S]*?\}/,
    );
    // Strip block and line comments before matching so a prose mention of
    // tie_breaker in a guardrail comment does not trigger the assertion.
    // Only a real key declaration `tie_breaker: <value>` should fail.
    const decommented = phrasePrefixBlock[0]
      .replaceAll(/\/\*[\s\S]*?\*\//g, '')
      .replaceAll(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(
      decommented,
      /\btie_breaker\s*:/,
      'phrase_prefix multi_match MUST NOT declare tie_breaker — raising it above 0.0 would let absent sla_range_expanded on non-range docs act as a malus, reintroducing the P007 asymmetry pattern. Any change here must either switch to ADR 026 Option C (symmetric population) first, or re-evaluate ADR 026.',
    );
  });
});

// ADR 027: `fuzziness: 'AUTO:5,8'` on the bool_prefix clause. The default
// `AUTO` (= `AUTO:3,6`) allows 1 edit for 3-5 char tokens, which causes
// adjacent street numbers to fuzzy-match each other (e.g. `138` matches
// `137`, `135`, `128`, `132`). Tightening to `AUTO:5,8` pushes the
// "0 edits" boundary up to 4-char tokens inclusive, killing numeric fuzz
// on 3-4 digit street numbers and postcodes while preserving typo tolerance
// on 5+ character street/locality names (`Muray` → `Murray` still works).
describe('service/address-service.js — bool_prefix fuzziness (ADR 027)', () => {
  it('bool_prefix multi_match declares fuzziness: "AUTO:5,8"', async () => {
    const source = await readFile(
      path.resolve(__dirname, '../../../service/address-service.js'),
      'utf8',
    );
    const functionStart = source.indexOf(
      'export async function searchForAddress(',
    );
    assert.notEqual(functionStart, -1, 'searchForAddress must exist');
    const nextFunctionIndex = source.indexOf(
      '\nexport async function ',
      functionStart + 1,
    );
    const functionBody =
      nextFunctionIndex === -1
        ? source.slice(functionStart)
        : source.slice(functionStart, nextFunctionIndex);

    const boolPrefixBlock = functionBody.match(
      /multi_match\s*:\s*\{[\s\S]*?type\s*:\s*['"]bool_prefix['"][\s\S]*?\}/,
    );
    assert.notEqual(
      boolPrefixBlock,
      null,
      'bool_prefix multi_match block must be parseable',
    );
    assert.match(
      boolPrefixBlock[0],
      /fuzziness\s*:\s*['"]AUTO:5,8['"]/,
      'bool_prefix multi_match fuzziness MUST be "AUTO:5,8" per ADR 027. Do not revert to plain "AUTO" (numeric fuzz reintroduced) or tighten further to "AUTO:6,8" (loses 5-char typo tolerance — see baseline query 8).',
    );
  });
});
