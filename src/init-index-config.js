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

// OpenSearch getSettings returns scalars as strings ("true", "1"); the
// desired body uses native JSON types. Normalise every scalar to a string
// before comparing so `lenient: true` matches `lenient: "true"`.
function normalise(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalise(entry));
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).toSorted()) {
      out[key] = normalise(value[key]);
    }
    return out;
  }
  return String(value);
}

function normalisedEqual(a, b) {
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
      normalisedEqual(desiredAnalysis, storedAnalysis) &&
      normalisedEqual(desiredMappings, storedMappings)
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
