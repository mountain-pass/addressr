// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// Shared apparatus for the two corpus-scale relevance gates ADR-042 pins:
// street-level-first (ADR-025 Decision Driver 1) and partial-prefix recall
// (ADR-041's superset property).
//
// THE BASELINE BODY IS IMPORTED, NEVER RESTATED. Every candidate is expressed
// as a delta applied to `buildAddressSearchBody`'s output, so a query-shape
// change in production cannot silently leave this instrument measuring a body
// nobody ships. That is not a style preference: a hand-copied body in
// test/integration/search-analysis.test.mjs is precisely what let the ADR-041
// gate stay green while production diverged (P074 Fix Strategy prerequisite 3,
// fixed 2026-08-07 in 3.0.7). An earlier draft of this harness was Python and
// would have been the third copy.
//
// NO PRODUCTION DEFAULT. `ADDRESSR_PROBE_HOST` is required and has no
// fallback. A run that silently hits prod is the same class of defect as the
// green-only arm this directory's README warns about.
//
// CREDENTIALS NEVER ON ARGV. Resolved through `defaultProvider()`, the same
// chain production uses (ADR-033). On 2026-08-07 a curl-based draft passed the
// secret key as an argument and a transport failure stringified the whole
// command into a session transcript, exposing a live key. `assertNoCredsInArgv`
// below refuses to run if that shape ever returns.

import { Client } from '@opensearch-project/opensearch';
import { buildEsClientOptions } from '../../src/es-auth.js';
import { buildAddressSearchBody } from '../../src/build-search-body.js';

export const PAGE_SIZE = 8;

/** Refuse to run if a credential was passed as a command-line argument. */
export function assertNoCredsInArgv(argv = process.argv) {
  const leaky = argv.filter((a) =>
    // AKIA = long-term key, ASIA = STS session key. Both are credentials.
    /A[KS]IA[0-9A-Z]{12,}|aws_secret|aws_session_token|secretAccessKey|sessionToken/i.test(
      a,
    ),
  );
  if (leaky.length > 0) {
    throw new Error(
      'refusing to run: a credential appears in argv. Credentials must come from ' +
        'the default AWS provider chain (env, profile, SSO, instance role), never ' +
        'an argument — a failed subprocess stringifies argv into logs and transcripts.',
    );
  }
}

/**
 * OpenSearch client for the probe target.
 *
 * @param {Record<string,string|undefined>} [env]
 */
export function probeClient(environment = process.env) {
  assertNoCredsInArgv();
  const host = environment.ADDRESSR_PROBE_HOST;
  if (!host) {
    throw new Error(
      'ADDRESSR_PROBE_HOST is required and has no default. Set it to the domain ' +
        'endpoint to measure, e.g. ADDRESSR_PROBE_HOST=search-xxxx.ap-southeast-2.es.amazonaws.com. ' +
        'There is deliberately no production fallback.',
    );
  }
  const region = environment.ELASTIC_REGION || 'ap-southeast-2';
  return new Client(
    buildEsClientOptions({
      authMode: 'sigv4',
      node: `https://${host}`,
      region,
    }),
  );
}

export const INDEX = process.env.ADDRESSR_PROBE_INDEX || 'addressr';

/**
 * Candidate query shapes, each a delta on the imported production body.
 *
 * `baseline` is the shipped body verbatim. The others are the candidates
 * ADR-042 compares. `anchored` is CANDIDATE-SPECIFIC to ADR-042's chosen
 * option and is disposable if the ratification drain lands a different one;
 * `baseline` and the rest are candidate-agnostic and are what a reviewer needs
 * in order to ratify at all.
 */
export function bodyFor({
  query,
  variant = 'baseline',
  page = 1,
  size = PAGE_SIZE,
  analyzed,
}) {
  const body = buildAddressSearchBody({
    searchString: query,
    page,
    pageSize: size,
  });
  const should = body.query?.bool?.should;
  if (!should) return body; // empty query: no clauses to transform
  if (variant === 'baseline') return body;

  const phraseIndex = should.findIndex(
    (c) => c.multi_match?.type === 'phrase_prefix',
  );

  if (variant.startsWith('max_expansions:')) {
    should[phraseIndex].multi_match.max_expansions = Number(
      variant.split(':', 2)[1],
    );
    return body;
  }

  if (variant.startsWith('constant_score:')) {
    should[phraseIndex] = {
      constant_score: {
        filter: should[phraseIndex],
        boost: Number(variant.split(':', 2)[1]),
      },
    };
    return body;
  }

  if (variant === 'anchored') {
    if (!analyzed) {
      throw new Error(
        'the anchored variant needs analyzed positions; call analyzePositions first',
      );
    }
    should.splice(phraseIndex, 1, ...anchoredClauses(analyzed));
    return body;
  }

  throw new Error(`unknown variant: ${variant}`);
}

