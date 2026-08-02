// P075 R1, corrected frame. Stratified on BOTH axes the mechanism needs:
//   (a) blue-side margin — ratio compression only flips narrow-margin pairs
//   (b) QUERY FORM — the defect appears under the short form users type, not
//       the full SLA. Under the full SLA blue is often already range-first, so
//       a full-SLA frame has no regression to detect. My first attempt missed
//       the known instance for exactly this reason.
// Fails loud if it cannot reproduce the known instance: a null result from an
// instrument that cannot see the one flip we know about is worthless.
import fs from 'node:fs';
const KNOWN = { probe: '108 GAZE RD CHRISTMAS ISLAND', range: '96-108 GAZE RD, CHRISTMAS ISLAND OT 6798', full: '108 GAZE RD, CHRISTMAS ISLAND OT 6798' };
const short = (sla) => { const m = sla.match(/^(.*?),\s*([^,]+?)\s+[A-Z]{2,3}\s+\d{4}$/); return m ? `${m[1]} ${m[2]}` : sla; };
async function hits(port, q) {
  const r = await fetch(`http://localhost:${port}/addresses?q=${encodeURIComponent(q)}`);
  if (!r.ok) return null;
  return (await r.json()).map((h) => ({ sla: h.sla, score: h.score }));
}
async function assess(fullExact, fullRange) {
  const q = short(fullExact);
  const b = await hits(6061, q); if (!b) return null;
  const be = b.find((h) => h.sla === fullExact), br = b.find((h) => h.sla === fullRange);
  if (!be || !br) return null;
  const margin = (be.score - br.score) / br.score * 100;
  const g = await hits(6060, q); if (!g) return null;
  const gi = g.findIndex((h) => h.sla === fullExact), gr = g.findIndex((h) => h.sla === fullRange);
  return { q, margin, blueExactFirst: margin > 0, greenRangeFirst: gi > -1 && gr > -1 && gr < gi, greenExactAbsent: gi === -1 };
}
// SENSITIVITY GATE
const k = await assess(KNOWN.full, KNOWN.range);
console.log(`sensitivity: ${KNOWN.probe}\n  blue margin ${k.margin.toFixed(1)}%  blueExactFirst=${k.blueExactFirst}  greenRangeFirst=${k.greenRangeFirst}`);
if (!(k.blueExactFirst && k.greenRangeFirst)) {
  console.log('\n  FRAME STILL CANNOT SEE THE KNOWN FLIP — results below are not evidence.');
}
const probes = JSON.parse(fs.readFileSync('/tmp/probes.json', 'utf8'));
const narrow = [], flips = [];
for (const { probe, range } of probes) {
  const full = probe.match(/,/) ? probe : null; if (!full) continue;
  const r = await assess(full, range); if (!r || !r.blueExactFirst) continue;
  if (r.margin > 25) continue;
  narrow.push(+r.margin.toFixed(1));
  if (r.greenRangeFirst) flips.push({ q: r.q, margin: +r.margin.toFixed(1) });
}
console.log(JSON.stringify({ narrow_margin_pairs: narrow.length, margins: narrow.sort((a,b)=>a-b), green_flips: flips.length, flips }, null, 1));
