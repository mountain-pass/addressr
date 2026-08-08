// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// `buildRest2App` and `startRest2Server`, executed rather than read.
//
// EVERY ASSERTION IN THIS FILE USED TO BE A REGEX OVER SOURCE TEXT. Seven of
// them, and they were the largest surviving cluster on P033 (source-inspection
// tests are an anti-pattern) — a ticket carrying one confirmed four-month
// production defect, P091. They were not written carelessly: `buildRest2App`
// could not be imported by a raw `node --test` process, because it transitively
// pulled a Babel-only bare specifier. Source inspection was the honest
// instrument while that was true. ADR-044 (native ESM without a build step)
// removed the blocker, and this file is the criterion that decision wrote to
// stop itself being a tidy-up wearing a defect-prevention justification:
// "The benefit is realised, not merely enabled."
//
// NOT THE FIRST BEHAVIOURAL COVERAGE, and the distinction matters here more
// than it looks. `test/resources/features/cors-preflight.feature` already
// covers the preflight properties in the embedded cucumber profile. What this
// adds is a FAST PRE-COMMIT TIER for them: no OpenSearch, no loaded index, no
// loader run, so these execute on every commit and on the Node 22.7 engine
// floor where no cucumber tier can. Claiming "first behavioural coverage"
// would repeat this file's own 2026-08-03 correction, where a comment asserted
// runtime coverage from a feature file that did not exist and left ADR-037's
// criteria resting on text matching.
//
// THE INSTRUMENT IS `light-my-request`, NOT A SOCKET, matching
// test/js/drivers/AddressrRest2EmbeddedDriver.js so this tier and the embedded
// cucumber tier cannot disagree about what "the app" is. It also avoids the two
// ways a real listener fails badly in a pre-commit gate: port binding is the
// one thing that fails for environmental reasons in a CI sandbox, and a leaked
// listener handle keeps `node --test` alive past the last assertion, which is a
// hang rather than a failure.
//
// TWO ENV VARS, TWO DIFFERENT MOMENTS — the sharpest trap in this file.
// `isPreflightEnabled()` is read at REGISTRATION time, inside `buildRest2App`,
// so `ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN` must be set BEFORE the app is
// built. `proxyAuthMiddleware` reads its pair at REQUEST time, so those can be
// set after. Set the first one late and the preflight is 401, which reads as an
// ordering regression and is really a missing precondition.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { inject } from 'light-my-request';
import {
  buildRest2App,
  startRest2Server,
} from '../../../src/waycharter-server.js';

const ACAO = 'ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN';
const AUTH_HEADER = 'ADDRESSR_PROXY_AUTH_HEADER';
const AUTH_VALUE = 'ADDRESSR_PROXY_AUTH_VALUE';
const SHADOW_HOST = 'ADDRESSR_SHADOW_HOST';
const SHADOW_USER = 'ADDRESSR_SHADOW_USERNAME';
const SHADOW_PASS = 'ADDRESSR_SHADOW_PASSWORD';

const MANAGED = [
  ACAO,
  AUTH_HEADER,
  AUTH_VALUE,
  SHADOW_HOST,
  SHADOW_USER,
  SHADOW_PASS,
];

