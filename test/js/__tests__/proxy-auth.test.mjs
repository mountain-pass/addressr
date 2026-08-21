/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */

/* eslint-disable max-lines-per-function */
/* eslint-disable unicorn/consistent-function-scoping */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ADR 024 Confirmation criteria 3 & 4:
// Partial configuration of the ADDRESSR_PROXY_AUTH_* env var pair must fail
// process startup with a clear error that names both env vars.

describe('validateProxyAuthConfig (ADR 024)', () => {
  let snapshot;

  beforeEach(() => {
    snapshot = {
      header: process.env.ADDRESSR_PROXY_AUTH_HEADER,
      value: process.env.ADDRESSR_PROXY_AUTH_VALUE,
    };
    delete process.env.ADDRESSR_PROXY_AUTH_HEADER;
    delete process.env.ADDRESSR_PROXY_AUTH_VALUE;
  });

  afterEach(() => {
    if (snapshot.header === undefined) {
      delete process.env.ADDRESSR_PROXY_AUTH_HEADER;
    } else {
      process.env.ADDRESSR_PROXY_AUTH_HEADER = snapshot.header;
    }
    if (snapshot.value === undefined) {
      delete process.env.ADDRESSR_PROXY_AUTH_VALUE;
    } else {
      process.env.ADDRESSR_PROXY_AUTH_VALUE = snapshot.value;
    }
  });

  it('does not throw when both env vars are unset (self-hosted default)', async () => {
    const { validateProxyAuthConfig } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    assert.doesNotThrow(() => validateProxyAuthConfig());
  });

  it('does not throw when both env vars are set', async () => {
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Gateway-Secret';
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
    const { validateProxyAuthConfig } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    assert.doesNotThrow(() => validateProxyAuthConfig());
  });

  it('throws when only ADDRESSR_PROXY_AUTH_HEADER is set, naming both vars and the missing one', async () => {
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Gateway-Secret';
    const { validateProxyAuthConfig } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    assert.throws(
      () => validateProxyAuthConfig(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /ADDRESSR_PROXY_AUTH_HEADER/);
        assert.match(error.message, /ADDRESSR_PROXY_AUTH_VALUE/);
        assert.match(error.message, /missing/i);
        return true;
      },
    );
  });

  it('throws when only ADDRESSR_PROXY_AUTH_VALUE is set, naming both vars and the missing one', async () => {
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
    const { validateProxyAuthConfig } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    assert.throws(
      () => validateProxyAuthConfig(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /ADDRESSR_PROXY_AUTH_HEADER/);
        assert.match(error.message, /ADDRESSR_PROXY_AUTH_VALUE/);
        assert.match(error.message, /missing/i);
        return true;
      },
    );
  });
});

