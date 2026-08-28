import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- tests run on the repository's current Node version.
import { webcrypto } from 'node:crypto';

const VALID_KEY = `addr_ABCDEF123456_${'s'.repeat(32)}`;

// ADR 032 (P042): module-shape smoke test for the worker entry. The full
// handler integration surface (fetch behaviour, RapidAPI key injection,
// 401 body shape) is covered by the release.yml smoke probes at lines
// 230-246 — running them inside Node would require a CF runtime mock that
// out-scopes the user's "matcher unit tests only" TDD decision for P042.
// This test exists at the module-load level: it catches syntax errors,
// import resolution failures, and accidental loss of the `fetch` export
// shape that the Cloudflare runtime depends on.
describe('cloudflare-worker/worker — module shape', () => {
  it('exports a default object with a `fetch` function', async () => {
    const module_ = await import('./worker.js');
    assert.equal(typeof module_.default, 'object');
    assert.equal(typeof module_.default.fetch, 'function');
  });

  it('worker.fetch returns Response 500 when RAPIDAPI_KEY is missing (JTBD-200 fail-loud)', async () => {
    const module_ = await import('./worker.js');
    const request = new Request('https://api.addressr.io/addresses/X');
    const response = await module_.default.fetch(request, {});
    assert.equal(response.status, 500);
    assert.equal(await response.text(), 'RAPIDAPI_KEY not configured');
  });

  it('a supplied customer key never falls back to the demo principal', async () => {
    const module_ = await import('./worker.js');
    const request = new Request('https://api.addressr.io/addresses/X', {
      headers: {
        'x-addressr-api-key': VALID_KEY,
        Origin: 'https://addressr.io',
      },
    });
    const response = await module_.default.fetch(request, {
      RAPIDAPI_KEY: 'demo-secret',
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'managed_channel_not_configured',
    });
  });

  it('valid customer traffic uses D1 and the direct origin without forwarding credentials', async (context) => {
    const module_ = await import('./worker.js');
    const database = await customerDatabase(VALID_KEY);
    let received;
    context.mock.method(globalThis, 'fetch', async (request) => {
      received = request;
      return Response.json({ ok: true }, { status: 200 });
    });

    const response = await module_.default.fetch(
      new Request('https://api.addressr.io/addresses?q=main', {
        headers: {
          'CF-Ray': 'stable-origin-choice',
          'x-addressr-api-key': VALID_KEY,
          'x-rapidapi-key': 'spoofed',
          'x-origin-secret': 'spoofed',
        },
      }),
      customerEnvironment(database),
    );

    assert.equal(response.status, 200);
    assert.equal(new URL(received.url).hostname, 'origin-a.example');
    assert.equal(received.headers.has('x-addressr-api-key'), false);
    assert.equal(received.headers.has('x-rapidapi-key'), false);
    assert.equal(received.headers.get('x-origin-secret'), 'origin-secret');
    assert.deepEqual(database.operations, ['auth', 'reserve', 'finalize']);
  });

  it('non-billable origin outcomes release quota and leave no usage record', async (context) => {
    const module_ = await import('./worker.js');
    const database = await customerDatabase(VALID_KEY);
    context.mock.method(
      globalThis,
      'fetch',
      async () => new Response('not found', { status: 404 }),
    );

    const response = await module_.default.fetch(
      new Request('https://api.addressr.io/addresses/missing', {
        headers: { 'x-addressr-api-key': VALID_KEY },
      }),
      customerEnvironment(database),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(database.operations, ['auth', 'reserve', 'release']);
  });

  it('quota exhaustion rejects before an origin request', async (context) => {
    const module_ = await import('./worker.js');
    const database = await customerDatabase(VALID_KEY, {
      quotaExhausted: true,
    });
    let isFetched = false;
    context.mock.method(globalThis, 'fetch', async () => {
      isFetched = true;
      return new Response();
    });

    const response = await module_.default.fetch(
      new Request('https://api.addressr.io/addresses/X', {
        headers: { 'x-addressr-api-key': VALID_KEY },
      }),
      customerEnvironment(database),
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'quota_exhausted' });
    assert.equal(isFetched, false);
    assert.deepEqual(database.operations, ['auth', 'reserve']);
  });

  it('abuse throttling rejects before authentication or commercial accounting', async () => {
    const module_ = await import('./worker.js');
    const database = await customerDatabase(VALID_KEY);
    const response = await module_.default.fetch(
      new Request('https://api.addressr.io/addresses/X', {
        headers: {
          'CF-Connecting-IP': '192.0.2.10',
          'x-addressr-api-key': VALID_KEY,
        },
      }),
      {
        ...customerEnvironment(database),
        CUSTOMER_RATE_LIMITER: {
          async limit({ key }) {
            assert.equal(key, '192.0.2.10');
            return { success: false };
          },
        },
      },
    );

    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '60');
    assert.deepEqual(await response.json(), { error: 'abuse_rate_limited' });
    assert.deepEqual(database.operations, []);
  });

  for (const subscriptionStatus of ['active', 'trialing', 'past_due']) {
    it(`allows ${subscriptionStatus} subscriptions`, async (context) => {
      const module_ = await import('./worker.js');
      const database = await customerDatabase(VALID_KEY, {
        subscriptionStatus,
      });
      context.mock.method(
        globalThis,
        'fetch',
        async () => new Response(undefined, { status: 200 }),
      );

      const response = await module_.default.fetch(
        new Request('https://api.addressr.io/addresses/X', {
          headers: { 'x-addressr-api-key': VALID_KEY },
        }),
        customerEnvironment(database),
      );

      assert.equal(response.status, 200);
      assert.deepEqual(database.operations, ['auth', 'reserve', 'finalize']);
    });
  }

  for (const subscriptionStatus of [
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'canceled',
    'paused',
    '',
    'future_status',
  ]) {
    it(`rejects ${String(subscriptionStatus)} subscriptions before origin`, async (context) => {
      const module_ = await import('./worker.js');
      const database = await customerDatabase(VALID_KEY, {
        subscriptionStatus,
      });
      let isFetched = false;
      context.mock.method(globalThis, 'fetch', async () => {
        isFetched = true;
        return new Response();
      });

      const response = await module_.default.fetch(
        new Request('https://api.addressr.io/addresses/X', {
          headers: { 'x-addressr-api-key': VALID_KEY },
        }),
        customerEnvironment(database),
      );

      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        error: 'subscription_inactive',
      });
      assert.equal(isFetched, false);
      assert.deepEqual(database.operations, ['auth']);
    });
  }

  it('rejects paused collection before origin', async (context) => {
    const module_ = await import('./worker.js');
    const database = await customerDatabase(VALID_KEY, {
      pauseCollection: true,
    });
    let isFetched = false;
    context.mock.method(globalThis, 'fetch', async () => {
      isFetched = true;
      return new Response();
    });

    const response = await module_.default.fetch(
      new Request('https://api.addressr.io/addresses/X', {
        headers: { 'x-addressr-api-key': VALID_KEY },
      }),
      customerEnvironment(database),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'collection_paused' });
    assert.equal(isFetched, false);
    assert.deepEqual(database.operations, ['auth']);
  });

  it('rejects unsupported payment methods before origin', async (context) => {
    const module_ = await import('./worker.js');
    const database = await customerDatabase(VALID_KEY, {
      paymentMethodPolicy: 'unsupported',
    });
    let isFetched = false;
    context.mock.method(globalThis, 'fetch', async () => {
      isFetched = true;
      return new Response();
    });

    const response = await module_.default.fetch(
      new Request('https://api.addressr.io/addresses/X', {
        headers: { 'x-addressr-api-key': VALID_KEY },
      }),
      customerEnvironment(database),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: 'unsupported_payment_method',
    });
    assert.equal(isFetched, false);
    assert.deepEqual(database.operations, ['auth']);
  });

  it('existing website-demo traffic still uses RapidAPI', async (context) => {
    const module_ = await import('./worker.js');
    let received;
    context.mock.method(globalThis, 'fetch', async (request) => {
      received = request;
      return new Response('demo');
    });

    const response = await module_.default.fetch(
      new Request('https://api.addressr.io/addresses/X', {
        headers: { Origin: 'https://addressr.io' },
      }),
      {
        RAPIDAPI_KEY: 'demo-secret',
        DEMO_RATE_LIMITER: allowingLimiter('addressr.io'),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(new URL(received.url).hostname, 'addressr.p.rapidapi.com');
    assert.equal(received.headers.get('x-rapidapi-key'), 'demo-secret');
  });

  it('monitoring uses its IP credential and isolated limiter', async (context) => {
    const module_ = await import('./worker.js');
    context.mock.method(
      globalThis,
      'fetch',
      async () => new Response('monitor'),
    );

    const response = await module_.default.fetch(
      new Request('https://api.addressr.io/addresses/X', {
        headers: { 'CF-Connecting-IP': '69.162.124.227' },
      }),
      {
        RAPIDAPI_KEY: 'monitor-secret',
        MONITOR_RATE_LIMITER: allowingLimiter('69.162.124.227'),
      },
    );

    assert.equal(response.status, 200);
  });
});

