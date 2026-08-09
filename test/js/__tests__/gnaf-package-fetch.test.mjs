// Behavioural tests (NOT source-inspection — see P033) for the data.gov.au
// CKAN fetch helper. data.gov.au's CloudFront WAF returns HTTP 403 on bare
// Node `fetch()` (no User-Agent). Confirmed via curl 2026-04-28: same URL
// with no UA → 403; with `Mozilla/5.0 (compatible; addressr-loader; +URL)`
// → 200. fetchPackageData must send a Mozilla-prefixed compatible-mode UA
// on every outbound call to GNAF_PACKAGE_URL. Affects v1 quarterly schedules
// + ADR 029 Phase 1 step 5 v2 populate (run 25032179791 surfaced the issue).
//
// These tests exercise the implementation by importing it, injecting mocks
// via the DI parameters, and asserting on observable behaviour (calls
// captured from the mock fetch + response shape from the function). They
// do NOT regex-match the source.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('service/gnaf-package-fetch.js — fetchPackageData User-Agent (data.gov.au WAF compat)', () => {
  it('sends LOADER_USER_AGENT in the request headers on cache miss', async () => {
    const { fetchPackageData, LOADER_USER_AGENT } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');

    // Inject mocks via DI: cache always misses; fetch records its args
    // and returns a minimal-but-valid CKAN package_show response.
    const mockCache = {
      get: async () => {},
      set: async () => {},
    };
    const fetchCalls = [];
    const mockFetch = async (url, options) => {
      fetchCalls.push({ url, options });
      const body = JSON.stringify({ result: { resources: [] } });
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          date: new Date().toUTCString(),
        },
      });
    };

    await fetchPackageData({ fetch: mockFetch, cache: mockCache });

    assert.equal(
      fetchCalls.length,
      1,
      'fetchPackageData must call fetch exactly once on cache miss',
    );
    const [{ options }] = fetchCalls;
    assert.ok(
      options && options.headers,
      "fetchPackageData must call fetch with an options object that has a 'headers' property — bare `fetch(url)` triggers data.gov.au's CloudFront WAF 403",
    );
    assert.equal(
      options.headers['User-Agent'],
      LOADER_USER_AGENT,
      `fetch must send User-Agent: ${LOADER_USER_AGENT}. Without this header data.gov.au returns 403 and the loader fails on JSON.parse of an HTML error page (see run 25032179791).`,
    );
    assert.match(
      LOADER_USER_AGENT,
      /^Mozilla\/5\.0\s+\(compatible;\s*addressr-loader;\s*\+https:\/\/github\.com\/mountain-pass\/addressr\)$/,
      'LOADER_USER_AGENT must be a Mozilla-prefixed compatible-mode UA that identifies the tool. Required by the data.gov.au CloudFront WAF.',
    );
  });

  it('returns the cached response on cache hit without calling fetch', async () => {
    const { fetchPackageData } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');

    const cachedBody = JSON.stringify({ result: { resources: [] } });
    const cachedHeaders = {
      'content-type': 'application/json',
      date: new Date().toUTCString(),
    };
    const mockCache = {
      get: async () => ({ body: cachedBody, headers: { ...cachedHeaders } }),
      set: async () => {
        throw new Error('cache.set must not be called on cache hit');
      },
    };
    const mockFetch = async () => {
      throw new Error(
        'fetch must not be called when cache returns a fresh value',
      );
    };

    const response = await fetchPackageData({
      fetch: mockFetch,
      cache: mockCache,
    });

    assert.equal(response.body, cachedBody);
    assert.equal(
      response.headers['x-cache'],
      'HIT',
      'cache hit must annotate the returned headers with x-cache: HIT',
    );
  });

  it('returns stale cache (with warning header) when fetch fails and cache <30 days', async () => {
    const { fetchPackageData } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');

    const cachedBody = JSON.stringify({ result: { resources: [] } });
    // 2 days old: stale (>1 day) but within 30-day stale-while-error window.
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const mockCache = {
      get: async () => ({
        body: cachedBody,
        headers: {
          'content-type': 'application/json',
          date: twoDaysAgo.toUTCString(),
        },
      }),
      set: async () => {},
    };
    const mockFetch = async () => {
      throw new Error('simulated network failure');
    };

    const response = await fetchPackageData({
      fetch: mockFetch,
      cache: mockCache,
    });

    assert.equal(response.body, cachedBody);
    assert.match(
      response.headers.warning || '',
      /Response is Stale/,
      'stale-cache fallback must annotate response.headers.warning when serving stale data after a fetch failure',
    );
  });

  // P070 — the CKAN half of the same defect fixed in utils/stream-down.js.
  // `fetch` does not throw on 4xx/5xx, so a WAF error page flowed through as a
  // successful response, got written to the Keyv cache, and only surfaced as a
  // JSON.parse error in address-service that named the wrong subsystem.
  it('rejects a non-ok response instead of returning the error body', async () => {
    const { fetchPackageData } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');

    const mockCache = { get: async () => {}, set: async () => {} };
    const mockFetch = async () =>
      new Response('<!DOCTYPE html><html>403 Forbidden</html>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      });

    await assert.rejects(
      () => fetchPackageData({ fetch: mockFetch, cache: mockCache }),
      /403/,
      'a WAF error page must reject naming the status, not be parsed as CKAN JSON',
    );
  });

  it('does not cache a non-ok response', async () => {
    const { fetchPackageData } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');

    const sets = [];
    const mockCache = {
      get: async () => {},
      set: async (key, value) => {
        sets.push({ key, value });
      },
    };
    const mockFetch = async () =>
      new Response('<!DOCTYPE html><html>403 Forbidden</html>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      });

    await assert.rejects(() =>
      fetchPackageData({ fetch: mockFetch, cache: mockCache }),
    );

    assert.deepEqual(
      sets,
      [],
      'caching the error body would serve it fresh for a day and stale for thirty',
    );
  });
});