describe('proxyAuthMiddleware (ADR 024)', () => {
  let snapshot;

  beforeEach(() => {
    snapshot = {
      header: process.env.ADDRESSR_PROXY_AUTH_HEADER,
      value: process.env.ADDRESSR_PROXY_AUTH_VALUE,
    };
    delete process.env.ADDRESSR_PROXY_AUTH_HEADER;
    delete process.env.ADDRESSR_PROXY_AUTH_VALUE;
  });

  afterEach(() => {
    if (snapshot.header === undefined) {
      delete process.env.ADDRESSR_PROXY_AUTH_HEADER;
    } else {
      process.env.ADDRESSR_PROXY_AUTH_HEADER = snapshot.header;
    }
    if (snapshot.value === undefined) {
      delete process.env.ADDRESSR_PROXY_AUTH_VALUE;
    } else {
      process.env.ADDRESSR_PROXY_AUTH_VALUE = snapshot.value;
    }
  });

  function runMiddleware(mw, { path = '/addresses', headers = {} } = {}) {
    return new Promise((resolve) => {
      const request = {
        path,
        headers: Object.fromEntries(
          Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
        ),
        get(name) {
          return this.headers[name.toLowerCase()];
        },
      };
      const res = {
        statusCode: 200,
        body: undefined,
        headersOut: {},
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          this.headersOut['content-type'] = 'application/json';
          resolve({ req: request, res: this, nextCalled: false });
        },
      };
      mw(request, res, () => resolve({ req: request, res, nextCalled: true }));
    });
  }

  it('is a pass-through when both env vars are unset', async () => {
    const { proxyAuthMiddleware } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    const { nextCalled } = await runMiddleware(proxyAuthMiddleware());
    assert.equal(nextCalled, true);
  });

  it('rejects with 401 when header is missing', async () => {
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Test-Header';
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
    const { proxyAuthMiddleware } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    const { res, nextCalled } = await runMiddleware(proxyAuthMiddleware());
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'Authentication required' });
  });

  it('rejects with 401 when header value is wrong', async () => {
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Test-Header';
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
    const { proxyAuthMiddleware } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    const { res, nextCalled } = await runMiddleware(proxyAuthMiddleware(), {
      headers: { 'X-Test-Header': 'wrong' },
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it('passes when header value matches', async () => {
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Test-Header';
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
    const { proxyAuthMiddleware } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    const { nextCalled } = await runMiddleware(proxyAuthMiddleware(), {
      headers: { 'X-Test-Header': 's3cr3t' },
    });
    assert.equal(nextCalled, true);
  });

  it('exempts /health from enforcement', async () => {
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Test-Header';
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
    const { proxyAuthMiddleware } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    const { nextCalled } = await runMiddleware(proxyAuthMiddleware(), {
      path: '/health',
    });
    assert.equal(nextCalled, true);
  });

  it('exempts /api-docs from enforcement', async () => {
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Test-Header';
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
    const { proxyAuthMiddleware } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    const { nextCalled } = await runMiddleware(proxyAuthMiddleware(), {
      path: '/api-docs',
    });
    assert.equal(nextCalled, true);
  });

  // P035: /debug/shadow-config is an operator-diagnostic endpoint per ADR
  // 024's debug-endpoint policy. Allowlisted because the response shape is
  // bounded (no free-text, no infra leakage) — see src/read-shadow.js
  // getShadowStatus JSDoc for the closed enum.
  it('exempts /debug/shadow-config from enforcement', async () => {
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Test-Header';
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
    const { proxyAuthMiddleware } =
      await import('../../../packages/addressr/src/proxy-auth.js');
    const { nextCalled } = await runMiddleware(proxyAuthMiddleware(), {
      path: '/debug/shadow-config',
    });
    assert.equal(nextCalled, true);
  });
});

// Risk-scorer R1: ALLOWLIST is a closed list per ADR 024. This snapshot
// test asserts exact membership so future accidental widening (e.g. adding
// an entry without going through architect review) trips the test before
// the change can land.
describe('proxy-auth ALLOWLIST membership (ADR 024 closed list)', () => {
  let snapshot;

  beforeEach(() => {
    snapshot = {
      header: process.env.ADDRESSR_PROXY_AUTH_HEADER,
      value: process.env.ADDRESSR_PROXY_AUTH_VALUE,
    };
    process.env.ADDRESSR_PROXY_AUTH_HEADER = 'X-Test-Header';
    process.env.ADDRESSR_PROXY_AUTH_VALUE = 's3cr3t';
  });

  afterEach(() => {
    if (snapshot.header === undefined) {
      delete process.env.ADDRESSR_PROXY_AUTH_HEADER;
    } else {
      process.env.ADDRESSR_PROXY_AUTH_HEADER = snapshot.header;
    }
    if (snapshot.value === undefined) {
      delete process.env.ADDRESSR_PROXY_AUTH_VALUE;
    } else {
      process.env.ADDRESSR_PROXY_AUTH_VALUE = snapshot.value;
    }
  });

  // Local copy of the middleware harness — the original lives inside the
  // first describe's closure. Duplicated rather than hoisted to keep the
  // diff for this test localised.
  function runMiddleware(mw, { path = '/addresses', headers = {} } = {}) {
    return new Promise((resolve) => {
      const request = {
        path,
        headers: Object.fromEntries(
          Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
        ),
        get(name) {
          return this.headers[name.toLowerCase()];
        },
      };
      const res = {
        statusCode: 200,
        body: undefined,
        headersOut: {},
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          this.headersOut['content-type'] = 'application/json';
          resolve({ req: request, res: this, nextCalled: false });
        },
      };
      mw(request, res, () => resolve({ req: request, res, nextCalled: true }));
    });
  }

  it('contains exactly the documented closed list', async () => {
    const moduleSource =
      await import('../../../packages/addressr/src/proxy-auth.js');
    const expected = ['/health', '/api-docs', '/debug/shadow-config'];
    for (const path of expected) {
      const { nextCalled } = await runMiddleware(
        moduleSource.proxyAuthMiddleware(),
        { path },
      );
      assert.equal(
        nextCalled,
        true,
        `expected ALLOWLIST path ${path} to be exempt`,
      );
    }
    // Spot-check a sample of paths that MUST NOT be allowlisted. If any
    // future change widens the list (e.g. broad prefix matching), one of
    // these will start passing through and the test will fail loudly.
    const mustNotExempt = [
      '/addresses',
      '/addresses/GAACT_123',
      '/localities',
      '/debug',
      '/debug/other-endpoint',
      '/debug/shadow-config/extra',
      '/',
    ];
    for (const path of mustNotExempt) {
      const result = await runMiddleware(moduleSource.proxyAuthMiddleware(), {
        path,
      });
      assert.equal(
        result.nextCalled,
        false,
        `path ${path} must NOT be exempt from proxy auth`,
      );
    }
  });
});

// CONVERTED 2026-08-21 — RFC-009 row 4. The source-inspection guard that stood
// here scanned `src/waycharter-server.js` as text for a data-method responder
// registered ahead of `app.use(proxyAuthMiddleware())`.
//
// Replaced by a structural guard over the BUILT APP in
// `waycharter-server.test.mjs`, which inspects Express's middleware stack and
// asserts what may precede the auth layer. It dominates this pin on every
// measured shape: the pin was blind to a path-scoped `app.use`, and could not
// tell a registration that executes from one that does not.
//
// Deleted only after seven mutations were proved CAUGHT against the
// replacement WITH this pin already removed. Do not re-add a text scan here;
// the built app is the truth and the source text is a proxy for it.
