// ADR 029 zero-outage cutover: /health must reflect OpenSearch reachability so a
// misconfigured v2/SigV4 cutover fails EB's health-gated rolling deploy (which
// triggers RollbackLaunchOnFailure) instead of silently serving query errors
// that the auto-rollback cannot see.
//
// Probe = `ping()` (HEAD /). It is the lightest call, it is signed under
// ELASTIC_AUTH_MODE=sigv4 so a wrong endpoint / bad SigV4 creds / unreachable
// domain (the realistic cutover misconfig class) makes it throw, and — unlike a
// GREEN-keyed cluster.health() — it does NOT false-red while the cluster is
// legitimately yellow (e.g. the ADR 029 replicas-0-then-add-replica populate
// window). Tolerance for transient blips lives in the ELB thresholds
// (UnhealthyThreshold=5 consecutive failures at a 10s interval ≈ 50s sustained),
// NOT here — the handler stays fast and fail-closed. That ~50s also absorbs the
// brief startup-connect window (esConnect completes in a few seconds on a fresh
// instance, well under 50s). `/health` is on the ADR 024 origin-auth allowlist
// (unauthenticated at the origin), so the cheapest probe + a bounded timeout also
// minimises the load an anonymous caller can amplify onto OpenSearch.
//
// Kill-switch: set HEALTH_ES_PROBE=off to revert /health to always-200 without a
// redeploy if the ES→ELB-pool coupling ever misbehaves in production.

const DEFAULT_REQUEST_TIMEOUT_MS = 2000;

/**
 * Whether /health should probe OpenSearch. Off-switch for ops (no redeploy).
 * @param {Record<string,string|undefined>} [env]
 * @returns {boolean}
 */
export function isEsProbeEnabled(environment = process.env) {
  return environment.HEALTH_ES_PROBE !== 'off';
}

/**
 * Liveness check for the app's OpenSearch connection.
 * @param {object} esClient - the OpenSearch client (typically globalThis.esClient).
 * @param {{requestTimeout?: number}} [options]
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function checkEsHealth(
  esClient,
  { requestTimeout = DEFAULT_REQUEST_TIMEOUT_MS } = {},
) {
  // Startup window: server2.js starts listening before globalThis.esClient is
  // assigned. Report not-connected (→ 503) so a never-connecting bad cutover
  // stays unhealthy; the brief normal-startup gap is absorbed by the ELB
  // consecutive-failure threshold.
  if (!esClient || typeof esClient.ping !== 'function') {
    return { ok: false, reason: 'not-connected' };
  }
  try {
    await esClient.ping({}, { requestTimeout });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.name || 'ping-failed' };
  }
}

// Short-TTL cache so anonymous /health hits cannot amplify onto OpenSearch: the
// probe runs at most once per ttl regardless of caller volume. Both ok and
// not-ok results are cached, so an outage-time flood does not re-hammer an
// already-stressed cluster. ~5s staleness is well inside the ELB down-detection
// window (~50s = 5 fails × 10s interval), and because the ELB polls every 10s
// (> ttl) every steady-state probe re-pings fresh — the cache only bites under a
// sub-ttl flood, which is exactly what it is meant to bound.
// ponytail: resolved-value cache — a burst of concurrent misses on one expiry
// each fires a ping; if a hard 1-per-ttl ceiling is ever needed, cache the
// in-flight promise (dedupe concurrent probes) instead.
let healthCache = { result: undefined, expiresAt: 0 };

/** Test-only: clear the module-level health cache between cases. */
export function _resetHealthCache() {
  healthCache = { result: undefined, expiresAt: 0 };
}

/**
 * checkEsHealth with a short-TTL cache (amplification bound for /health).
 * @param {object} esClient
 * @param {{ttlMs?: number, now?: () => number, requestTimeout?: number}} [options]
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function checkEsHealthCached(
  esClient,
  { ttlMs = 5000, now = Date.now, requestTimeout } = {},
) {
  const t = now();
  if (healthCache.result !== undefined && t < healthCache.expiresAt) {
    return healthCache.result;
  }
  const result = await checkEsHealth(
    esClient,
    requestTimeout === undefined ? undefined : { requestTimeout },
  );
  healthCache = { result, expiresAt: t + ttlMs };
  return result;
}
