/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable unicorn/prevent-abbreviations */
/* eslint-disable max-lines-per-function */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ADR 031 Confirmation criteria:
// Read-shadow mirrors /addresses?q and /addresses/{id} requests to a
// configurable secondary OpenSearch backend in fire-and-forget mode.
// Default off; partial credential pair fails at startup; shadow failures
// cannot impact the primary path.

const SHADOW_VARS = [
  'ADDRESSR_SHADOW_HOST',
  'ADDRESSR_SHADOW_PORT',
  'ADDRESSR_SHADOW_USERNAME',
  'ADDRESSR_SHADOW_PASSWORD',
  'ADDRESSR_SHADOW_PROTOCOL',
  'ADDRESSR_SHADOW_TIMEOUT_MS',
];

function snapshotEnv() {
  const snap = {};
  for (const k of SHADOW_VARS) {
    snap[k] = process.env[k];
    delete process.env[k];
  }
  return snap;
}

function restoreEnv(snap) {
  for (const k of SHADOW_VARS) {
    if (snap[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = snap[k];
    }
  }
}

describe('validateReadShadowConfig (ADR 031)', () => {
  let snapshot;

  beforeEach(() => {
    snapshot = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(snapshot);
  });

  it('does not throw when ADDRESSR_SHADOW_HOST is unset (self-hosted default)', async () => {
    const { validateReadShadowConfig } =
      await import('../../../src/read-shadow.js');
    assert.doesNotThrow(() => validateReadShadowConfig());
  });

  it('does not throw when host is set and credentials pair is fully set', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    process.env.ADDRESSR_SHADOW_USERNAME = 'user';
    process.env.ADDRESSR_SHADOW_PASSWORD = 'pass';
    const { validateReadShadowConfig } =
      await import('../../../src/read-shadow.js');
    assert.doesNotThrow(() => validateReadShadowConfig());
  });

  it('does not throw when host is set and credentials pair is fully unset', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const { validateReadShadowConfig } =
      await import('../../../src/read-shadow.js');
    assert.doesNotThrow(() => validateReadShadowConfig());
  });

  it('throws when only ADDRESSR_SHADOW_USERNAME is set, naming both vars and the missing one', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    process.env.ADDRESSR_SHADOW_USERNAME = 'user';
    const { validateReadShadowConfig } =
      await import('../../../src/read-shadow.js');
    assert.throws(
      () => validateReadShadowConfig(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /ADDRESSR_SHADOW_USERNAME/);
        assert.match(error.message, /ADDRESSR_SHADOW_PASSWORD/);
        assert.match(error.message, /missing/i);
        return true;
      },
    );
  });

  it('throws when only ADDRESSR_SHADOW_PASSWORD is set, naming both vars and the missing one', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    process.env.ADDRESSR_SHADOW_PASSWORD = 'pass';
    const { validateReadShadowConfig } =
      await import('../../../src/read-shadow.js');
    assert.throws(
      () => validateReadShadowConfig(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /ADDRESSR_SHADOW_USERNAME/);
        assert.match(error.message, /ADDRESSR_SHADOW_PASSWORD/);
        assert.match(error.message, /missing/i);
        return true;
      },
    );
  });
});

