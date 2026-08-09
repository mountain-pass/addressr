// @jtbd JTBD-001 (Search autocomplete addresses)
//
// Does `sla_range_expanded` earn its place? P091's second investigation task.
//
// P091 established that the field has never been searchable — generated onto
// `structured.sla_range_expanded` while the mapping and every query targeted the
// top level — and then measured whether it is worth repairing. On 150 range
// addresses, one seed, it found the alias contributes nothing to recall where it
// is the only candidate, and boosts a range document against the real address at
// that number in two-thirds of cases. That made removal (ADR-028 Option D) the
// leading option and the ticket says so in as many words:
//
//   "150 range addresses with one fixed seed is enough to make removal the
//    leading option, not enough to close it. Re-draw and confirm the
//    0-not-in-page result holds."
//
// This is that re-draw, at a caller-chosen N.
//
// WHY A NEW PROBE RATHER THAN `--frame` ON AN EXISTING ONE. `drawSample` in
// relevance-lib draws street-level addresses that also have sub-units, which is
// the ADR-043 frame. The population here is disjoint: range-form `sla` values.
// Everything else — client construction, the credential guard, the imported
// search body, bounded concurrency — is reused rather than restated, for the
// reason the README gives: a hand-copied body is what let the ADR-041 gate stay
// green while production diverged.
//
// REDRAWN PER RUN, per ADR-043 Confirmation 1 — a frozen sample degenerates into
// the instance-pinning that hid P091 for four months. `--seed` exists to
// reproduce a specific past run and labels its own output non-discharging.
//
// READ-ONLY. `_search` only. No writes, no mapping changes, no `_update_by_query`.
//
// Usage:
//   ADDRESSR_PROBE_HOST=search-….es.amazonaws.com node test/perf/range-alias-value-probe.mjs --n 400

import { probeClient, INDEX, search, mapLimit, PAGE_SIZE } from './relevance-lib.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const TARGET = Number(arg('n', 400));
const SEED_BASE = arg('seed') ? Number(arg('seed')) : Date.now();
const FROZEN = Boolean(arg('seed'));

// `103-107 GAZE RD, CHRISTMAS ISLAND OT 6798` -> the two endpoint forms.
// ADR-028 is endpoint-only: the aliases are the first and last numbers, never
// the interior. Matching that exactly matters — an interior-expanding regex
// would measure a mechanism the decision does not describe.
const RANGE = /^(\d+)-(\d+)(\s+.*)$/;
const endpoints = (sla) => {
  const m = RANGE.exec(sla);
  return m ? [`${m[1]}${m[3]}`, `${m[2]}${m[3]}`] : null;
};

/**
 * Draw range-form addresses at random.
 *
 * `prefix` on `sla.raw` cannot express "digits then hyphen", and `structured` is
 * `{ type: 'object', enabled: false }` so nothing under it is queryable — there
 * is no indexed marker for a range document. The draw is therefore a random walk
 * over the whole index, filtered client-side by the same regex the alias
 * generator uses.
 *
 * LOAD, stated precisely because the first draft of this comment understated it.
 * Each iteration is an unfiltered `match_all` inside `function_score`, so it is a
 * FULL SCORING PASS over all ~16.9M documents — there is no early termination.
 * Range forms are ~2% of the index, so 500 hits yields ~10 usable rows and
 * `--n 500` needs roughly 49 such passes. That is heavier than the sibling
 * probes, every one of which filters before scoring (`drawSample` uses
 * `prefix: { 'sla.raw': 'UNIT ' }`). It is still the least-bad instrument: a
 * `regexp` query over 16.9M documents is worse, and there is nothing to filter
 * on. The passes are sequentially awaited, so at most one is ever in flight, and
 * `seed < seedBase + 200` caps the count regardless of `--n`.
 */
async function drawRanges(client, target, seedBase) {
  const seen = new Set();
  const out = [];
  for (let seed = seedBase; out.length < target && seed < seedBase + 200; seed += 1) {
    const { body } = await client.search({
      index: INDEX,
      body: {
        size: 500,
        _source: ['sla'],
        query: {
          function_score: {
            query: { match_all: {} },
            random_score: { seed, field: '_seq_no' },
          },
        },
      },
    });
    for (const h of body.hits?.hits ?? []) {
      const sla = h._source?.sla;
      if (!sla || seen.has(sla)) continue;
      const m = RANGE.exec(sla);
      // `expandRangeAliases` returns [] when first >= last, so those documents
      // never carry an alias and would dilute the denominator.
      if (!m || Number(m[1]) >= Number(m[2])) continue;
      seen.add(sla);
      out.push({ sla, id: h._id });
      if (out.length >= target) break;
    }
  }
  return out;
}

