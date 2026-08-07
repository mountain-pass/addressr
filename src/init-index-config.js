// @jtbd JTBD-201
// P037: pure helpers for client/elasticsearch.js initIndex.
//
// 1. indexConfigMatches — lets initIndex skip the close → putSettings →
//    putMapping → open dance when the stored index config already matches
//    the desired config. Settings and mappings don't change between state
//    loads, so every load after the first fast-paths past the close that
//    races AWS's hourly automated snapshots (I001).
// 2. isSnapshotInProgress / retryOnSnapshotInProgress — when a close IS
//    needed, retry on snapshot_in_progress_exception instead of failing the
//    whole populate leg. Snapshots last ~30-60s and run hourly.
//
// Clean ESM, DI for timing, unit-tested per P033.

import debug from 'debug';

const logError = debug('error');

// ---------------------------------------------------------------------------
// ADR-041 / P069: index analysis config + synonym building.
//
// This lives here, in clean ESM, so a behavioural test can build the EXACT
// settings production uses instead of duplicating them. client/elasticsearch.js
// and service/address-service.js are both babel-only (they mix require() with
// import) and cannot be loaded by a raw Node ESM test — the same P033
// constraint that forced the service/gnaf-package-fetch.js and
// utils/stream-down.js extractions.
//
// The emitted JSON is OpenSearch-shaped on purpose. It is NOT a backend-neutral
// analyzer DSL: ADR-021 records that no backend abstraction layer exists yet,
// and inventing one here would be its first brick.
// ---------------------------------------------------------------------------

/**
 * Build synonym rules from a G-NAF authority-code table.
 *
 * ADR-041: EQUIVALENT (comma) form, not the directional `CODE => NAME` form.
 * The directional form REPLACED one side with the other, and the four G-NAF
 * tables disagree about which column holds the abbreviation — `STREET_TYPE` is
 * `BRIDGE|BDGE` (full => abbrev) while `STREET_SUFFIX`, `FLAT_TYPE` and
 * `LEVEL_TYPE` are `S|SOUTH`, `APT|APARTMENT`, `LG|LOWER GROUND FLOOR`
 * (abbrev => full). Whichever side got replaced went missing from the index, so
 * a partial token from match_bool_prefix could never reach it.
 *
 * Equivalents are direction-agnostic: both tokens are indexed regardless of
 * which column holds which, so the decision does not depend on getting the
 * direction right.
 *
 * Multi-word members (`RIGHT OF WAY, ROFW`) are emitted the same way — no
 * special case. They stack the multi-token side at one position, but the
 * directional form does this too, so the hazard is pre-existing rather than
 * introduced. See ADR-041 § Multi-Word Members.
 *
 * @param {Array<{CODE: string, NAME: string}>} table authority-code rows
 * @returns {string[]} entries shaped `CODE, NAME`
 */
export function mapAuthCodeTableToSynonymList(table) {
  return (table || [])
    .filter((type) => type.CODE !== type.NAME)
    .map((type) => `${type.CODE}, ${type.NAME}`);
}

const SYNONYM_TABLES = [
  'Authority_Code_STREET_TYPE_AUT_psv',
  'Authority_Code_FLAT_TYPE_AUT_psv',
  'Authority_Code_LEVEL_TYPE_AUT_psv',
  'Authority_Code_STREET_SUFFIX_AUT_psv',
];

/**
 * Build the full synonym list from a loaded G-NAF authority-code context.
 *
 * @param {Record<string, Array<{CODE: string, NAME: string}>>} context
 * @returns {string[]}
 */
export function buildSynonyms(context) {
  return SYNONYM_TABLES.flatMap((table) =>
    mapAuthCodeTableToSynonymList(context?.[table]),
  );
}

export const INDEX_ANALYZER = 'my_analyzer';
export const SEARCH_ANALYZER = 'my_search_analyzer';

// Names the synonym rule form so a directional-era index is distinguishable
// from a current one. Part of the structure stamp; see analysisStructureStamp.
const SYNONYM_FORM = 'equivalent';

const BASE_FILTERS = ['uppercase', 'asciifolding'];

/**
 * Build the `settings.index.analysis` block shared by the address and locality
 * indexes.
 *
 * The search analyzer is the index analyzer MINUS the synonym filter. A partial
 * query token is not a complete synonym code, so rewriting the query can only
 * move it away from what is stored.
 *
 * @param {string[]} synonyms equivalent-form rules from buildSynonyms
 */
export function buildAnalysis(synonyms) {
  return {
    filter: {
      my_synonym_filter: {
        type: 'synonym',
        lenient: true,
        synonyms: synonyms || [],
      },
      comma_stripper: {
        type: 'pattern_replace',
        pattern: ',',
        replacement: '',
      },
    },
    analyzer: {
      [INDEX_ANALYZER]: {
        tokenizer: 'whitecomma',
        filter: [
          ...BASE_FILTERS,
          'my_synonym_filter',
          'comma_stripper',
          'trim',
        ],
      },
      [SEARCH_ANALYZER]: {
        tokenizer: 'whitecomma',
        filter: [...BASE_FILTERS, 'comma_stripper', 'trim'],
      },
    },
    tokenizer: {
      whitecomma: {
        type: 'pattern',
        pattern: String.raw`[\W,]+`,
        lowercase: false,
      },
    },
  };
}

