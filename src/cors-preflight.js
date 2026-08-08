// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// The CORS preflight response, extracted from `src/waycharter-server.js` into
// clean ESM so a test can execute it rather than regex-match its source (P033).
// `waycharter-server.js` transitively imports `service/address-service` with a
// babel-only bare specifier, so raw Node ESM cannot import it and anything left
// inside it can only be asserted as text.
//
// Registration ORDER — the handler must be mounted ahead of
// `proxyAuthMiddleware` so a preflight is answered before authentication — is
// not expressible here. It is a property of `buildRest2App`, and it keeps its
// source-inspection guard in `test/js/__tests__/proxy-auth.test.mjs` for that
// reason. What moves here is everything about the response itself.

/**
 * Whether CORS preflight handling is enabled.
 *
 * Gated on `ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN` being SET, not on it being
 * truthy: when CORS is not configured the handler is not registered at all, so
 * there is no cache directive and no OPTIONS auth-exemption to reason about.
 * An empty string is a deliberate configuration and still enables it.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
export function isPreflightEnabled(env = process.env) {
  return env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined;
}

/**
 * The headers a preflight response carries, with their documented defaults.
 *
 * `Access-Control-Allow-Methods` defaults to `GET,OPTIONS` — the methods this
 * API actually serves. Widening it is a security-relevant change, not a
 * configuration convenience.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {Record<string, string>}
 */
export function preflightHeaders(env = process.env) {
  return {
    'Access-Control-Max-Age': env.ADDRESSR_ACCESS_CONTROL_MAX_AGE || '86400',
    'Access-Control-Allow-Methods':
      env.ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS || 'GET,OPTIONS',
  };
}

/**
 * Build the express handler for a CORS preflight.
 *
 * Uses `append` rather than `set` to match the shipped behaviour: an upstream
 * layer may already have set these, and `set` would silently replace it.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {(request: object, response: object) => void}
 */
export function buildPreflightHandler(env = process.env) {
  return (_request, response) => {
    const headers = Object.entries(preflightHeaders(env));
    for (const [name, value] of headers) {
      response.append(name, value);
    }
    response.status(204).end();
  };
}