/** Which of a range's endpoints exist as their own documents. */
async function endpointsPresent(client, pairs) {
  const all = pairs.flatMap((p) => p.aliases);
  const present = new Set();
  // Chunked: a terms query with thousands of values is a different kind of load.
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const { body } = await client.search({
      index: INDEX,
      // size is 4x the chunk, NOT chunk.length. G-NAF carries primary/secondary
      // precedence pairs that can share an `sla`, so matching documents can
      // exceed the number of distinct values asked for. A truncated result
      // silently misclassifies a COMPETING case as a GAP case, which inflates
      // exactly the number this probe exists to report.
      body: { size: chunk.length * 4, _source: ['sla'], query: { terms: { 'sla.raw': chunk } } },
    });
    // ASSERT the bound rather than assume it. A `terms` query returns the top N
    // BY SCORE, and under `terms` every score is constant — so any truncation
    // drops arbitrary aliases, and each dropped alias misclassifies a COMPETING
    // case as a GAP case, in the direction of the conclusion. The 4x headroom
    // above is a guess; this makes a wrong guess loud instead of silent.
    const total = body.hits?.total?.value ?? 0;
    if (total > chunk.length * 4) {
      throw new Error(
        `endpointsPresent truncated: ${total} matches for ${chunk.length} aliases ` +
          `exceeds the ${chunk.length * 4} requested. Raise the multiplier or switch to a ` +
          `terms aggregation — the gap/competing split is wrong until this passes.`,
      );
    }
    for (const h of body.hits?.hits ?? []) present.add(h._source.sla);
  }
  return present;
}

const main = async () => {
  const client = probeClient();
  console.log(
    `# range-alias value probe — index=${INDEX} target=${TARGET} seed=${SEED_BASE}${
      FROZEN ? ' (FROZEN SEED — reproduction only, NON-DISCHARGING)' : ' (fresh draw)'
    }`,
  );

  const sample = await drawRanges(client, TARGET, SEED_BASE);
  const pairs = sample
    .map((s) => ({ ...s, aliases: endpoints(s.sla) }))
    .filter((s) => s.aliases);
  console.log(`# drew ${pairs.length} range-form addresses`);
  if (pairs.length === 0) return;

  const present = await endpointsPresent(client, pairs);
  const gap = pairs.filter((p) => !p.aliases.some((a) => present.has(a)));
  const competing = pairs.length - gap.length;

  console.log('');
  console.log('| population                                                          | count | share |');
  console.log('| ------------------------------------------------------------------- | ----- | ----- |');
  const pct = (n) => `${((n / pairs.length) * 100).toFixed(1)}%`;
  console.log(`| neither endpoint exists — the only case the alias could help         | ${gap.length} | ${pct(gap.length)} |`);
  console.log(`| at least one endpoint exists — alias would compete with the real doc | ${competing} | ${pct(competing)} |`);

  // For the gap cases only: can the range doc be found by an endpoint query
  // WITHOUT the alias? That is the recall question the removal decision turns on.
  const probes = gap.flatMap((g) => g.aliases.map((q) => ({ q, id: g.id, sla: g.sla })));
  const results = await mapLimit(probes, 4, async ({ q, id }) => {
    const hits = await search(client, { query: q, variant: 'baseline' });
    const rank = hits.findIndex((h) => h.id === id);
    return { rank, found: rank !== -1 };
  });

  const first = results.filter((r) => r.rank === 0).length;
  const inPage = results.filter((r) => r.found).length;
  const missing = results.length - inPage;

  console.log('');
  console.log(`# gap cases only, endpoint query WITHOUT the alias (page size ${PAGE_SIZE})`);
  console.log('|                                 |     |');
  console.log('| ------------------------------- | --- |');
  console.log(`| probes run                      | ${results.length} |`);
  console.log(`| range doc found at rank #1      | ${first} |`);
  console.log(`| range doc found in page         | ${inPage} |`);
  console.log(`| NOT in page                     | ${missing} |`);

  if (missing > 0) {
    console.log('');
    console.log('# not-in-page cases — these are what the alias would have to justify:');
    for (const [i, r] of results.entries()) {
      if (!r.found) console.log(`#   ${probes[i].q}  ->  ${probes[i].sla}`);
    }
  }
  console.log('');
  console.log(
    missing === 0
      ? '# RESULT: 0 not-in-page WITHIN THIS FRAME (bare-numeric-leading ranges only;\n' +
        '#   alpha-affixed and unit/level-prefixed ranges also generate aliases and are NOT sampled).\n' +
        '#   The alias adds no recall in the population measured. See test/perf/README.md before quoting.'
      : `# RESULT: ${missing} not-in-page. Does NOT reproduce the 2026-08-08 finding — the alias has a recall case.`,
  );
};

await main();