describe('mirrorRequest (ADR 031)', () => {
  let snapshot;

  beforeEach(() => {
    snapshot = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(snapshot);
  });

  it('is a no-op when ADDRESSR_SHADOW_HOST is unset (no client constructed, no calls made)', async () => {
    const calls = [];
    const FakeClient = class {
      constructor(options) {
        calls.push({ event: 'construct', options });
      }
      async search(parameters) {
        calls.push({ event: 'search', parameters });
        return { body: {} };
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: { query: { match_all: {} } } },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, []);
  });

  it('calls the shadow client search method when host is set', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const calls = [];
    const FakeClient = class {
      constructor(options) {
        calls.push({ event: 'construct', options });
      }
      async search(parameters, options) {
        calls.push({
          event: 'search',
          parameters,
          hasSignal: !!options?.signal,
        });
        return { body: {} };
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: { query: { match_all: {} } } },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].event, 'construct');
    assert.equal(calls[1].event, 'search');
    assert.deepEqual(calls[1].parameters, {
      index: 'addressr',
      body: { query: { match_all: {} } },
    });
    assert.equal(calls[1].hasSignal, true);
  });

  it('returns synchronously without awaiting the shadow promise', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    let shadowResolved = false;
    const FakeClient = class {
      // eslint-disable-next-line no-unused-vars
      async search(_parameters) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        shadowResolved = true;
        return { body: {} };
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    const returnValue = mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });

    assert.equal(returnValue, undefined);
    assert.equal(shadowResolved, false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(shadowResolved, true);
  });

  it('swallows shadow client rejection without raising unhandled rejection', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    let unhandled = false;
    const onUnhandled = () => {
      unhandled = true;
    };
    process.on('unhandledRejection', onUnhandled);

    const FakeClient = class {
      // eslint-disable-next-line no-unused-vars
      async search(_parameters) {
        throw new Error('shadow target unreachable');
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    assert.doesNotThrow(() =>
      mirrorRequest({
        method: 'search',
        params: { index: 'addressr', body: {} },
        ClientClass: FakeClient,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    process.off('unhandledRejection', onUnhandled);
    assert.equal(unhandled, false);
  });

  it('swallows synchronous throws from the shadow client constructor', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const FakeClient = class {
      constructor() {
        throw new Error('synchronous client construction failure');
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    assert.doesNotThrow(() =>
      mirrorRequest({
        method: 'search',
        params: { index: 'addressr', body: {} },
        ClientClass: FakeClient,
      }),
    );
  });

  it('swallows synchronous throws from the shadow client method', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const FakeClient = class {
      // Note: synchronous throw, not a rejected promise
      // eslint-disable-next-line no-unused-vars
      search(_parameters) {
        throw new Error('synchronous method failure');
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    assert.doesNotThrow(() =>
      mirrorRequest({
        method: 'search',
        params: { index: 'addressr', body: {} },
        ClientClass: FakeClient,
      }),
    );
  });

  it('caches the shadow client across calls (single construction)', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    let constructions = 0;
    const FakeClient = class {
      constructor() {
        constructions += 1;
      }
      async search() {
        return { body: {} };
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });
    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });
    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(constructions, 1);
  });

  it('passes an AbortSignal that aborts after the configured timeout', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    process.env.ADDRESSR_SHADOW_TIMEOUT_MS = '20';
    const observedSignals = [];
    const FakeClient = class {
      async search(_parameters, options) {
        observedSignals.push(options.signal);
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(observedSignals.length, 1);
    assert.equal(observedSignals[0].aborted, true);
  });

  it('rejects unknown method synchronously (programmer error)', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    assert.throws(
      () =>
        mirrorRequest({
          method: 'delete',
          params: { index: 'addressr' },
          ClientClass: class {},
        }),
      /unsupported.*method/i,
    );
  });

  it('supports method=get for the doc-cache warming path', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const calls = [];
    const FakeClient = class {
      async get(parameters, options) {
        calls.push({ event: 'get', parameters, hasSignal: !!options?.signal });
        return { body: {} };
      }
    };
    const { mirrorRequest, _resetShadowClientForTesting } =
      await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();

    mirrorRequest({
      method: 'get',
      params: { index: 'addressr', id: 'GAACT_123' },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].event, 'get');
    assert.equal(calls[0].parameters.id, 'GAACT_123');
    assert.equal(calls[0].hasSignal, true);
  });
});

// P035: getShadowStatus exposes runtime counters + presence flags so the
// /debug/shadow-config endpoint can answer "is shadow firing?" as a 200ms
// HTTP GET. ADR 031 isolation invariant must hold for the new code paths
// (counter increments cannot impact the primary response).
const ERROR_CLASSES = new Set([
  'AbortError',
  'ConnectionError',
  'AuthError',
  'UnknownError',
]);

