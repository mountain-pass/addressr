// @jtbd JTBD-001 (contract: HTTP-cache behaviour) per ADR 007
// Playwright browser test — verifies the addressr root response is served from
// the browser's HTTP cache on a subsequent page load (fresh JS context,
// shared browser HTTP cache). Per ADR 007, does NOT use createIntegrationClient()
// — raw fetch() is required so the response goes through the browser cache path
// without any intermediate wrapper.
//
// Detection signal: Chrome DevTools Protocol's Network.responseReceived event
// carries `fromDiskCache` / `fromServiceWorker` flags. For a memory-cache hit,
// no Network.responseReceived event fires at all. Both outcomes prove the
// response came from the browser cache rather than the network.
//
// We cannot use PerformanceResourceTiming.transferSize because Chromium redacts
// it to 0 for cross-origin responses without a Timing-Allow-Origin header,
// which RapidAPI does not send. transferSize === 0 would thus be ambiguous.

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(HERE, '../test/fixtures');
const FIXTURE_ORIGIN = 'http://cache-fixtures.localhost';
const ROOT_URL = 'https://addressr.p.rapidapi.com/';
const API_HOST = 'addressr.p.rapidapi.com';

function requireApiKey(): string {
  const key = process.env.ADDRESSR_RAPIDAPI_KEY;
  if (!key) {
    throw new Error(
      'ADDRESSR_RAPIDAPI_KEY is required for browser integration tests. ' +
        'Set it locally via `op inject -i .env.tpl -o .env && set -a && source .env && set +a`, ' +
        'or via GitHub Actions secrets in CI.',
    );
  }
  return key;
}

interface NetworkEvent {
  url: string;
  status: number;
  fromDiskCache: boolean;
  fromServiceWorker: boolean;
  fromPrefetchCache: boolean;
}

test.describe('browser HTTP-cache behaviour for the addressr root', () => {
  test.beforeEach(async ({ context }) => {
    await context.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const filename = pathname.replace(/^\//, '');
      const content = await readFile(path.join(FIXTURES_DIR, filename), 'utf8');
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: content,
      });
    });
  });

  // Skipped until upstream fix — see docs/problems/006-browser-cache-miss-on-addressr-root.md.
  // The RapidAPI gateway sends `Cache-Control: public, max-age=604800` but Chromium
  // does not cache the response across fetches, likely due to CORS credentials config
  // on the preflight + missing Access-Control-Max-Age. Mitigated in-library by the
  // rootPromise in-memory cache, so the functional impact is low.
  // The Node-side `Cache-Control` header assertion in api.integration.test.ts stays
  // as a regression detector for the server contract.
  test.skip('second page-load fetch of the root is served from the browser HTTP cache', async ({ page, context }) => {
    const apiKey = requireApiKey();

    // Attach a CDP session to observe network-level cache behaviour.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');

    const rootEvents: NetworkEvent[] = [];
    cdp.on('Network.responseReceived', (event) => {
      if (event.response.url === ROOT_URL) {
        rootEvents.push({
          url: event.response.url,
          status: event.response.status,
          fromDiskCache: event.response.fromDiskCache ?? false,
          fromServiceWorker: event.response.fromServiceWorker ?? false,
          fromPrefetchCache: event.response.fromPrefetchCache ?? false,
        });
      }
    });

    async function fetchRoot() {
      return page.evaluate(
        async ({ url, apiKey, apiHost }) => {
          const response = await fetch(url, {
            credentials: 'omit',
            headers: {
              'x-rapidapi-key': apiKey,
              'x-rapidapi-host': apiHost,
            },
          });
          await response.text();
          return { ok: response.ok, status: response.status };
        },
        { url: ROOT_URL, apiKey, apiHost: API_HOST },
      );
    }

    // Page A — prime the cache. Fresh JS context via page navigation.
    await page.goto(`${FIXTURE_ORIGIN}/cache-page-a.html`);
    const pageAResult = await fetchRoot();
    expect(pageAResult.ok).toBe(true);

    const pageAEventCount = rootEvents.length;

    // Page B — fresh JS context, same browser context (shared HTTP cache).
    await page.goto(`${FIXTURE_ORIGIN}/cache-page-b.html`);
    const pageBResult = await fetchRoot();
    expect(pageBResult.ok).toBe(true);

    // Small delay to let any trailing CDP events settle.
    await page.waitForTimeout(250);

    const pageBEvents = rootEvents.slice(pageAEventCount);

    // eslint-disable-next-line no-console
    console.log('Page A events:', JSON.stringify(rootEvents.slice(0, pageAEventCount), null, 2));
    // eslint-disable-next-line no-console
    console.log('Page B events:', JSON.stringify(pageBEvents, null, 2));

    // Filter out CORS preflight (status 204) — those always hit the network
    // unless the server sends Access-Control-Max-Age on the OPTIONS response.
    // That's a separate concern (preflight caching) from data-response caching.
    const pageBDataEvents = pageBEvents.filter((e) => e.status !== 204);

    // Every remaining network event for Page B must indicate a browser-cache source.
    for (const event of pageBDataEvents) {
      expect(
        event.fromDiskCache || event.fromServiceWorker || event.fromPrefetchCache,
        `Expected Page B's root response to come from a browser cache; got ${JSON.stringify(event)}`,
      ).toBe(true);
    }
  });
});
