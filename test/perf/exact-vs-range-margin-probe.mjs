// TERMINAL AS OF 2026-08-02 — THIS PROBE CANNOT RUN AGAIN.
//
// It is constitutively differential: it compares blue (addressr5, the
// pre-ADR-041 analyzer) against green (addressr6). Its sensitivity gate aborts
// unless blue reproduces the known flip, and every verdict it emits
// (blue-range-first, blue-exact-absent, swing) is a two-arm concept.
//
// addressr5 was DECOMMISSIONED 2026-08-02 (commit 2e557b9) after the ADR-041
// cutover and the P079 retention gate was met. There is no blue arm and there
// cannot be one again without a rebuild-from-G-NAF onto the old analyzer.
//
// The measurements it produced are therefore TERMINAL and unreproducible. They
// are preserved in exact-vs-range-margin-probe.out and in the frame at
// exact-vs-range-frame.json, and they are the evidence cited by P073, P074,
// P075 and P078. Treat those figures as the frozen record.
//
// Do NOT "fix" this by making the blue arm optional. A green-only run would emit
// output shaped like this probe's output while being no evidence at all — the
// same class of artefact test/perf/README.md warns about: "A reproducible 'the
// change made it faster' result is the signature of a broken A/B, not a win."
// If a future migration needs this comparison, stand up both arms first.

// P075: does ADR-041's co-positioning flip exact-vs-range pairs?
//
// The mechanism compresses BM25 score RATIOS, so it can only flip pairs whose
// pre-existing margin is narrow. Two axes must be stratified, and missing
// either produces a null result that reads as evidence but is not:
//
//   1. MARGIN — a uniform random draw under-samples the narrow band where the
//      mechanism bites. It also has to SPAN the band: a draw clustered far
//      below the known instance cannot bound the rate at the margin that
//      instance occupies.
//   2. QUERY FORM — under the full SLA blue often already ranks the range doc
//      first, so there is no blue-exact-first transition to detect at all. The
//      defect appears under the SHORT form users actually type. A first attempt
//      at this probe queried full SLAs and excluded the known instance by
//      construction.
//
// Reports green-side margin, not just a boolean: a null over pairs whose swing
// is ~0 means the frame is off-mechanism and the null is vacuous. A null over
// pairs with large-but-insufficient swings is real evidence.
//
// Needs BOTH domains warm. Must run before the v3 decommission.
//   node test/perf/exact-vs-range-margin-probe.mjs   (blue :6061, green :6060)
import fs from 'node:fs';

const KNOWN = {
  full: '108 GAZE RD, CHRISTMAS ISLAND OT 6798',
  range: '96-108 GAZE RD, CHRISTMAS ISLAND OT 6798',
};
const BAND = [0, 25];
const short = (sla) => {
  const m = sla.match(/^(.*?),\s*([^,]+?)\s+[A-Z]{2,3}\s+\d{4}$/);
  return m ? `${m[1]} ${m[2]}` : sla;
};
async function hits(port, q) {
  const r = await fetch(`http://localhost:${port}/addresses?q=${encodeURIComponent(q)}`);
  return r.ok ? (await r.json()).map((h) => ({ sla: h.sla, score: h.score })) : null;
}
function margin(list, exact, range) {
  const e = list.find((h) => h.sla === exact), r = list.find((h) => h.sla === range);
  if (!e || !r) return { m: null, exactAbsent: !e, rangeAbsent: !r };
  return { m: ((e.score - r.score) / r.score) * 100, exactAbsent: false, rangeAbsent: false };
}
async function assess(fullExact, fullRange) {
  const q = short(fullExact);
  // Fail with the REASON, not the symptom. Without this the probe hangs on a
  // tunnel to a domain that no longer exists and reports a timeout, which reads
  // like a flaky network rather than a decommissioned control arm.
  {
    throw new Error(
      'exact-vs-range-margin-probe requires a BLUE arm on :6061 (addressr5), ' +
        'which was decommissioned 2026-08-02 (commit 2e557b9). This probe is ' +
        'terminal - see the header. Its results are frozen in ' +
        'exact-vs-range-margin-probe.out.',
    );
  }
  const [b, g] = await Promise.all([hits(6061, q), hits(6060, q)]);
  if (!b || !g) return { verdict: 'query-error' };
  const bm = margin(b, fullExact, fullRange);
  if (bm.m === null) return { verdict: bm.exactAbsent ? 'blue-exact-absent' : 'blue-range-absent' };
  if (bm.m <= 0) return { verdict: 'blue-range-first', blueMargin: bm.m };
  const gm = margin(g, fullExact, fullRange);
  // green losing the exact doc entirely is STRICTLY WORSE than a range-first
  // flip, so it is a failure verdict, not a pass.
  if (gm.exactAbsent) return { verdict: 'green-exact-absent', q, blueMargin: bm.m };
  if (gm.m === null) return { verdict: 'green-range-absent', q, blueMargin: bm.m };
  return {
    verdict: gm.m <= 0 ? 'FLIP-green-range-first' : 'ok',
    q, blueMargin: bm.m, greenMargin: gm.m, swing: gm.m - bm.m,
  };
}

const k = await assess(KNOWN.full, KNOWN.range);
console.log(`SENSITIVITY GATE — ${short(KNOWN.full)}`);
console.log(`  blue ${k.blueMargin?.toFixed(1)}%  green ${k.greenMargin?.toFixed(1)}%  swing ${k.swing?.toFixed(1)}  verdict ${k.verdict}`);
if (k.verdict !== 'FLIP-green-range-first') {
  console.log('  ABORT: frame cannot reproduce the known flip. Nothing below is evidence.');
  process.exit(1);
}

const frame = JSON.parse(fs.readFileSync(new URL('./exact-vs-range-frame.json', import.meta.url)));
const buckets = {}, inBand = [], flips = [];
let read = 0;
for (const { probe, range } of frame) {
  if (inBand.length >= 60) break;
  read += 1;
  const r = await assess(probe.includes(',') ? probe : `${probe}`, range);
  buckets[r.verdict] = (buckets[r.verdict] || 0) + 1;
  if (r.blueMargin === undefined || r.blueMargin <= BAND[0] || r.blueMargin > BAND[1]) continue;
  if (!['ok', 'FLIP-green-range-first', 'green-exact-absent', 'green-range-absent'].includes(r.verdict)) continue;
  inBand.push(r);
  if (r.verdict !== 'ok') flips.push(r);
}
const swings = inBand.filter((x) => x.swing !== undefined).map((x) => x.swing);
const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))] ?? null;
console.log(JSON.stringify({
  frame_size: frame.length, probes_read: read,
  verdict_buckets: buckets,
  in_band_pairs: inBand.length, band_pct: BAND,
  blue_margin_spread: { min: q(inBand.map((x) => x.blueMargin), 0)?.toFixed(1), median: q(inBand.map((x) => x.blueMargin), 0.5)?.toFixed(1), max: q(inBand.map((x) => x.blueMargin), 1)?.toFixed(1) },
  green_swing: { min: q(swings, 0)?.toFixed(1), median: q(swings, 0.5)?.toFixed(1), max: q(swings, 1)?.toFixed(1) },
  failures: flips.length, failure_detail: flips.slice(0, 5),
}, null, 1));