/**
 * span_first(span_near(...)) per field: "this field STARTS WITH what was typed".
 *
 * The final position stays a prefix, or `14 FALK` stops reaching `FALKLAND` and
 * the anchor drops recall probes. `span_multi` enumerates matching terms and
 * dies on the 1024-clause cap for short or synonym-expanded finals (`86 NORTH`
 * expands the synonym `N`, and `N*` fails ALL shards), so the rewrite is
 * bounded. Unlike `max_expansions` that bound cannot decide parent-vs-child —
 * anchoring does that structurally — but ADR-042 Confirmation 4 still requires
 * the invariance sweep before 128 counts as headroom rather than a magic number.
 */
export function anchoredClauses(analyzedByField, rewrite = 'top_terms_128') {
  return Object.entries(analyzedByField).map(([field, positions]) => {
    const last = positions.length - 1;
    const clauses = positions.map((tokens, index) => {
      const spans = tokens.map((t) =>
        index === last
          ? {
              span_multi: {
                match: { prefix: { [field]: { value: t, rewrite } } },
              },
            }
          : { span_term: { [field]: t } },
      );
      return spans.length === 1 ? spans[0] : { span_or: { clauses: spans } };
    });
    const inner =
      clauses.length === 1
        ? clauses[0]
        : { span_near: { clauses, slop: 0, in_order: true } };
    return { span_first: { match: inner, end: clauses.length } };
  });
}

/** Analyzed token positions per field, for the anchored variant. */
export async function analyzePositions(
  client,
  query,
  fields = ['sla', 'ssla'],
) {
  const out = {};
  for (const field of fields) {
    const { body } = await client.indices.analyze({
      index: INDEX,
      body: { field, text: query },
    });
    // positions are contiguous from 0, so index directly rather than
    // building a Map and sorting its keys
    const positions = [];
    for (const t of body.tokens) {
      positions[t.position] ??= [];
      positions[t.position].push(t.token);
    }
    out[field] = positions;
  }
  return out;
}

/** Run one query and return the returned `sla` values in rank order. */
export async function search(client, { query, variant, size = PAGE_SIZE }) {
  const analyzed =
    variant === 'anchored' ? await analyzePositions(client, query) : undefined;
  const { body } = await client.search({
    index: INDEX,
    body: bodyFor({ query, variant, size, analyzed }),
  });
  return (body.hits?.hits ?? []).map((h) => ({
    id: h._id,
    sla: h._source.sla,
  }));
}

/**
 * Draw a fresh random sample of street-level addresses that also have sub-units.
 *
 * REDRAWN PER RUN by design. ADR-042 Confirmation 1: "a frozen sample
 * degenerates into the instance-pinning that hid this defect for months." The
 * committed sample.json is the terminal record of the 2026-08-06 run, not the
 * frame — pass it via --frame only to reproduce that specific measurement, and
 * label any such result as non-discharging.
 */
export async function drawSample(client, target = 150, seedBase = Date.now()) {
  const seen = new Set();
  const out = [];
  const subUnit =
    /^(UNIT|FLAT|SHOP|LEVEL|SUITE|APARTMENT|OFFICE|ROOM)\s+\S+,\s+(.*)$/;
  for (
    let seed = seedBase;
    out.length < target && seed < seedBase + 40;
    seed += 1
  ) {
    const { body } = await client.search({
      index: INDEX,
      body: {
        size: 200,
        query: {
          function_score: {
            query: { prefix: { 'sla.raw': 'UNIT ' } },
            random_score: { seed, field: '_seq_no' },
          },
        },
      },
    });
    const parents = [];
    const drawn = body.hits?.hits ?? [];
    for (const h of drawn) {
      const m = subUnit.exec(h._source.sla ?? '');
      if (m && !seen.has(m[2])) {
        seen.add(m[2]);
        parents.push(m[2]);
      }
    }
    if (parents.length === 0) continue;
    // keep only those whose street-level parent exists as its own document
    const { body: found } = await client.search({
      index: INDEX,
      body: { size: parents.length, query: { terms: { 'sla.raw': parents } } },
    });
    const parentDocs = found.hits?.hits ?? [];
    for (const h of parentDocs) {
      if (out.length < target) out.push({ sla: h._source.sla, id: h._id });
    }
  }
  return out;
}

/** Bounded-concurrency map, so a probe run adds ~1 query to the domain. */
export async function mapLimit(items, limit, function_) {
  const results = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await function_(items[index], index);
      }
    }),
  );
  return results;
}
