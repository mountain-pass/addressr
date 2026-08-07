// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// ADR-042 Confirmation criterion 1 — the street-level-first property gate.
//
// Property under test, from ADR-025 Decision Driver 1: querying a street-level
// address verbatim, with no sub-unit token, must return that street-level
// record at position 1.
//
// THIS ASSERTS AND EXITS NON-ZERO. A threshold that cannot fail is a number in
// a document, which is the thing test/perf/README.md says this directory exists
// to avoid.
//
// FIXTURE SCALE CANNOT DISCHARGE THIS GATE. Measured 0% violations on both the
// OT fixture (5,186 docs) and a full TAS load (375,613 docs) while production
// measured 62.7%. Cucumber runs against OT. A green Cucumber run is not
// evidence about this property, and reading it as such is how the defect
// survived two closures.
//
//   ADDRESSR_PROBE_HOST=search-xxxx.ap-southeast-2.es.amazonaws.com \
//     node test/perf/street-level-first-probe.mjs [--variant baseline] [--n 150]
//     [--threshold 0.02] [--frame test/perf/sample.json]
//
// --frame reproduces a specific past measurement and its result is
// NON-DISCHARGING: the gate requires a fresh draw (ADR-042 Confirmation 1).

/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable n/no-process-exit, unicorn/no-process-exit --
   This file IS a CLI app, which is the carve-out both rules name in their own
   messages ("Only use process.exit() in CLI apps"). A gate that cannot exit
   non-zero is a number in a document, which is what test/perf/README.md says
   this directory exists to avoid. Scoped to these two rules only. */

import fs from 'node:fs';
import {
  probeClient,
  drawSample,
  search,
  mapLimit,
  PAGE_SIZE,
} from './relevance-lib.mjs';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

const variant = argument('variant', 'baseline');
// Capped: drawSample issues up to 40 function_score/random_score queries over
// the national corpus at size 200, a heavier shape than the product's own
// search. Nothing else bounds a run against production.
const MAX_N = 500;
const size = Math.min(Number(argument('n', '150')), MAX_N);
const threshold = Number(argument('threshold', '0.02'));
// Validate explicitly. `rate > NaN` is false, so an unparsable --threshold
// would make this gate print PASS on a typo, which is the one thing a gate
// must never do.
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
  throw new Error(
    `--threshold must be a fraction between 0 and 1; got ${argument('threshold')}`,
  );
}
const framePath = argument('frame');

const client = probeClient();

const sample = framePath
  ? JSON.parse(fs.readFileSync(framePath, 'utf8'))
  : await drawSample(client, size);

if (sample.length === 0) {
  throw new Error(
    'empty sample — cannot measure; check ADDRESSR_PROBE_HOST and the index name',
  );
}

const outcomes = await mapLimit(sample, 6, async (row) => {
  const hits = await search(client, {
    query: row.sla,
    variant,
    size: PAGE_SIZE,
  });
  return hits[0]?.id === row.id
    ? undefined
    : { want: row.sla, got: hits[0]?.sla ?? '<no hits>' };
});
const violations = outcomes.filter(Boolean);

const rate = violations.length / sample.length;
const pct = (rate * 100).toFixed(1);

console.log(
  JSON.stringify(
    {
      gate: 'street-level-first (ADR-042 Confirmation 1)',
      variant,
      frame: framePath
        ? `${framePath} (NON-DISCHARGING: frozen frame)`
        : 'freshly drawn',
      sample: sample.length,
      violations: violations.length,
      rate: `${pct}%`,
      threshold: `${(threshold * 100).toFixed(1)}%`,
      examples: violations.slice(0, 5),
    },
    undefined,
    1,
  ),
);

if (framePath) {
  console.log(
    '\nNON-DISCHARGING: a frozen frame reproduces a past measurement. ADR-042 ' +
      'Confirmation 1 requires a fresh draw per run, because a frozen sample ' +
      'degenerates into the instance-pinning that hid this defect for months.',
  );
  process.exit(0);
}

if (rate > threshold) {
  console.error(
    `\nFAIL: ${pct}% violate, threshold ${(threshold * 100).toFixed(1)}%`,
  );
  process.exit(1);
}
console.log(`\nPASS: ${pct}% violate, within ${(threshold * 100).toFixed(1)}%`);