// P070 / P071 — data.gov.au publishes TWO active application/zip resources per
// release (GDA94 and GDA2020). The loader used to take whichever CKAN listed
// first, so the geodetic datum of every coordinate we serve was decided by
// array order. A reorder upstream would have shifted every coordinate ~1.8m
// with no error and no log line.
describe('service/gnaf-package-fetch.js — selectGnafResource datum pinning (P070)', () => {
  const bothDatums = {
    result: {
      resources: [
        {
          state: 'active',
          mimetype: 'application/zip',
          name: 'MAY 2026 - Geoscape G-NAF - GDA94',
          url: 'https://data.gov.au/x/g-naf_may26_allstates_gda94_psv_1023.zip',
          size: 1_703_076_498,
        },
        {
          state: 'active',
          mimetype: 'application/zip',
          name: 'MAY 2026 - Geoscape G-NAF - GDA2020',
          url: 'https://data.gov.au/x/g-naf_may26_allstates_gda2020_psv_1023.zip',
          size: 1_706_838_674,
        },
      ],
    },
  };

  it('defaults to GDA94, preserving the datum the index was built with', async () => {
    const { selectGnafResource } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');
    assert.match(selectGnafResource(bothDatums).url, /_gda94_/);
  });

  it('selects the requested datum when asked for GDA2020', async () => {
    const { selectGnafResource } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');
    assert.match(selectGnafResource(bothDatums, 'gda2020').url, /_gda2020_/);
  });

  it('is not order-dependent — a CKAN reorder must not silently flip the datum', async () => {
    const { selectGnafResource } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');
    const reordered = {
      result: { resources: [...bothDatums.result.resources].reverse() },
    };
    assert.match(
      selectGnafResource(reordered).url,
      /_gda94_/,
      'selection must be by datum, never by array position',
    );
  });

  it('throws naming the available datums when the requested one is absent', async () => {
    const { selectGnafResource } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');
    assert.throws(
      () => selectGnafResource(bothDatums, 'gda2099'),
      /gda2099[\s\S]*gda94/i,
      'the error must name what was asked for and what is actually on offer',
    );
  });

  it('throws when no active zip resource exists at all', async () => {
    const { selectGnafResource } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');
    assert.throws(
      () => selectGnafResource({ result: { resources: [] } }),
      /no active/i,
      'better than the TypeError on path.basename(undefined) this replaces',
    );
  });

  it('ignores inactive resources', async () => {
    const { selectGnafResource } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');
    const withdrawn = {
      result: {
        resources: [
          {
            state: 'deleted',
            mimetype: 'application/zip',
            name: 'old',
            url: 'https://x/g-naf_old_gda94_psv.zip',
            size: 1,
          },
          ...bothDatums.result.resources,
        ],
      },
    };
    assert.equal(selectGnafResource(withdrawn).size, 1_703_076_498);
  });
});