/**
 * Stable fingerprint of the analysis STRUCTURE — filter types, both analyzer
 * filter chains, and the synonym form.
 *
 * **Excludes synonym entries themselves, and this is not the implementer's to
 * reinterpret.** `buildSynonyms` rebuilds that list from the G-NAF authority
 * tables on every load, so a contents-based hash would change whenever G-NAF
 * adds a street type and would hard-abort the ADR-034 quarterly job. It is
 * equally not a hand-incremented literal: deriving it from the shape means a
 * future analysis change cannot forget to bump it.
 *
 * Stamped into the mapping `_meta` so initIndex can tell a pre-ADR-041 index
 * from a current one. An index whose stamp differs needs a reindex; it cannot
 * be repaired by putSettings/putMapping, which succeed while leaving every
 * existing document analysed the old way (measured — see ADR-041).
 */
export function analysisStructureStamp(analysis) {
  const a = analysis || buildAnalysis([]);
  return JSON.stringify({
    synonymForm: SYNONYM_FORM,
    filters: Object.fromEntries(
      Object.entries(a.filter).map(([name, f]) => [name, f.type]),
    ),
    analyzers: Object.fromEntries(
      Object.entries(a.analyzer).map(([name, an]) => [
        name,
        `${an.tokenizer}:${an.filter.join('+')}`,
      ]),
    ),
  });
}

/**
 * A searchable text field carrying BOTH analyzers.
 *
 * `search_analyzer` is per-field, so every field a query clause targets needs
 * it, or that field keeps synonym-rewriting the query at search time and fails
 * asymmetrically against the fields that do not.
 *
 * ADR-043: `sla_range_expanded` is no longer one of those fields — the
 * phrase_prefix clause that carried it is gone and no clause targets it now.
 * Both analyzers are retained on it deliberately, so ADR-043 Reassessment
 * Criterion 4 can re-open the field's query-side value against a symmetric
 * analysis chain rather than a half-migrated one.
 *
 * The `raw` keyword subfield carries NO `ignore_above`, and since ADR-043 that
 * absence is load-bearing: `sla.raw` / `ssla.raw` are what the keyword-prefix
 * anchor matches on, so a length limit would silently strand long SLAs from it
 * while every other test stayed green. Pinned in elasticsearch.test.mjs.
 */
export function analyzedTextField({ raw = false } = {}) {
  return {
    type: 'text',
    analyzer: INDEX_ANALYZER,
    search_analyzer: SEARCH_ANALYZER,
    ...(raw && { fields: { raw: { type: 'keyword' } } }),
  };
}

/** Address index body (settings + mappings). */
export function buildAddressIndexBody(synonyms) {
  const analysis = buildAnalysis(synonyms);
  return {
    settings: { index: { analysis } },
    aliases: {},
    mappings: {
      _meta: { analysisStamp: analysisStructureStamp(analysis) },
      properties: {
        structured: { type: 'object', enabled: false },
        sla: analyzedTextField({ raw: true }),
        ssla: analyzedTextField({ raw: true }),
        // ADR-028 (inherited from superseded ADR-026): range-number expansion.
        // Multi-valued, absent on non-range docs, no .raw — never sorted on.
        sla_range_expanded: analyzedTextField(),
        confidence: { type: 'integer' },
        locality_pid: { type: 'keyword' },
      },
    },
  };
}

/** Locality index body. Same analysis chain per ADR-021. */
export function buildLocalityIndexBody(synonyms) {
  const analysis = buildAnalysis(synonyms);
  return {
    settings: { index: { analysis } },
    aliases: {},
    mappings: {
      _meta: { analysisStamp: analysisStructureStamp(analysis) },
      properties: {
        locality_name: analyzedTextField({ raw: true }),
        // Keyword fields — exact-match lookups, never analysed. The postcode
        // and state endpoints filter and aggregate on these, so dropping any
        // of them silently breaks /postcodes and /states while address search
        // keeps working.
        locality_class_code: { type: 'keyword' },
        locality_class_name: { type: 'keyword' },
        primary_postcode: { type: 'keyword' },
        state_abbreviation: { type: 'keyword' },
        state_name: { type: 'keyword' },
        postcodes: { type: 'keyword' },
        locality_pid: { type: 'keyword' },
      },
    },
  };
}

/**
 * True when a stored index predates the current analysis structure.
 *
 * Compares the `_meta.analysisStamp` ONLY — not `indexConfigMatches`, which is
 * deliberately conservative and returns false for benign drift. Conflating
 * "differs" with "requires reindex" would turn every innocuous diff into a hard
 * abort, so the two predicates stay separate: this one gates the fail-loud, and
 * `indexConfigMatches` keeps gating the P037 fast-path.
 */
export function isStaleAnalysisConfig(storedMappingBody, indexName, desired) {
  const stored =
    storedMappingBody?.[indexName]?.mappings?._meta?.analysisStamp ??
    storedMappingBody?.mappings?._meta?.analysisStamp;
  if (stored === undefined) return true;
  return stored !== desired;
}

