import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkEsHealth,
  isEsProbeEnabled,
  checkEsHealthCached,
  _resetHealthCache,
} from '../../../src/es-health.js';

// ADR 029 zero-outage: /health must reflect OpenSearch reachability so a
// misconfigured v2/SigV4 cutover fails EB's health-gated rollout (auto-rollback)
// instead of serving query errors. These tests pin the checkEsHealth contract:
// ping-ok -> healthy; ping-throws / no-client -> unhealthy with a reason.

describe('checkEsHealth', () => {
  it('returns ok when the client ping resolves', async () => {
    const client = { ping: async () => ({ statusCode: 200 }) };
    const result = await checkEsHealth(client);
    assert.deepEqual(result, { ok: true });
  });

  it('returns not-ok with the error name when ping throws', async () => {
    const client = {
      ping: async () => {
        const e = new Error('signature mismatch');
        e.name = 'AuthenticationException';
        throw e;
      },
    };
    const result = await checkEsHealth(client);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'AuthenticationException');
  });

  it('returns not-connected when the client is missing (startup window)', async () => {
    const result = await checkEsHealth(undefined);
    assert.deepEqual(result, { ok: false, reason: 'not-connected' });
  });

  it('returns not-connected when the client has no ping method', async () => {
    const result = await checkEsHealth({});
    assert.deepEqual(result, { ok: false, reason: 'not-connected' });
  });

  it('passes a bounded requestTimeout to ping so /health responds within the ELB timeout', async () => {
    let seen;
    const client = {
      ping: async (_params, options) => {
        seen = options;
        return { statusCode: 200 };
      },
    };
    await checkEsHealth(client, { requestTimeout: 1500 });
    assert.equal(seen.requestTimeout, 1500);
  });

  it('defaults to a 2s requestTimeout when none is supplied', async () => {
    let seen;
    const client = {
      ping: async (_params, options) => {
        seen = options;
        return { statusCode: 200 };
      },
    };
    await checkEsHealth(client);
    assert.equal(seen.requestTimeout, 2000);
  });
});

describe('isEsProbeEnabled (ops kill-switch)', () => {
  it('is enabled by default', () => {
    assert.equal(isEsProbeEnabled({}), true);
  });

  it('is disabled when HEALTH_ES_PROBE=off', () => {
    assert.equal(isEsProbeEnabled({ HEALTH_ES_PROBE: 'off' }), false);
  });

  it('stays enabled for any other value', () => {
    assert.equal(isEsProbeEnabled({ HEALTH_ES_PROBE: 'on' }), true);
  });
});

describe('checkEsHealthCached (bounds anonymous ping amplification)', () => {
  const makeClient = () => {
    let calls = 0;
    return {
      ping: async () => {
        calls += 1;
        return { statusCode: 200 };
      },
      get calls() {
        return calls;
      },
    };
  };

  it('probes on the first call and caches the result', async () => {
    _resetHealthCache();
    const client = makeClient();
    let t = 1000;
    const now = () => t;
    const r1 = await checkEsHealthCached(client, { ttlMs: 5000, now });
    assert.deepEqual(r1, { ok: true });
    assert.equal(client.calls, 1);
  });

  it('serves cached result within the TTL without re-pinging', async () => {
    _resetHealthCache();
    const client = makeClient();
    let t = 1000;
    const now = () => t;
    await checkEsHealthCached(client, { ttlMs: 5000, now });
    t = 4000; // still within 5s TTL
    await checkEsHealthCached(client, { ttlMs: 5000, now });
    assert.equal(client.calls, 1); // no second ping — amplification bounded
  });

  it('re-probes after the TTL expires', async () => {
    _resetHealthCache();
    const client = makeClient();
    let t = 1000;
    const now = () => t;
    await checkEsHealthCached(client, { ttlMs: 5000, now });
    t = 6001; // past the 5s TTL
    await checkEsHealthCached(client, { ttlMs: 5000, now });
    assert.equal(client.calls, 2);
  });

  it('caches an unhealthy result too (no amplification during an outage)', async () => {
    _resetHealthCache();
    let calls = 0;
    const client = {
      ping: async () => {
        calls += 1;
        throw Object.assign(new Error('down'), { name: 'ConnectionError' });
      },
    };
    let t = 1000;
    const now = () => t;
    const r1 = await checkEsHealthCached(client, { ttlMs: 5000, now });
    assert.equal(r1.ok, false);
    t = 3000;
    await checkEsHealthCached(client, { ttlMs: 5000, now });
    assert.equal(calls, 1); // outage result cached; ES not re-hammered
  });
});
