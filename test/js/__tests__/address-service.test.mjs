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