// Snapshot/restore per proxy-auth.test.mjs. Node gives each test FILE its own
// process, so cross-file bleed is not the hazard; within-file ordering is, and
// several cases here depend on a var being absent rather than merely different.
let snapshot;
beforeEach(() => {
  snapshot = Object.fromEntries(MANAGED.map((k) => [k, process.env[k]]));
  for (const k of MANAGED) delete process.env[k];
});
afterEach(() => {
  for (const k of MANAGED) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

/** Build the app AFTER the environment is arranged, never before. */
const appWithCors = () => {
  process.env[ACAO] = '*';
  return buildRest2App();
};

const enableAuth = (secret = 'correct-horse-battery-staple') => {
  process.env[AUTH_HEADER] = 'x-gateway-secret';
  process.env[AUTH_VALUE] = secret;
  return secret;
};

const PREFLIGHT_HEADERS = {
  Origin: 'https://consumer.example',
  'Access-Control-Request-Method': 'GET',
};

describe('root / cache-control (P018 parked — long-lived by design)', () => {
  it('serves the root resource with a one-week public cache directive', async () => {
    // Was: a regex for `'cache-control': \`public, max-age=${ONE_WEEK}\`` inside
    // the root registration block. That would keep passing if the directive
    // were emitted on the wrong response, or after the body was sent.
    //
    // DERIVING 604800 RATHER THAN IMPORTING IT IS DELIBERATE. `ONE_WEEK` is not
    // exported from src/waycharter-server.js, and it should stay that way: this
    // guard exists because P018 is parked on the judgement that a SHORT ttl
    // would cost an origin round-trip on every client page load. Pinning the
    // VALUE means shortening the constant in source fails here, which is the
    // whole point. Import a shared constant to "remove the duplication" and the
    // guard silently stops guarding.
    const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;
    const response = await inject(buildRest2App(), { method: 'GET', url: '/' });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers['cache-control'],
      `public, max-age=${ONE_WEEK_SECONDS}`,
      'the root resource is fetched by every client for HATEOAS discovery; a shortened directive costs an origin round-trip per page load (P018 parked)',
    );
  });
});

describe('CORS preflight ordering (P023 / ADR-037) — answered before authentication', () => {
  // Was: `body.indexOf('app.options(') < body.indexOf('app.use(proxyAuthMiddleware())')`
  // over the source of buildRest2App. That is a fact about statement order, and
  // it was the only instrument for a SECURITY BOUNDARY: an unauthenticated
  // preflight carries no gateway secret, so registered on the wrong side of the
  // middleware it is 401-ed and the browser never sees the cache directive.
  //
  // The four cases below are one assertion, not four. The 401s are what make
  // the 204 mean something: without them the preflight could be 204 because
  // authentication is not enabled at all, and the test would pass through the
  // exact regression it names.

  it('answers an unauthenticated preflight 204 while auth is enforced', async () => {
    const app = appWithCors();
    enableAuth();
    const response = await inject(app, {
      method: 'OPTIONS',
      url: '/addresses',
      headers: PREFLIGHT_HEADERS,
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-max-age'], '86400');
  });

  it('401s an unauthenticated data GET on the same path — the control', async () => {
    // Without this, the 204 above is satisfied by auth being off.
    const app = appWithCors();
    enableAuth();
    const response = await inject(app, {
      method: 'GET',
      url: '/addresses?q=x',
    });
    assert.equal(
      response.statusCode,
      401,
      'if this is not 401 the preflight 204 proves nothing — authentication is not enforced on this path at all',
    );
  });

  it('lets the same GET through when the secret is presented', async () => {
    // Asserts NOT-401 rather than 200: this isolates the authentication
    // decision from whether a search backend is reachable, which it is not in
    // this tier.
    const app = appWithCors();
    const secret = enableAuth();
    const response = await inject(app, {
      method: 'GET',
      url: '/addresses?q=x',
      headers: { 'x-gateway-secret': secret },
    });
    assert.notEqual(response.statusCode, 401);
  });

  it('does not exempt OPTIONS when CORS is off, so the exemption cannot outlive its reason', async () => {
    // ADR-037 R1: the handler is registered ONLY inside the CORS opt-in, so
    // with CORS off the preflight falls through to authentication like anything
    // else. Without this arm, deleting `if (isPreflightEnabled())` and always
    // registering would pass every other case in this file while creating a
    // permanent unauthenticated hole on OPTIONS for operators who never opted
    // into CORS at all.
    //
    // ADR-037 named this criterion and cited a source-inspection instrument for
    // it that DID NOT EXIST. This is that criterion getting its first guard.
    const app = buildRest2App(); // CORS deliberately not enabled
    enableAuth();
    const response = await inject(app, {
      method: 'OPTIONS',
      url: '/addresses',
      headers: PREFLIGHT_HEADERS,
    });
    assert.notEqual(
      response.statusCode,
      204,
      'with CORS disabled the preflight handler must not be registered, so OPTIONS is subject to authentication',
    );
    assert.equal(response.headers['access-control-max-age'], undefined);
  });
});

describe('startRest2Server — startup validators (ADR-031, ADR-024)', () => {
  // Was: a regex for `validateReadShadowConfig()` inside the function body,
  // plus a regex asserting the import specifier. The import assertion is gone
  // rather than converted: under native ESM a missing or renamed named import
  // is a LINK error, so every test in this file fails loudly. Asserting a
  // specifier is asserting nothing, which is P033's own thesis.

  it('refuses to start on a half-configured read-shadow credential pair', async () => {
    // NAMING THE SHADOW VARS IS LOAD-BEARING. startRest2Server calls
    // validateProxyAuthConfig() FIRST, and both validators are fail-loud-on-
    // partial with near-identical message shapes (ADR-031 took the pattern from
    // ADR-024). A bare assert.throws here would stay green if the
    // validateReadShadowConfig() call were deleted outright — the proxy-auth
    // validator would throw instead and the test could not tell. The
    // beforeEach has cleared the proxy-auth pair, and the message assertion is
    // the second guard.
    process.env[SHADOW_HOST] = 'shadow.example';
    process.env[SHADOW_USER] = 'someone';
    // password deliberately absent

    await assert.rejects(
      async () => startRest2Server(),
      (error) => {
        assert.match(error.message, /ADDRESSR_SHADOW_PASSWORD/);
        assert.match(error.message, /ADDRESSR_SHADOW_USERNAME/);
        return true;
      },
      'a half-set shadow credential pair must fail the process at startup rather than silently degrading to an unauthenticated shadow target',
    );
  });

  it('validates proxy auth BEFORE read-shadow, so the first failure named is the first check', async () => {
    // Pins the documented ordering with both configurations broken at once.
    // The same discipline as the 401 control above: an assertion that can only
    // pass for the reason it claims.
    process.env[AUTH_HEADER] = 'x-gateway-secret';
    // auth value deliberately absent
    process.env[SHADOW_HOST] = 'shadow.example';
    process.env[SHADOW_USER] = 'someone';
    // shadow password deliberately absent

    await assert.rejects(
      async () => startRest2Server(),
      (error) => {
        assert.match(error.message, /ADDRESSR_PROXY_AUTH/);
        assert.doesNotMatch(error.message, /SHADOW/);
        return true;
      },
    );
  });
});

describe('/debug/shadow-config (P035, ADR-024) — reachable and live', () => {
  it('reports LIVE shadow state, not a literal', async () => {
    // Was: three regexes — that the resource type is registered, that the
    // loader mentions getShadowStatus(), and that a no-cache directive appears
    // within 600 characters of the path literal.
    //
    // The hostSet FLIP is the load-bearing half and must not be dropped back to
    // "reachable + returns 200". It is what proves the loader calls
    // getShadowStatus() rather than returning a canned object, and it is also
    // what entails the import this file no longer asserts directly.
    const off = await inject(buildRest2App(), {
      method: 'GET',
      url: '/debug/shadow-config',
    });
    assert.equal(off.statusCode, 200);
    assert.equal(off.headers['cache-control'], 'no-cache');
    assert.equal(
      JSON.parse(off.body).hostSet,
      false,
      'with no shadow host configured the endpoint must report hostSet false',
    );

    process.env[SHADOW_HOST] = 'shadow.example';
    const on = await inject(buildRest2App(), {
      method: 'GET',
      url: '/debug/shadow-config',
    });
    assert.equal(
      JSON.parse(on.body).hostSet,
      true,
      'the endpoint must reflect live shadow state; a hard-coded body would not flip',
    );
  });

  it('stays reachable with proxy auth on and no secret presented', async () => {
    // The COMPOSED property, which nothing pinned before. proxy-auth.test.mjs
    // pins the allowlist SET twice, but membership is checked by exact match on
    // request.path, and this endpoint is registered through WayCharter's
    // router. A mounting or normalisation change breaks the match while both
    // existing unit tests stay green, because neither routes a real request —
    // and an operator endpoint silently moving behind gateway auth is exactly
    // the kind of regression nobody notices until an incident.
    const app = buildRest2App();
    enableAuth();
    const response = await inject(app, {
      method: 'GET',
      url: '/debug/shadow-config',
    });
    assert.equal(
      response.statusCode,
      200,
      'the debug endpoint is allowlisted from proxy auth (ADR-024); if this 401s the allowlist path no longer matches the routed path',
    );
    assert.equal(response.headers['cache-control'], 'no-cache');
  });
});
