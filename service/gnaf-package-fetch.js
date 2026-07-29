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

// Geodetic datum of the G-NAF distribution to load. data.gov.au publishes TWO
// active application/zip resources per release — GDA94 and GDA2020 — and the
// loader used to take whichever CKAN happened to list first, so the datum of
// every coordinate served was decided by array order. The two differ by ~1.8m
// (Australia drifts ~7cm/year), so an upstream reorder would have shifted every
// coordinate with no error and no log line.
//
// Defaults to gda94 to preserve the datum existing indexes were built with.
// Switching to gda2020 is a deliberate, consumer-visible change requiring a
// full reindex — tracked separately, see TODO.md and P071.
export const GNAF_DATUM = process.env.GNAF_DATUM || 'gda94';

/**
 * Pick the G-NAF archive resource for the requested datum.
 *
 * Replaces an array-order-dependent `.find()` that also threw a bare
 * TypeError on `path.basename(undefined)` when no zip resource matched.
 *
 * @param {object} pack parsed CKAN package_show response
 * @param {string} [datum] datum key, e.g. 'gda94' or 'gda2020'
 * @returns {{url: string, size: number, name: string}} the selected resource
 */
export function selectGnafResource(pack, datum = GNAF_DATUM) {
  const zips = (pack?.result?.resources ?? []).filter(
    (r) => r.state === 'active' && r.mimetype === 'application/zip',
  );
  if (zips.length === 0) {
    throw new Error(
      'G-NAF package contains no active application/zip resource — upstream distribution format may have changed (see ADR 006 reassessment criteria)',
    );
  }
  const wanted = String(datum).toLowerCase();
  const matches = (r) =>
    (r.url || '').toLowerCase().includes(`_${wanted}_`) ||
    (r.name || '').toLowerCase().replaceAll(/\s+/g, '').includes(wanted);
  const selected = zips.find(matches);
  if (!selected) {
    const available = zips.map((r) => r.name || r.url).join(', ');
    throw new Error(
      `G-NAF package has no ${wanted} resource; available: ${available}`,
    );
  }
  return selected;
}

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
    // P070: `fetch` does not throw on 4xx/5xx. Without this check a WAF error
    // page was cached and then JSON.parsed by address-service, surfacing as a
    // parse error that named the wrong subsystem. Throwing here also routes
    // into the stale-cache fallback below, so a transient upstream failure
    // still serves the last good package rather than breaking the load.
    if (!fetchResponse.ok) {
      throw new Error(
        `G-NAF package fetch failed: ${packageUrl} responded ${fetchResponse.status}`,
      );
    }
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
