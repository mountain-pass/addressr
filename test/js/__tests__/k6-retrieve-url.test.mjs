// The perf probe's retrieve leg, exercised.
//
// WHY. The probe read `links.self.href` off a search hit. Nothing has ever
// served that key, so the read threw on every iteration, the retrieve request
// was never issued, and its p(95)<1000 threshold passed over zero samples —
// k6 printed a tick against the metric it had not collected. 21,860 measured
// iterations, 0 retrieve requests, 1 tick.
//
// The shape asserted here is the one the collection loader actually produces
// (packages/addressr/src/waycharter-server.js): { sla, ssla?, highlight,
// score, pid }.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveUrlFor } from '../../k6/retrieve-url.js';

const HIT = {
  sla: '19 MURRAY RD, CHRISTMAS ISLAND OT 6798',
  highlight: { sla: '19 <em>MURRAY RD</em>' },
  score: 5.43,
  pid: 'GAOT_717854783',
};

describe('perf probe — retrieve URL for a search hit (P104)', () => {
  it('builds the retrieve path from the pid the API actually returns', () => {
    assert.equal(retrieveUrlFor(HIT), '/addresses/GAOT_717854783');
  });

  it('throws on the shape the probe used to assume', () => {
    // The old read. If this ever stops throwing, the probe has been pointed
    // back at a key nothing serves.
    assert.throws(() => retrieveUrlFor({ links: { self: { href: '/x' } } }), TypeError);
  });

  it('throws rather than returning undefined for a hit with no pid', () => {
    // Returning undefined would build '/addresses/undefined' — a 404 that
    // still records a retrieve sample, which reads as "measured" and is worse
    // than not measuring, because it makes the threshold look satisfied.
    for (const bad of [{}, { pid: '' }, { pid: 42 }, undefined, null]) {
      assert.throws(() => retrieveUrlFor(bad), TypeError, `should reject ${JSON.stringify(bad)}`);
    }
  });
});