/** Remediation message naming both supported migration routes. */
export function staleIndexMessage(indexName) {
  return [
    `Index "${indexName}" was built with an analysis config predating ADR-041 (P069).`,
    '',
    'Its documents carry postings from the old analyzer, so partial-prefix search is',
    'broken on street types and suffixes. This CANNOT be repaired by updating settings',
    'or mappings: those calls succeed while leaving every existing document analysed',
    'the old way, which looks fixed and is not. The documents must be re-analysed.',
    '',
    'Two supported migrations:',
    '  1. Blue/green — build a second index or domain, verify, then cut over.',
    '                  See docs/OPENSEARCH-MIGRATION-PLAYBOOK.md. Production path.',
    `  2. In-place   — POST _reindex from "${indexName}" into a new index created by`,
    '                  this loader, then point ES_INDEX_NAME at it. _source is stored,',
    '                  so re-analysis is server-side: no G-NAF download, no re-parse.',
    '',
    'Set ES_INDEX_NAME to a new index name to build alongside the existing one.',
  ].join('\n');
}

// OpenSearch getSettings returns scalars as strings ("true", "1"); the
// desired body uses native JSON types. Normalise every scalar to a string
// before comparing so `lenient: true` matches `lenient: "true"`.
function normalise(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalise(entry));
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    // Ordering here only has to be CONSISTENT, not any particular order:
    // `isNormalisedEqual` normalises both sides before comparing, so the sort
    // decides nothing about the verdict. It is safe to state a comparator that
    // is not the historical default. What matters is that `normalise` feeds
    // ONLY `isNormalisedEqual` -> `indexConfigMatches`; the `_meta.analysisStamp`
    // is built separately by `analysisStructureStamp` and never routes through
    // here, so no sort choice can trigger a false stale-index abort (ADR-041).
    const sortedKeys = Object.keys(value).toSorted((a, b) =>
      a.localeCompare(b),
    );
    for (const key of sortedKeys) {
      out[key] = normalise(value[key]);
    }
    return out;
  }
  return String(value);
}

function isNormalisedEqual(a, b) {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

/**
 * True when the stored index analysis settings AND mappings already match
 * the desired index body, so initIndex can skip the close-update-open dance.
 *
 * Conservative by design: any missing/malformed piece of the stored
 * responses returns false, falling back to the existing update path.
 *
 * @param {object} desiredBody the `indexBody` initIndex builds
 *   (`{ settings: { index: { analysis } }, mappings }`)
 * @param {object} settingsResponseBody `indices.getSettings(...).body`
 * @param {object} mappingResponseBody `indices.getMapping(...).body`
 * @param {string} indexName
 * @returns {boolean}
 */
export function indexConfigMatches(
  desiredBody,
  settingsResponseBody,
  mappingResponseBody,
  indexName,
) {
  try {
    const desiredAnalysis = desiredBody?.settings?.index?.analysis;
    const storedAnalysis =
      settingsResponseBody?.[indexName]?.settings?.index?.analysis;
    const desiredMappings = desiredBody?.mappings;
    const storedMappings = mappingResponseBody?.[indexName]?.mappings;
    if (
      desiredAnalysis === undefined ||
      storedAnalysis === undefined ||
      desiredMappings === undefined ||
      storedMappings === undefined
    ) {
      return false;
    }
    return (
      isNormalisedEqual(desiredAnalysis, storedAnalysis) &&
      isNormalisedEqual(desiredMappings, storedMappings)
    );
  } catch (error_) {
    // never let a comparison bug break the loader — fall back to update path
    logError('indexConfigMatches comparison failed', error_);
    return false;
  }
}

/**
 * True when an OpenSearch client error is the HTTP 400
 * `snapshot_in_progress_exception` AWS-managed domains raise when an index
 * close collides with an automated snapshot.
 */
export function isSnapshotInProgress(error_) {
  const body = error_?.body?.error;
  if (body === undefined || body === null) {
    return false;
  }
  return (
    body.type === 'snapshot_in_progress_exception' ||
    (Array.isArray(body.root_cause) &&
      body.root_cause.some(
        (cause) => cause?.type === 'snapshot_in_progress_exception',
      ))
  );
}

/**
 * Run `fn`, retrying on snapshot_in_progress_exception.
 *
 * Defaults: 6 attempts, 30s apart — covers ~2.5 minutes, comfortably past a
 * single 30-60s automated snapshot. Any other error rethrows immediately.
 *
 * @param {() => Promise<any>} fn
 * @param {{attempts?: number, delayMs?: number,
 *   sleep?: (ms: number) => Promise<void>}} [options] DI for tests
 */
export async function retryOnSnapshotInProgress(
  function_,
  {
    attempts = 6,
    delayMs = 30_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await function_();
    } catch (error_) {
      if (!isSnapshotInProgress(error_) || attempt >= attempts) {
        throw error_;
      }
      logError(
        `index close blocked by in-progress snapshot; retry ${attempt}/${
          attempts - 1
        } in ${delayMs}ms (P037)`,
      );
      await sleep(delayMs);
    }
  }
}
