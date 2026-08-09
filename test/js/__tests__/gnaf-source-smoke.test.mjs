// @jtbd JTBD-203 (Acquire and Refresh the G-NAF Dataset on a Self-Hosted Install)
//
// Behavioural tests for the G-NAF source smoke check (P070 / P068 task 4),
// plus a narrow set of workflow assertions.
//
// The script logic is tested behaviourally with an injected fetch, per P033.
// The workflow assertions are deliberately token-level (following the
// perf-regression-workflow.test.mjs precedent): they pin the few properties
// that would silently make the check useless or dangerous if edited away —
// the absence of id-token, and the acceptance of 206 — never whole lines.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WORKFLOW = '.github/workflows/gnaf-source-smoke.yml';

const CKAN_BODY = JSON.stringify({
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
});

function ckanFetch(status = 200) {
  return async () =>
    new Response(CKAN_BODY, {
      status,
      headers: {
        'content-type': 'application/json',
        date: new Date().toUTCString(),
      },
    });
}

describe('scripts/check-gnaf-source.mjs — probeResource', () => {
  it('accepts 206, which is what a ranged GET actually returns', async () => {
    const { probeResource } =
      await import('../../../packages/addressr/scripts/check-gnaf-source.mjs');
    const status = await probeResource('https://x/g-naf.zip', {
      fetch: async () => new Response('', { status: 206 }),
    });
    assert.equal(
      status,
      206,
      'requiring a strict 200 would red on a healthy source',
    );
  });

  it('accepts a plain 200', async () => {
    const { probeResource } =
      await import('../../../packages/addressr/scripts/check-gnaf-source.mjs');
    assert.equal(
      await probeResource('https://x/g-naf.zip', {
        fetch: async () => new Response('', { status: 200 }),
      }),
      200,
    );
  });

  it('fails on a 403, which is the breakage it exists to catch', async () => {
    const { probeResource } =
      await import('../../../packages/addressr/scripts/check-gnaf-source.mjs');
    await assert.rejects(
      () =>
        probeResource('https://x/g-naf.zip', {
          fetch: async () => new Response('', { status: 403 }),
        }),
      /403/,
    );
  });

  it('fails on a redirect and names the location', async () => {
    const { probeResource } =
      await import('../../../packages/addressr/scripts/check-gnaf-source.mjs');
    await assert.rejects(
      () =>
        probeResource('https://x/g-naf.zip', {
          fetch: async () =>
            new Response('', {
              status: 302,
              headers: { location: 'https://elsewhere.example/z.zip' },
            }),
        }),
      /elsewhere\.example/,
      'stream-down does not follow redirects, so the check must not tolerate one',
    );
  });

  it('sends the same User-Agent the loader sends', async () => {
    const { probeResource } =
      await import('../../../packages/addressr/scripts/check-gnaf-source.mjs');
    const { LOADER_USER_AGENT } =
      await import('../../../packages/addressr/service/gnaf-package-fetch.js');
    let seen;
    await probeResource('https://x/g-naf.zip', {
      fetch: async (url, options) => {
        seen = options.headers;
        return new Response('', { status: 206 });
      },
    });
    assert.equal(
      seen['User-Agent'],
      LOADER_USER_AGENT,
      'probing a request the loader never makes would leave this green while the loader breaks',
    );
  });
});

describe('scripts/check-gnaf-source.mjs — selectResource', () => {
  it('rejects a resource with an implausible size', async () => {
    const { selectResource } =
      await import('../../../packages/addressr/scripts/check-gnaf-source.mjs');
    const pack = {
      result: {
        resources: [
          {
            state: 'active',
            mimetype: 'application/zip',
            name: 'GDA94',
            url: 'https://x/g-naf_gda94_psv.zip',
            size: 0,
          },
        ],
      },
    };
    assert.throws(() => selectResource(pack, 'gda94'), /implausible size/);
  });
});

describe('scripts/check-gnaf-source.mjs — checkGnafSource end to end', () => {
  it('never serves from cache — a warm cache would make it green without a network call', async () => {
    const { checkGnafSource } =
      await import('../../../packages/addressr/scripts/check-gnaf-source.mjs');
    let calls = 0;
    const result = await checkGnafSource({
      fetch: async (url) => {
        calls += 1;
        return String(url).includes('package_show')
          ? await ckanFetch()()
          : new Response('', { status: 206 });
      },
    });
    assert.equal(calls, 2, 'both hops must hit the network every run');
    assert.match(result.url, /_gda94_/);
    assert.equal(result.status, 206);
  });

  it('fails when the CKAN hop itself is refused', async () => {
    const { checkGnafSource } =
      await import('../../../packages/addressr/scripts/check-gnaf-source.mjs');
    await assert.rejects(
      () =>
        checkGnafSource({
          fetch: async () => new Response('<html>403</html>', { status: 403 }),
        }),
      /403/,
    );
  });
});

describe('.github/workflows/gnaf-source-smoke.yml', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');
  // Comments explain WHY id-token is absent, so assert against directives only.
  const directives = workflow
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  it('declares no id-token permission', () => {
    assert.equal(
      directives.includes('id-token'),
      false,
      'id-token: write on a master-triggered workflow would make it a second principal able to assume the prod loader role',
    );
    assert.match(directives, /permissions:\s*\n\s*contents: read/);
  });

  it('takes no workflow_dispatch inputs (boolean-coercion trap)', () => {
    assert.match(directives, /workflow_dispatch:\s*\n\s*schedule:/);
  });

  it('cancels superseded runs, unlike the loader workflows', () => {
    assert.match(workflow, /cancel-in-progress: true/);
  });

  it('runs the smoke script', () => {
    assert.match(
      workflow,
      /node packages\/addressr\/scripts\/check-gnaf-source\.mjs/,
    );
  });
});
