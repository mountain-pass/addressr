import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ADR 032 (P042): module-shape smoke test for the worker entry. The full
// handler integration surface (fetch behaviour, RapidAPI key injection,
// 401 body shape) is covered by the release.yml smoke probes at lines
// 230-246 — running them inside Node would require a CF runtime mock that
// out-scopes the user's "matcher unit tests only" TDD decision for P042.
// This test exists at the module-load level: it catches syntax errors,
// import resolution failures, and accidental loss of the `fetch` export
// shape that the Cloudflare runtime depends on.
describe('cloudflare-worker/worker — module shape', () => {
  it('exports a default object with a `fetch` function', async () => {
    const module_ = await import('./worker.js');
    assert.equal(typeof module_.default, 'object');
    assert.equal(typeof module_.default.fetch, 'function');
  });

  it('worker.fetch returns Response 500 when RAPIDAPI_KEY is missing (JTBD-200 fail-loud)', async () => {
    const module_ = await import('./worker.js');
    const request = new Request('https://api.addressr.io/addresses/X');
    const response = await module_.default.fetch(request, {});
    assert.equal(response.status, 500);
    assert.equal(await response.text(), 'RAPIDAPI_KEY not configured');
  });
});
