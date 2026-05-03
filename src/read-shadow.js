/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable security/detect-object-injection -- env var names are compile-time constants, not user input */

// @jtbd JTBD-201 (Validate a New Search Backend With Realistic Production Traffic Before Cutover)
//
// ADR 031: Read-shadow for search-backend migrations.
//
// Mirrors `/addresses?q=...` and `/addresses/{id}` requests to a configurable
// secondary OpenSearch backend in fire-and-forget mode. Goal: warm the
// candidate cluster's filesystem and field-data caches with realistic
// production query distribution before cutover.
//
// Default off: when `ADDRESSR_SHADOW_HOST` is unset, `mirrorRequest` is a
// no-op. Self-hosted users (npm/Docker) are unaffected.
//
// Failure isolation: every code path through `mirrorRequest` is wrapped to
// guarantee the primary `/addresses` response cannot be impacted. Synchronous
// throws from client construction or method invocation are caught; async
// rejections are swallowed via `.catch(swallowError)`; per-request
// `AbortController` timeout (default 3000ms) bounds in-flight resources under
// shadow target outage.
//
// `ADDRESSR_SHADOW_*` is the application-level shadow target (read by the
// running addressr server). It is distinct from `TF_VAR_ELASTIC_V2_*`, which
// is the Terraform input that populates EB env at deploy time. They may carry
// the same values during a migration window, but their lifecycles differ
// (shadow vars persist across migrations; V2 vars are clobbered into
// canonical names at decommission per ADR 029 step 9).

import debug from 'debug';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';

const logger = debug('api');
const error = debug('error');
error.log = console.error.bind(console);

const HOST_VAR = 'ADDRESSR_SHADOW_HOST';
const PORT_VAR = 'ADDRESSR_SHADOW_PORT';
const USERNAME_VAR = 'ADDRESSR_SHADOW_USERNAME';
const PASSWORD_VAR = 'ADDRESSR_SHADOW_PASSWORD';
const PROTOCOL_VAR = 'ADDRESSR_SHADOW_PROTOCOL';
const TIMEOUT_VAR = 'ADDRESSR_SHADOW_TIMEOUT_MS';

const SUPPORTED_METHODS = new Set(['search', 'get']);
const DEFAULT_TIMEOUT_MS = 3000;

// Module-scoped lazy singleton. The shadow client is built on first call
// and reused for the process lifetime so connection setup amortises across
// requests (the @opensearch-project/opensearch client uses keepalive HTTP
// agents internally).
let cachedClient;
let cachedClientFingerprint;

// P035: in-memory counters surfaced via /debug/shadow-config so an operator
// can answer "is shadow firing?" in <200ms without ssh-ing into EB. Reset
// at process boot; CloudWatch alarms (separate P035 task) cover the
// persistent + cross-instance surface. Increments are JS-atomic on the
// single-threaded event loop; no shared-memory worker threads in this
// process, so no race protection needed. Number.MAX_SAFE_INTEGER is 2^53-1
// — counter overflow horizon at 1000 q/s is ~285,000 years; not a concern.
let shadowAttempts = 0;
let shadowSuccesses = 0;
let shadowFailures = 0;
/** @type {{ class: 'AbortError' | 'ConnectionError' | 'AuthError' | 'UnknownError', ts: string } | null} */
// eslint-disable-next-line unicorn/no-null -- explicit null preserves JSON serialization shape (`lastError: null` vs property dropped when undefined); contract documented in getShadowStatus JSDoc
let lastShadowError = null;

function isNonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

export function validateReadShadowConfig(environment = process.env) {
  const hostSet = isNonEmpty(environment[HOST_VAR]);
  const usernameSet = isNonEmpty(environment[USERNAME_VAR]);
  const passwordSet = isNonEmpty(environment[PASSWORD_VAR]);
  if (!hostSet) {
    return; // feature disabled, nothing to validate
  }
  if (usernameSet && !passwordSet) {
    throw new Error(
      `Read-shadow misconfigured: ${USERNAME_VAR} is set but ${PASSWORD_VAR} is missing. Set both to enable basic auth, or unset both to use the shadow target without auth.`,
    );
  }
  if (passwordSet && !usernameSet) {
    throw new Error(
      `Read-shadow misconfigured: ${PASSWORD_VAR} is set but ${USERNAME_VAR} is missing. Set both to enable basic auth, or unset both to use the shadow target without auth.`,
    );
  }
}

