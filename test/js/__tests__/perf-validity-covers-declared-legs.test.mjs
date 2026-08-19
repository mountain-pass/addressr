// The validity check reads metric keys out of k6's summary. This asserts the
// probe actually DECLARES every leg the check reads.
//
// WHY. k6 emits a tagged submetric into --summary-export only when a threshold
// names it. An undeclared leg is not zero in the summary — it is ABSENT, which
// perf-validity.mjs reads as zero and reports as "measured nothing". So a leg
// the check requires but the probe never declares makes the nightly fail on
// every run, healthy or not.
//
// This was live: the first version of the fix declared a count threshold for
// `retrieve` and not for `search`, while REQUIRED_LEGS listed both. The
// fixture tests could not see it, because their helper WROTE both keys — they
// exercised the guard's logic against a shape k6 does not produce. A guard
// whose fixtures synthesise their own input contract has not tested the
// contract. Verified against target/stress-v1-summary.json, a real export,
// which carries only its two threshold-declared submetrics and no http_reqs
// submetric at all.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REQUIRED_LEGS } from '../../../scripts/perf-validity.mjs';

const probe = readFileSync(
  fileURLToPath(new URL('../../k6/regression.js', import.meta.url)),
  'utf8',
);

describe('perf probe declares every leg the validity check reads (P104)', () => {
  it('has legs to check in the first place', () => {
    // Without this, an emptied REQUIRED_LEGS makes the loop below vacuous and
    // this file passes while asserting nothing.
    assert.ok(REQUIRED_LEGS.length >= 2, 'both probe legs must be required');
  });

  it('tags the measured scenario phase:main, which every threshold key selects on', () => {
    // The third edge of the triangle: guard <-> threshold <-> emitted tag.
    // Every threshold key is scoped `{phase:main,...}`. Drop the scenario tag
    // and those keys select zero requests, so the guard reads every leg as
    // zero and reds a healthy probe with "measured NOTHING".
    assert.match(probe, /tags:\s*\{\s*phase:\s*'main'\s*\}/);
  });

  for (const leg of REQUIRED_LEGS) {
    it(`tags its requests name:${leg}, so the threshold key matches something`, () => {
      // A threshold on a tag nothing emits matches zero requests — same
      // symptom as an undeclared leg, and neither the guard nor a summary
      // fixture would notice, because both files would still agree.
      assert.ok(
        probe.includes(`name: '${leg}'`),
        `regression.js must tag requests with name: '${leg}'`,
      );
    });

    it(`declares an http_reqs count threshold for "${leg}", so its submetric is emitted`, () => {
      assert.ok(
        probe.includes(`'http_reqs{phase:main,name:${leg}}'`),
        `regression.js must declare a threshold on http_reqs{phase:main,name:${leg}}, ` +
          `or perf-validity.mjs will read that leg as zero on every run`,
      );
    });
  }
});
