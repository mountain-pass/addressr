// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// Extracted from service/address-service.js so the loader's data.gov.au CKAN
// fetch is testable behaviourally. service/address-service.js uses babel-only
// bare imports that raw Node ESM cannot resolve; this module uses clean ESM
// with `.js` extensions throughout, so behavioural tests can import it
// directly. See P033 for the source-inspection anti-pattern this avoids.
//
// fetchPackageData accepts `fetch` and `cache` via dependency injection, with
// defaults to globalThis.fetch and a Keyv-file cache backed by
// target/keyv-file.msgpack (cwd-relative, NOT module-relative — must match
// the address-service.js call site's process.cwd()).

import { Keyv } from 'keyv';
import { KeyvFile } from 'keyv-file';
import debug from 'debug';

const logger = debug('api');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

// Dataset registration on data.gov.au:
// https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc
export const GNAF_PACKAGE_URL =
  process.env.GNAF_PACKAGE_URL ||
  'https://data.gov.au/data/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc';

// data.gov.au's CloudFront WAF returns HTTP 403 on Node-default User-Agent
// (the CKAN package_show response is HTML "<!DOCTYPE…" instead of JSON).
// A Mozilla-prefixed compatible-mode UA that identifies the tool gets
// through. Verified 2026-04-28 via curl: same URL with no UA → 403; with
// this UA → 200. Surfaced by the failed ADR 029 Phase 1 step 5 v2 populate
// (run 25032179791).
export const LOADER_USER_AGENT =
  'Mozilla/5.0 (compatible; addressr-loader; +https://github.com/mountain-pass/addressr)';

// Default cache instance — same Keyv-file backend service/address-service.js
// originally created. Path is cwd-relative by design (resolves against
// process.cwd() at runtime, matching the addressr-loader CLI's working dir).
const defaultCache = new Keyv({
  store: new KeyvFile({ filename: 'target/keyv-file.msgpack' }),
});

/**
 * Fetch the data.gov.au CKAN package_show response for the G-NAF dataset.
 *
 * On cache hit (entry < 1 day old): returns the cached response with
 * `x-cache: HIT` annotation, no network call.
 *
 * On cache miss: fetches with the LOADER_USER_AGENT header, persists the
 * response to cache, returns with `x-cache: MISS`.
 *
 * On fetch failure: returns the cached response with a stale `warning`
 * header if one exists and is younger than 30 days; otherwise rethrows.
 *
 * @param {object} [deps] dependency injection for testing
 * @param {typeof globalThis.fetch} [deps.fetch] fetch implementation (default: globalThis.fetch)
 * @param {{ get: (k: string) => Promise<any>, set: (k: string, v: any) => Promise<any> }} [deps.cache] Keyv-shaped cache (default: target/keyv-file.msgpack)
 * @returns {Promise<{ body: string, headers: Record<string, string> }>}
 */
export async function fetchPackageData({
  fetch: fetchFunction = globalThis.fetch,
  cache = defaultCache,
} = {}) {
  const packageUrl = GNAF_PACKAGE_URL;
  const cachedResponse = await cache.get(packageUrl);
  logger('cached gnaf package data', cachedResponse);
  let age = 0;
  if (cachedResponse !== undefined) {
    cachedResponse.headers['x-cache'] = 'HIT';
    const created = new Date(cachedResponse.headers.date);
    logger('created', created);
    age = Date.now() - created;
    if (age <= ONE_DAY_MS) {
      return cachedResponse;
    }
  }
  // Cached value was older than one day, so go fetch.
  try {
    const fetchResponse = await fetchFunction(packageUrl, {
      headers: {
        'User-Agent': LOADER_USER_AGENT,
      },
    });
    const body = await fetchResponse.text();
    const headers = Object.fromEntries(fetchResponse.headers.entries());
    logger('fresh gnaf package data', { body, headers });
    await cache.set(packageUrl, { body, headers });
    headers['x-cache'] = 'MISS';
    return { body, headers };
  } catch (error_) {
    // Network unreachable: serve stale-up-to-30-days from cache rather
    // than fail the load entirely.
    if (cachedResponse !== undefined && age < THIRTY_DAYS_MS) {
      cachedResponse.headers['warning'] = '110\tcustom/1.0 "Response is Stale"';
      return cachedResponse;
    }
    throw error_;
  }
}