function buildClientOptions(environment) {
  const host = environment[HOST_VAR];
  const port = environment[PORT_VAR] || '443';
  const protocol = environment[PROTOCOL_VAR] || 'https';
  const username = environment[USERNAME_VAR];
  const password = environment[PASSWORD_VAR];
  const node = isNonEmpty(username)
    ? `${protocol}://${username}:${password}@${host}:${port}`
    : `${protocol}://${host}:${port}`;
  return { node };
}

// Stable fingerprint so the cache resets when env changes between calls
// (e.g. between unit tests that snapshot/restore env). Excludes credentials.
function clientFingerprint(environment) {
  return [
    environment[HOST_VAR] || '',
    environment[PORT_VAR] || '',
    environment[PROTOCOL_VAR] || '',
    isNonEmpty(environment[USERNAME_VAR]) ? '+auth' : '-auth',
  ].join('|');
}

function getShadowClient({
  environment = process.env,
  ClientClass = OpenSearchClient,
} = {}) {
  if (!isNonEmpty(environment[HOST_VAR])) {
    return;
  }
  const fingerprint = clientFingerprint(environment);
  if (cachedClient && cachedClientFingerprint === fingerprint) {
    return cachedClient;
  }
  const options = buildClientOptions(environment);
  cachedClient = new ClientClass(options);
  cachedClientFingerprint = fingerprint;
  return cachedClient;
}