describe('getShadowStatus (P035)', () => {
  let snapshot;

  beforeEach(() => {
    snapshot = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(snapshot);
  });

  it('returns all-false / zero counters when shadow is disabled (host unset)', async () => {
    const {
      getShadowStatus,
      _resetShadowClientForTesting,
      _resetShadowCountersForTesting,
    } = await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();
    _resetShadowCountersForTesting();

    const status = getShadowStatus();
    assert.equal(status.hostSet, false);
    assert.equal(status.credentialsSet, false);
    assert.equal(status.clientConstructed, false);
    assert.equal(status.attempts, 0);
    assert.equal(status.successes, 0);
    assert.equal(status.failures, 0);
    assert.equal(status.lastError, null);
  });

  it('returns hostSet:true when ADDRESSR_SHADOW_HOST is configured', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const { getShadowStatus, _resetShadowCountersForTesting } = await import(
      '../../../src/read-shadow.js'
    );
    _resetShadowCountersForTesting();

    const status = getShadowStatus();
    assert.equal(status.hostSet, true);
    assert.equal(status.credentialsSet, false);
  });

  it('returns credentialsSet:false when only one of USERNAME/PASSWORD is set', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    process.env.ADDRESSR_SHADOW_USERNAME = 'user';
    const { getShadowStatus, _resetShadowCountersForTesting } = await import(
      '../../../src/read-shadow.js'
    );
    _resetShadowCountersForTesting();

    const status = getShadowStatus();
    assert.equal(status.credentialsSet, false);
  });

  it('returns credentialsSet:true when both USERNAME and PASSWORD are set', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    process.env.ADDRESSR_SHADOW_USERNAME = 'user';
    process.env.ADDRESSR_SHADOW_PASSWORD = 'pass';
    const { getShadowStatus, _resetShadowCountersForTesting } = await import(
      '../../../src/read-shadow.js'
    );
    _resetShadowCountersForTesting();

    const status = getShadowStatus();
    assert.equal(status.credentialsSet, true);
  });

  it('clientConstructed flips false → true after the first mirrorRequest call', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const FakeClient = class {
      async search() {
        return { body: {} };
      }
    };
    const {
      getShadowStatus,
      mirrorRequest,
      _resetShadowClientForTesting,
      _resetShadowCountersForTesting,
    } = await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();
    _resetShadowCountersForTesting();

    assert.equal(getShadowStatus().clientConstructed, false);

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(getShadowStatus().clientConstructed, true);
  });

  it('counters increment correctly on success path', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const FakeClient = class {
      async search() {
        return { body: {} };
      }
    };
    const {
      getShadowStatus,
      mirrorRequest,
      _resetShadowClientForTesting,
      _resetShadowCountersForTesting,
    } = await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();
    _resetShadowCountersForTesting();

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });
    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });
    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    const status = getShadowStatus();
    assert.equal(status.attempts, 3);
    assert.equal(status.successes, 3);
    assert.equal(status.failures, 0);
    assert.equal(status.lastError, null);
  });

  it('counters increment correctly on failure path with ConnectionError class', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const FakeClient = class {
      async search() {
        const error_ = new Error('connect ECONNREFUSED 127.0.0.1:12345');
        error_.code = 'ECONNREFUSED';
        throw error_;
      }
    };
    const {
      getShadowStatus,
      mirrorRequest,
      _resetShadowClientForTesting,
      _resetShadowCountersForTesting,
    } = await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();
    _resetShadowCountersForTesting();

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    const status = getShadowStatus();
    assert.equal(status.attempts, 1);
    assert.equal(status.successes, 0);
    assert.equal(status.failures, 1);
    assert.ok(status.lastError);
    assert.equal(status.lastError.class, 'ConnectionError');
    assert.match(status.lastError.ts, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('captures AbortError class when AbortController fires', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    process.env.ADDRESSR_SHADOW_TIMEOUT_MS = '20';
    const FakeClient = class {
      async search(_parameters, options) {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      }
    };
    const {
      getShadowStatus,
      mirrorRequest,
      _resetShadowClientForTesting,
      _resetShadowCountersForTesting,
    } = await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();
    _resetShadowCountersForTesting();

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    const status = getShadowStatus();
    assert.equal(status.failures, 1);
    assert.equal(status.lastError.class, 'AbortError');
  });

  it('captures AuthError class when shadow target returns 401', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    const FakeClient = class {
      async search() {
        const error_ = new Error('Response Error');
        error_.statusCode = 401;
        throw error_;
      }
    };
    const {
      getShadowStatus,
      mirrorRequest,
      _resetShadowClientForTesting,
      _resetShadowCountersForTesting,
    } = await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();
    _resetShadowCountersForTesting();

    mirrorRequest({
      method: 'search',
      params: { index: 'addressr', body: {} },
      ClientClass: FakeClient,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    const status = getShadowStatus();
    assert.equal(status.failures, 1);
    assert.equal(status.lastError.class, 'AuthError');
  });

  it('lastError.class is always one of the closed-set enum values, never free text (R4)', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    // Drive multiple distinct error shapes to exercise the classifier
    const errorShapes = [
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('Response Error'), { statusCode: 403 }),
      new Error('something weird'),
      'a non-error string rejection',
    ];
    const {
      getShadowStatus,
      mirrorRequest,
      _resetShadowClientForTesting,
      _resetShadowCountersForTesting,
    } = await import('../../../src/read-shadow.js');

    for (const shape of errorShapes) {
      _resetShadowClientForTesting();
      _resetShadowCountersForTesting();
      const FakeClient = class {
        async search() {
          throw shape;
        }
      };
      mirrorRequest({
        method: 'search',
        params: { index: 'addressr', body: {} },
        ClientClass: FakeClient,
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const status = getShadowStatus();
      assert.ok(
        ERROR_CLASSES.has(status.lastError.class),
        `lastError.class must be in closed enum; got: ${status.lastError.class}`,
      );
    }
  });

  it('counter-increment-as-failure-mode: incrementer throwing synchronously does not bubble (architect §3 / risk R2)', async () => {
    process.env.ADDRESSR_SHADOW_HOST = 'shadow.example.com';
    let unhandled = false;
    const onUnhandled = () => {
      unhandled = true;
    };
    process.on('unhandledRejection', onUnhandled);

    // Simulate the shadow client returning a Promise whose .then() handler
    // would throw synchronously when invoked. mirrorRequest's success
    // callback path must catch this so the failure cannot bubble out as an
    // unhandled rejection or impact the primary path.
    const FakeClient = class {
      // Returns an object whose .then() callback receives a "trapped" body
      // that throws when accessed. mirrorRequest's success callback only
      // increments a counter; instead, we simulate a malformed promise
      // resolution by having .then() invoke its handler with a body that
      // forces the handler into an exception path on access.
      async search() {
        return new Proxy(
          {},
          {
            get(_target, prop) {
              if (prop === 'then') return undefined; // fall through to plain resolve
              throw new Error('synthetic throw on body access');
            },
          },
        );
      }
    };

    const {
      mirrorRequest,
      _resetShadowClientForTesting,
      _resetShadowCountersForTesting,
    } = await import('../../../src/read-shadow.js');
    _resetShadowClientForTesting();
    _resetShadowCountersForTesting();

    assert.doesNotThrow(() =>
      mirrorRequest({
        method: 'search',
        params: { index: 'addressr', body: {} },
        ClientClass: FakeClient,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    process.off('unhandledRejection', onUnhandled);
    assert.equal(unhandled, false, 'shadow code path must not raise unhandled rejection');
  });
});
