// @jtbd JTBD-203 (Acquire and Refresh the G-NAF Dataset on a Self-Hosted Install)
//
// Standing smoke check that the G-NAF source is still fetchable, so silent
// upstream breakage is caught on this script's cadence rather than at the next
// quarterly load. This is P068 investigation task 4, carried into P070.
//
// It is deliberately NOT the same guard as the byte verification in
// utils/stream-down.js: that only runs when a load runs, which is 8 firings a
// year. P068 was found by an external reporter because nothing sampled the
// source in between.
//
// Fidelity matters more than coverage here. The check reuses fetchPackageData
// (with the cache injected out, so it always hits the network) and sends the
// same LOADER_USER_AGENT the loader sends on both hops. Probing a request the
// loader does not make would leave this green while the loader breaks.

import {
  fetchPackageData,
  selectGnafResource,
  LOADER_USER_AGENT,
  GNAF_PACKAGE_URL,
  GNAF_DATUM,
} from '../service/gnaf-package-fetch.js';

// Never serve this check from cache — a warm target/keyv-file.msgpack would
// make it green without touching data.gov.au at all.
const NO_CACHE = { get: async () => undefined, set: async () => {} };

/**
 * Validate the resource the loader would actually download, using the same
 * datum-pinned selector the loader uses, so the check cannot pass on a
 * resource the loader would never pick.
 */
export function selectResource(pack, datum = GNAF_DATUM) {
  const selected = selectGnafResource(pack, datum);
  if (!selected.url) {
    throw new Error(
      `G-NAF source check failed: selected resource "${selected.name}" has no url`,
    );
  }
  if (!Number.isFinite(selected.size) || selected.size <= 0) {
    throw new Error(
      `G-NAF source check failed: selected resource "${selected.name}" has implausible size ${selected.size}`,
    );
  }
  return { selected };
}

/**
 * Probe the resource URL with a one-byte range request. A ranged GET answers
 * 206 on success, so both 200 and 206 are healthy; anything else (including a
 * redirect, which utils/stream-down.js does not follow) is a failure.
 */
export async function probeResource(url, { fetch: fetchFunction = globalThis.fetch } = {}) {
  const response = await fetchFunction(url, {
    headers: { 'User-Agent': LOADER_USER_AGENT, Range: 'bytes=0-0' },
  });
  if (response.status !== 200 && response.status !== 206) {
    const location = response.headers?.get?.('location');
    throw new Error(
      `G-NAF source check failed: ${url} responded ${response.status}` +
        (location ? ` (location: ${location})` : ''),
    );
  }
  return response.status;
}

export async function checkGnafSource(deps = {}) {
  const packageResponse = await fetchPackageData({ cache: NO_CACHE, ...deps });
  const pack = JSON.parse(packageResponse.body);
  const { selected } = selectResource(pack);
  const status = await probeResource(selected.url, deps);
  return { name: selected.name, url: selected.url, size: selected.size, status };
}

// Only run when invoked directly, so the tests can import the helpers.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  try {
    const result = await checkGnafSource();
    console.log(`G-NAF source OK`);
    console.log(`  package:  ${GNAF_PACKAGE_URL}`);
    console.log(`  datum:    ${GNAF_DATUM}`);
    console.log(`  resource: ${result.name}`);
    console.log(`  url:      ${result.url}`);
    console.log(
      `  probe:    HTTP ${result.status}, declared ${result.size} bytes`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