function getTimeoutMs(environment) {
  const raw = environment[TIMEOUT_VAR];
  if (!isNonEmpty(raw)) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

// Closed enum mapping (P035, ADR 024 information-disclosure remediation):
// arbitrary error shapes from the OpenSearch client get bucketed into a
// fixed-size set so the /debug/shadow-config response cannot leak free-text
// (which routinely contains hostnames, IPs, ARNs in OpenSearch errors).
function classifyError(reason) {
  if (reason && reason.name === 'AbortError') return 'AbortError';
  if (
    reason &&
    (reason.code === 'ECONNREFUSED' ||
      reason.code === 'ENOTFOUND' ||
      reason.code === 'ETIMEDOUT' ||
      reason.code === 'EAI_AGAIN' ||
      reason.code === 'ECONNRESET')
  ) {
    return 'ConnectionError';
  }
  if (reason && (reason.statusCode === 401 || reason.statusCode === 403)) {
    return 'AuthError';
  }
  return 'UnknownError';
}

function swallowError(reason) {
  shadowFailures += 1;
  lastShadowError = {
    class: classifyError(reason),
    ts: new Date().toISOString(),
  };
  if (reason && reason.name === 'AbortError') {
    error('read-shadow: request aborted by timeout');
    return;
  }
  if (reason instanceof Error) {
    error('read-shadow: %s', reason.message);
    return;
  }
  error('read-shadow: non-error rejection %o', reason);
}

// Fire-and-forget mirror to a configurable shadow OpenSearch backend.
// Returns synchronously; the kicked-off promise is detached.
//
// Programmer-error throws (unsupported method) are synchronous so callers
// notice during dev. All operational errors (network, target down, abort,
// synchronous client throws) are swallowed via swallowError.
export function mirrorRequest({
  method,
  params,
  environment = process.env,
  ClientClass = OpenSearchClient,
} = {}) {
  if (!SUPPORTED_METHODS.has(method)) {
    throw new Error(
      `read-shadow: unsupported method ${JSON.stringify(method)}; expected one of ${[...SUPPORTED_METHODS].join(', ')}`,
    );
  }
  let client;
  try {
    client = getShadowClient({ environment, ClientClass });
  } catch (constructError) {
    swallowError(constructError);
    return;
  }
  if (!client) {
    return; // feature disabled (HOST unset)
  }
  shadowAttempts += 1;
  const timeoutMs = getTimeoutMs(environment);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  let promise;
  try {
    promise = client[method](params, { signal: controller.signal });
  } catch (syncError) {
    clearTimeout(timer);
    swallowError(syncError);
    return;
  }
  if (!promise || typeof promise.then !== 'function') {
    clearTimeout(timer);
    return;
  }
  // Architect §3 / risk R2: success-callback body is wrapped in try so a
  // counter-increment exception (or any other synchronous throw) cannot
  // propagate as an unhandled rejection. Failure paths land in swallowError
  // via .catch which is itself try-shaped.
  promise
    .then(() => {
      clearTimeout(timer);
      try {
        shadowSuccesses += 1;
        logger('read-shadow: %s ok', method);
      } catch (callbackError) {
        swallowError(callbackError);
      }
      return;
    })
    .catch((error_) => {
      clearTimeout(timer);
      swallowError(error_);
    });
}

/**
 * Returns a snapshot of read-shadow runtime state for the
 * `/debug/shadow-config` endpoint. Pure read of module-scoped state plus
 * env-var presence checks; no I/O, no env-var values returned, no free-text
 * error messages, no stack traces.
 *
 * Response shape:
 * - `hostSet` / `credentialsSet`: booleans only — env vars present, not their values.
 * - `clientConstructed`: true after the first `mirrorRequest` invocation that
 *   reached the client construction step (i.e., HOST set and shadow has been
 *   exercised at least once since boot).
 * - `attempts` / `successes` / `failures`: integer counters since process start.
 *   Reset on process restart; CloudWatch covers persistent metrics.
 * - `lastError.class`: closed enum, never free text. One of:
 *   - `'AbortError'` — request timeout (AbortController fired)
 *   - `'ConnectionError'` — TCP/TLS/DNS/network reach failure (ECONNREFUSED, ENOTFOUND, etc.)
 *   - `'AuthError'` — 401/403 from shadow target
 *   - `'UnknownError'` — anything else (rare; the catch-all)
 * - `lastError.ts`: ISO 8601 timestamp of the last failure.
 *
 * P035 / ADR 024 information-disclosure remediation: the bounded enum
 * mechanically prevents leakage of hostnames, IPs, ARNs, or stack traces
 * even though the endpoint is on the proxy-auth ALLOWLIST.
 *
 * @returns {{
 *   hostSet: boolean,
 *   credentialsSet: boolean,
 *   clientConstructed: boolean,
 *   attempts: number,
 *   successes: number,
 *   failures: number,
 *   lastError: { class: 'AbortError' | 'ConnectionError' | 'AuthError' | 'UnknownError', ts: string } | null,
 * }}
 */
export function getShadowStatus(environment = process.env) {
  return {
    hostSet: isNonEmpty(environment[HOST_VAR]),
    credentialsSet:
      isNonEmpty(environment[USERNAME_VAR]) &&
      isNonEmpty(environment[PASSWORD_VAR]),
    clientConstructed: !!cachedClient,
    attempts: shadowAttempts,
    successes: shadowSuccesses,
    failures: shadowFailures,
    lastError: lastShadowError,
  };
}

// Internal: lets unit tests reset the singleton between cases. Not part of
// the public contract; flagged with a leading underscore by convention.
export function _resetShadowClientForTesting() {
  cachedClient = undefined;
  cachedClientFingerprint = undefined;
}

// Internal: lets unit tests reset counters between cases. Same convention
// as _resetShadowClientForTesting.
export function _resetShadowCountersForTesting() {
  shadowAttempts = 0;
  shadowSuccesses = 0;
  shadowFailures = 0;
  // eslint-disable-next-line unicorn/no-null -- match initial value semantics for the public lastError contract
  lastShadowError = null;
}
