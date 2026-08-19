#!/usr/bin/env node
// Did the perf probe actually measure the things it reports on?
//
// k6 exits 99 for "got slower" AND for "measured nothing", so the exit code
// cannot tell them apart. This reads the exported summary and answers the
// second question, because a latency threshold PASSES on an empty sample set:
// p(95) of zero requests is 0s, which satisfies p(95)<1000, so k6 prints a
// tick against a metric it never gathered. That is how the retrieve leg of
// this probe reported success for its entire life while throwing on every
// iteration (P104).
//
// Exit 0  the probe measured every leg — a breach is a real perf finding
// Exit 1  a leg collected nothing, or the summary could not be read — the
//         probe is broken and its signal is invalid
//
// Extracted from the workflow so it can be fed fixtures. A check that lives
// only as a shell one-liner inside YAML can be pinned as text and never run.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Every leg the probe claims to measure. A leg absent from the summary is
// indistinguishable from a leg that issued no requests, and both mean the
// same thing: nothing was measured.
export const REQUIRED_LEGS = ['search', 'retrieve'];

export function validate(summary, legs = REQUIRED_LEGS) {
  const counts = {};
  const empty = [];
  for (const leg of legs) {
    const metric = summary?.metrics?.[`http_reqs{phase:main,name:${leg}}`];
    const count = typeof metric?.count === 'number' ? metric.count : 0;
    counts[leg] = count;
    if (count === 0) empty.push(leg);
  }
  return { counts, empty, valid: empty.length === 0 };
}

function main(file) {
  let summary;
  try {
    summary = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(
      `::error::Perf probe summary could not be read (${error.message}), so validity could not be established. Treating as a broken probe.`,
    );
    return 1;
  }
  const { counts, empty, valid } = validate(summary);
  const measured = Object.entries(counts)
    .map(([leg, n]) => `${leg}=${n}`)
    .join(' ');
  if (!valid) {
    console.error(
      `::error::Perf probe measured NOTHING on: ${empty.join(', ')} (${measured}). A latency threshold cannot fail on an empty sample set, so this reports a pass while measuring nothing — the perf signal is invalid until it is fixed.`,
    );
    return 1;
  }
  console.log(`perf probe validity OK — ${measured}`);
  return 0;
}

// Only run when invoked directly, so the test can import validate(). Compared
// as a resolved file URL rather than by basename: an endsWith() check on the
// filename alone matches any file with the same name anywhere on disk.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv[2] ?? 'target/perf-summary.json'));
}
