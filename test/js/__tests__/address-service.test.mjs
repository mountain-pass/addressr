import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    const functionBody = source.slice(startIndex, startIndex + 10000);
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
    const nextFnIndex = source.indexOf('\nexport async function ', startIndex + 1);
    const fnBody =
      nextFnIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, nextFnIndex);
    const catchStart = fnBody.indexOf('error getting record from elastic search');
    assert.notEqual(
      catchStart,
      -1,
      'getAddress catch block must exist',
    );
    const catchBody = fnBody.slice(catchStart);

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
    const nextFnIndex = source.indexOf('\nexport async function ', startIndex + 1);
    const fnBody =
      nextFnIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, nextFnIndex);

    assert.match(
      fnBody,
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