function allowingLimiter(expectedKey) {
  return {
    async limit({ key }) {
      assert.equal(key, expectedKey);
      return { success: true };
    },
  };
}

function customerEnvironment(database) {
  return {
    CUSTOMER_DB: database,
    MANAGED_ORIGIN_URLS: JSON.stringify([
      'https://origin-a.example',
      'https://origin-b.example',
    ]),
    ORIGIN_AUTH_HEADER: 'x-origin-secret',
    ORIGIN_AUTH_VALUE: 'origin-secret',
    BILLABLE_STATUSES: '[200]',
  };
}

async function customerDatabase(
  key,
  {
    quotaExhausted = false,
    subscriptionStatus = 'active',
    pauseCollection = false,
    paymentMethodPolicy = 'immediate',
  } = {},
) {
  const salt = new TextEncoder().encode('0123456789abcdef');
  const material = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = new Uint8Array(
    await webcrypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 10_000 },
      material,
      256,
    ),
  );
  const operations = [];

  return {
    operations,
    prepare(sql) {
      const operation = sql.includes('SELECT')
        ? 'auth'
        : sql.includes('INSERT')
          ? 'reserve'
          : sql.includes('UPDATE')
            ? 'finalize'
            : 'release';
      return {
        bind() {
          return {
            async first() {
              operations.push(operation);
              return {
                api_key_id: 'key-1',
                organization_id: 'org-1',
                key_hash: toBase64(hash),
                key_salt: toBase64(salt),
                key_iterations: 10_000,
                hash_version: 'pbkdf2-sha256-v1',
                subscription_status: subscriptionStatus,
                pause_collection: pauseCollection ? 1 : 0,
                payment_method_policy: paymentMethodPolicy,
                quota_limit: 100,
                quota_used: 0,
              };
            },
            async run() {
              operations.push(operation);
              if (operation === 'reserve' && quotaExhausted) {
                throw new Error('quota_exhausted');
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

function toBase64(bytes) {
  return btoa(String.fromCodePoint(...bytes));
}
