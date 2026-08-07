// ADR-033 item 5 / ADR-031 primary-path invariant: measure the p95 latency the
// read-shadow adds to /addresses. Controlled A/B — identical request stream
// against the same local server, shadow off vs shadow on with SigV4 signing.
// Production ALB p95 swings 50-200 ms and cannot resolve a 1 ms signal.
const BASE = process.env.TARGET || 'http://localhost:8081';
const N = Number(process.env.N || 3000);
const WARM = Number(process.env.WARM || 400);

// Fixed query set, generated once and reused across BOTH legs, so the two legs
// see byte-identical work. Randomising per-leg would confound the delta.
const QUERIES = [];
for (let i = 0; i < 200; i += 1) {
  QUERIES.push(`unit ${i % 40} christmas`);
  QUERIES.push(`${i % 90} lam lam`);
  QUERIES.push(`norfolk isl`);
  QUERIES.push(`${i % 30} taylors rd`);
}

async function once(q) {
  const t = process.hrtime.bigint();
  const r = await fetch(`${BASE}/addresses?q=${encodeURIComponent(q)}`);
  await r.text();
  return { ns: Number(process.hrtime.bigint() - t), ok: r.ok };
}

function pct(sorted, p) {
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
}

for (let i = 0; i < WARM; i += 1) await once(QUERIES[i % QUERIES.length]);

const samples = [];
let bad = 0;
for (let i = 0; i < N; i += 1) {
  const { ns, ok } = await once(QUERIES[i % QUERIES.length]);
  if (!ok) bad += 1;
  samples.push(ns / 1e6);
}
samples.sort((a, b) => a - b);
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
console.log(
  JSON.stringify({
    n: samples.length,
    bad,
    mean: +mean.toFixed(4),
    p50: +pct(samples, 50).toFixed(4),
    p95: +pct(samples, 95).toFixed(4),
    p99: +pct(samples, 99).toFixed(4),
  }),
);
