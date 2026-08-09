// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// Shared apparatus for the two corpus-scale relevance gates ADR-043 pins:
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
import { buildEsClientOptions } from '../../packages/addressr/src/es-auth.js';
import { buildAddressSearchBody } from '../../packages/addressr/src/build-search-body.js';

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
 * `baseline` is the shipped body verbatim — which, since ADR-043 shipped on
 * 2026-08-08, IS the keyword-prefix anchor. `legacy` is the body as it stood
 * before that, and is what the gates measure against.
 *
 * ADR-042's `anchored` span variant was deleted when ADR-043 superseded it; its
 * own docblock pre-committed to exactly that ("disposable if that ADR is
 * superseded"). The measured comparison it produced is recorded in ADR-043's
 * Decision Outcome table, which is where a result belongs once the option that
 * produced it is withdrawn.
 */
export function bodyFor({
  query,
  variant = 'baseline',
  page = 1,
  size = PAGE_SIZE,
}) {
  const body = buildAddressSearchBody({
    searchString: query,
    page,
    pageSize: size,
  });
  if (!body.query?.bool?.should) return body; // empty query: nothing to transform
  if (variant === 'baseline') return body;

  // `keyword-prefix` was the ADR-043 candidate and SHIPPED on 2026-08-08, so it
  // is now identical to baseline. Kept as an explicit alias rather than deleted
  // so an older invocation measures what its name says instead of silently
  // becoming a duplicate baseline arm by accident.
  if (variant === 'keyword-prefix') return body;

  // `legacy` is the PRE-ADR-043 production body, and it is a load-bearing
  // fixture: it is the arm recall must not regress FROM, and it is the
  // configuration in which P078 recorded its four losses. Do not delete it.
  //
  // It must STRIP the anchor as well as restore the phrase clause. Rebuilding
  // only the second half would leave a body carrying both, which is neither arm
  // — and since every ladder probe is gated on, the anchor would rescue
  // literal-prefix targets and P078's losses might not reproduce at all.
  //
  // Assign back to `body.query.bool.should`, and re-read it below. A rebound
  // local would leave the body at the shipped shape while the guard still found
  // the clause — a silent false measurement, the same P033 class this exists to
  // close.
  if (variant === 'legacy' || variant.startsWith('max_expansions:')) {
    body.query.bool.should = body.query.bool.should.filter(
      (c) => c.multi_match?.type === 'bool_prefix',
    );
    body.query.bool.should.push({
      multi_match: {
        fields: ['sla', 'ssla', 'sla_range_expanded'],
        query,
        type: 'phrase_prefix',
        lenient: true,
        auto_generate_synonyms_phrase_query: false,
        operator: 'AND',
      },
    });
    if (variant === 'legacy') return body;
  }

  const should = body.query.bool.should;
  const phraseIndex = should.findIndex(
    (c) => c.multi_match?.type === 'phrase_prefix',
  );
  if (phraseIndex === -1) {
    throw new Error(
      `variant "${variant}" rewrites the phrase_prefix clause, which ADR-043 removed ` +
        'from src/build-search-body.js. Delete the variant or re-point it onto `legacy`: ' +
        'a -1 index silently rewrites the LAST clause, so the run would measure something ' +
        'other than what the flag names.',
    );
  }

  if (variant.startsWith('max_expansions:')) {
    should[phraseIndex].multi_match.max_expansions = Number(
      variant.split(':', 2)[1],
    );
    return body;
  }

  throw new Error(`unknown variant: ${variant}`);
}

/** Run one query and return the returned `sla` values in rank order. */
export async function search(client, { query, variant, size = PAGE_SIZE }) {
  const { body } = await client.search({
    index: INDEX,
    body: bodyFor({ query, variant, size }),
  });
  return (body.hits?.hits ?? []).map((h) => ({
    id: h._id,
    sla: h._source.sla,
  }));
}

/**
 * Draw a fresh random sample of street-level addresses that also have sub-units.
 *
 * REDRAWN PER RUN by design. ADR-043 Confirmation 1: "a frozen sample
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
