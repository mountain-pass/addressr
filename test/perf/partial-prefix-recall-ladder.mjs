// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// ADR-042 Confirmation criterion 2 — the partial-prefix recall gate.
//
// Property under test, from ADR-041's Confirmation: as a user types more of a
// real address, that address must not fall off the returned page.
//
// TWO INSTRUMENT DEFECTS ARE BAKED OUT OF THIS, BOTH FOUND THE HARD WAY on
// 2026-08-06/07. Get either wrong and the ladder reports a confident number
// that means nothing:
//
//   1. MEASURE AT PAGE LEVEL, NOT MATCH LEVEL. `hits.total` is IDENTICAL across
//      every candidate, because the bool_prefix clause matches regardless and
//      the candidates only move score. A matching-level ladder reports zero
//      effect for everything.
//
//   2. CUT MID-WORD. The effect only appears when the final token is a genuine
//      partial with no exact term for the expansion to select. Cutting at a
//      fraction of address length lands on word boundaries and measured 0
//      losses over 360 probes — a vacuous null — while the same instrument
//      reproduced the known losses every time.
//
// SENSITIVITY GATE. Aborts unless it reproduces the four losses P078 recorded
// for `max_expansions: 1`. Nothing below the gate is evidence if it fails.
//
//   ADDRESSR_PROBE_HOST=search-xxxx.ap-southeast-2.es.amazonaws.com \
//     node test/perf/partial-prefix-recall-ladder.mjs [--variant anchored] [--targets 90]

/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable n/no-process-exit, unicorn/no-process-exit --
   This file IS a CLI app, which is the carve-out both rules name in their own
   messages ("Only use process.exit() in CLI apps"). A gate that cannot exit
   non-zero is a number in a document, which is what test/perf/README.md says
   this directory exists to avoid. Scoped to these two rules only. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeClient, search, mapLimit, PAGE_SIZE } from './relevance-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

// Defaults to baseline deliberately: baseline is what production actually runs
// until the fix ships, so a reviewer's first run should measure the live system
// rather than a candidate. Name the candidate explicitly to measure it.
const variant = argument('variant', 'baseline');
const targetCount = Number(argument('targets', '90'));

// P078's four recorded max_expansions:1 losses. If these do not reproduce, the
// ladder is not measuring what it claims to.
const KNOWN = [
  ['14 FALK', '14 FALKLAND CL, WINMALEE NSW 2777'],
  ['49 CHURCH ST', '49 CHURCH ST, DUBBO NSW 2830'],
  ['6 ILLAW', '6 ILLAWARRA ST, ALLAWAH NSW 2218'],
  ['28 GREEN POI', '28 GREEN POINT RD, OYSTER BAY NSW 2225'],
];

const PARTIAL_LENS = [3, 4, 5];

const client = probeClient();

const found = async (probe, target, v) => {
  const hits = await search(client, {
    query: probe,
    variant: v,
    size: PAGE_SIZE,
  });
  return hits.some((h) => h.sla === target);
};

// --- sensitivity gate ---------------------------------------------------
const gate = await mapLimit(KNOWN, 4, async ([probe, target]) => ({
  probe,
  base: await found(probe, target, 'baseline'),
  clipped: await found(probe, target, 'max_expansions:1'),
}));
const gateOk = gate.every((g) => g.base && !g.clipped);
console.log(`SENSITIVITY GATE: ${gateOk ? 'PASS' : 'FAIL'}`);
if (!gateOk) {
  console.error(JSON.stringify(gate, undefined, 1));
  console.error(
    '\nABORT: the ladder cannot reproduce the four losses P078 recorded for ' +
      'max_expansions:1. Nothing below this line would be evidence.',
  );
  process.exit(1);
}

// --- frame: mid-word cuts in the 2nd and 3rd tokens ---------------------
const frame = JSON.parse(
  fs.readFileSync(path.join(here, 'exact-vs-range-frame.json'), 'utf8'),
);
const seen = new Set();
const probes = [];
for (const entry of frame) {
  const t = entry.probe;
  if (seen.has(t) || !t.includes(',')) continue;
  seen.add(t);
  const words = t.replaceAll(',', '').split(/\s+/);
  const cuts = [1, 2]
    .filter((wordIndex) => words[wordIndex])
    .map((wordIndex) => ({
      word: words[wordIndex],
      head: words.slice(0, wordIndex).join(' '),
    }));
  for (const { word, head } of cuts) {
    for (const k of PARTIAL_LENS) {
      if (k < word.length) probes.push([`${head} ${word.slice(0, k)}`, t]);
    }
  }
  if (seen.size >= targetCount) break;
}

const base = await mapLimit(probes, 6, ([p, t]) => found(p, t, 'baseline'));
const cand = await mapLimit(probes, 6, ([p, t]) => found(p, t, variant));

const results = probes.map(([probe], index) => ({
  probe,
  base: base.at(index),
  cand: cand.at(index),
}));
const lost = results.filter((r) => r.base && !r.cand).map((r) => r.probe);
const gained = results.filter((r) => !r.base && r.cand).length;
const net = gained - lost.length;

console.log(
  JSON.stringify(
    {
      gate: 'partial-prefix recall (ADR-042 Confirmation 2)',
      variant,
      probes: probes.length,
      targets: seen.size,
      baselineFound: base.filter(Boolean).length,
      candidateFound: cand.filter(Boolean).length,
      lost: lost.length,
      gained,
      net,
      lostExamples: lost.slice(0, 6),
    },
    undefined,
    1,
  ),
);

if (net < 0) {
  console.error(`\nFAIL: net ${net} — the candidate loses more than it gains.`);
  process.exit(1);
}
console.log(`\nPASS: net ${net >= 0 ? `+${net}` : net}`);
