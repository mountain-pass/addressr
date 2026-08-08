// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// Behavioural cover for the CORS preflight response, replacing six
// source-inspection regexes over `src/waycharter-server.js` (P033).
//
// The regexes asserted that the source CONTAINS `'Access-Control-Max-Age'`,
// contains `86400`, contains `status(204)`, and so on. Every one of them would
// keep passing if the handler were registered on the wrong method, appended the
// header to the wrong response, or read the wrong env var — because a string
// appearing in a file is not a header reaching a client.
//
// These run the handler and inspect what it did.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPreflightEnabled,
  preflightHeaders,
  buildPreflightHandler,
} from '../../../src/cors-preflight.js';

/** Minimal express-shaped response that records what the handler did to it. */
const fakeResponse = () => ({
  appended: [],
  statusCode: undefined,
  ended: false,
  append(name, value) {
    this.appended.push([name, value]);
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  end() {
    this.ended = true;
    return this;
  },
});

const run = (env) => {
  const response = fakeResponse();
  buildPreflightHandler(env)({}, response);
  return response;
};

describe('CORS preflight gating (P023 / ADR-037)', () => {
  it('is disabled when ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN is unset', () => {
    assert.equal(isPreflightEnabled({}), false);
  });

  it('is enabled by the variable being SET, including to an empty string', () => {
    // Deliberate: an operator setting it empty has configured CORS, and the
    // shipped gate is `!== undefined`, not truthiness. A truthiness check here
    // would silently disable preflight for that configuration.
    assert.equal(
      isPreflightEnabled({ ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN: '' }),
      true,
    );
    assert.equal(
      isPreflightEnabled({ ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN: '*' }),
      true,
    );
  });

  // NOT ASSERTED HERE, deliberately: that the handler answers only OPTIONS.
  // The handler sits AHEAD of proxyAuthMiddleware, so whatever it answers is
  // answered unauthenticated — but the method is chosen at REGISTRATION
  // (`app.options`), not inside the handler, so nothing this module exports can
  // pin it. An exported `PREFLIGHT_METHOD = 'OPTIONS'` constant was written here
  // first and removed: waycharter-server.js never consumed it, so the assertion
  // compared a literal to itself and would have stayed green through the exact
  // widening its name claimed to prevent. That is this ticket's own thesis —
  // a test named after a feature lending apparent coverage to a part of it that
  // nothing watches. The real guards are proxy-auth.test.mjs (no data methods
  // registered in the pre-auth region) and the 401 scenario in
  // test/resources/features/cors-preflight.feature.
});

describe('CORS preflight response — executed, not grepped', () => {
  it('responds 204 and ends the response', () => {
    const r = run({});
    assert.equal(r.statusCode, 204);
    assert.equal(
      r.ended,
      true,
      'a preflight that never ends hangs the browser',
    );
  });

  it('defaults Max-Age to 86400 and Allow-Methods to GET,OPTIONS', () => {
    assert.deepStrictEqual(preflightHeaders({}), {
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    });
  });

  it('takes Max-Age from ADDRESSR_ACCESS_CONTROL_MAX_AGE', () => {
    const r = run({ ADDRESSR_ACCESS_CONTROL_MAX_AGE: '600' });
    assert.deepStrictEqual(
      r.appended.find(([n]) => n === 'Access-Control-Max-Age'),
      ['Access-Control-Max-Age', '600'],
    );
  });

  it('takes Allow-Methods from ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS', () => {
    const r = run({
      ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS: 'GET,HEAD,OPTIONS',
    });
    assert.deepStrictEqual(
      r.appended.find(([n]) => n === 'Access-Control-Allow-Methods'),
      ['Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS'],
    );
  });

  it('APPENDS rather than sets, so it cannot silently drop an upstream value', () => {
    // `set` would replace whatever a proxy or an earlier middleware put there.
    // The shipped code uses `append`; this pins that choice, which no source
    // regex distinguished because both spellings contain the header name.
    const response = fakeResponse();
    response.append('Access-Control-Max-Age', 'pre-existing');
    buildPreflightHandler({})({}, response);
    assert.deepStrictEqual(response.appended, [
      ['Access-Control-Max-Age', 'pre-existing'],
      ['Access-Control-Max-Age', '86400'],
      ['Access-Control-Allow-Methods', 'GET,OPTIONS'],
    ]);
  });

  it('emits both headers before ending, not after', () => {
    // Ordering matters: headers appended after `end()` never reach the client.
    // A source regex sees all three lines and cannot tell their order.
    const order = [];
    const response = {
      append(n) {
        order.push(`append:${n}`);
        return this;
      },
      status() {
        order.push('status');
        return this;
      },
      end() {
        order.push('end');
        return this;
      },
    };
    buildPreflightHandler({})({}, response);
    assert.deepStrictEqual(order, [
      'append:Access-Control-Max-Age',
      'append:Access-Control-Allow-Methods',
      'status',
      'end',
    ]);
  });
});
