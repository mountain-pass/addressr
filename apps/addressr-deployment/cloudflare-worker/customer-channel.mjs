/* eslint-disable n/no-unsupported-features/node-builtins -- Cloudflare Workers provides Web Crypto and randomUUID. */
const API_KEY_PATTERN = /^addr_([A-Za-z0-9]{12})_[A-Za-z0-9_-]{32,}$/;
const HASH_VERSION = 'pbkdf2-sha256-v1';
const ALLOWED_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
]);

const AUTH_SQL = `
  SELECT
    k.id AS api_key_id,
    k.organization_id,
    o.clerk_organization_id,
    k.key_hash,
    k.key_salt,
    k.key_iterations,
    k.hash_version,
    e.subscription_status,
    e.pause_collection,
    e.payment_method_policy,
    e.quota_limit,
    e.hard_limit,
    e.quota_used
  FROM api_keys k
  JOIN organizations o ON o.id = k.organization_id
  JOIN entitlements e ON e.organization_id = k.organization_id
  WHERE k.prefix = ? AND k.revoked_at IS NULL
  LIMIT 1
`;

// Problem 147. The gate reads the counter; it does not move it. The increment
// happens at settle, by trigger, only when the outcome is billable — so a
// reservation that never settles costs the customer nothing.
//
// Conditional insert rather than a RAISE, so quota exhaustion arrives as
// `changes === 0` instead of an exception whose message has to be matched. That
// also stops the caller reporting "the store is unavailable" for a refusal the
// store handled correctly.
//
// Requests arriving in the same instant each read the pre-increment count, so a
// hard limit can be exceeded by roughly the number in flight. Accepted by the
// maintainer on 2026-09-06 against the alternative of counting rows, which keeps
// the limit exactly hard at a cost that grows with requests already made in the
// period. See migration 0003.
// Exported so the D1 tests bind the statement under test rather than a copy of
// it. A mirrored fixture drifts silently: a change here would leave the quota
// assertions passing against SQL that is no longer shipped.
export const RESERVE_SQL = `
  INSERT INTO usage_records (
    id, organization_id, api_key_id, request_path, outcome, created_at
  )
  SELECT ?, ?, ?, ?, 'reserved', ?
  WHERE EXISTS (
    SELECT 1 FROM entitlements
    WHERE organization_id = ?
      AND (hard_limit = 0 OR quota_used < quota_limit)
  )
`;

const FINALIZE_SQL = `
  UPDATE usage_records
  SET outcome = 'billable', origin_status = ?
  WHERE id = ? AND outcome = 'reserved'
`;

const RELEASE_SQL = `
  DELETE FROM usage_records
  WHERE id = ? AND outcome = 'reserved'
`;

export async function createCustomerKey() {
  const prefix = [...crypto.getRandomValues(new Uint8Array(6))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const key = `addr_${prefix}_${randomToken(32)}`;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 10_000;
  const keyHash = await deriveKeyHash(key, salt, iterations, 32);
  return {
    key,
    prefix,
    keyHash: toBase64(keyHash),
    keySalt: toBase64(salt),
    keyIterations: iterations,
    hashVersion: HASH_VERSION,
  };
}

export function customerKeyFrom(request) {
  return request.headers.get('x-addressr-api-key');
}

export async function throttleCustomerAbuse(request, environment) {
  if (!environment?.CUSTOMER_RATE_LIMITER) return;
  try {
    const outcome = await environment.CUSTOMER_RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'unknown-source',
    });
    if (outcome.success) return;
    return Response.json(
      { error: 'abuse_rate_limited' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  } catch {
    return unavailable('abuse_control_unavailable').response;
  }
}

export async function authorizeCustomer(request, environment) {
  const key = customerKeyFrom(request);
  if (!key) return { kind: 'not-customer' };

  const prefix = API_KEY_PATTERN.exec(key)?.[1];
  if (!prefix) return denied('invalid_key');
  if (!environment?.CUSTOMER_DB) return unavailable('customer_db_missing');

  let record;
  try {
    record = await environment.CUSTOMER_DB.prepare(AUTH_SQL)
      .bind(prefix)
      .first();
  } catch {
    return unavailable('customer_db_unavailable');
  }

  if (!record || !(await keyMatches(key, record))) return denied('invalid_key');
  if (
    !isManagedOrganizationAllowed(environment, record.clerk_organization_id)
  ) {
    return denied('organization_not_enabled');
  }
  if (!ALLOWED_SUBSCRIPTION_STATUSES.has(record.subscription_status)) {
    return denied('subscription_inactive');
  }
  if (record.pause_collection) return denied('collection_paused');
  if (record.payment_method_policy !== 'immediate') {
    return denied('unsupported_payment_method');
  }
  if (
    !Number.isSafeInteger(record.quota_limit) ||
    record.quota_limit < 0 ||
    ![0, 1].includes(record.hard_limit) ||
    (record.hard_limit === 1 && record.quota_limit === 0)
  ) {
    return unavailable('invalid_entitlement');
  }

  return {
    kind: 'customer',
    apiKeyId: record.api_key_id,
    organizationId: record.organization_id,
  };
}

// Problem 146. What a usage record may retain about the request it bills.
//
// This used to store `new URL(request.url).pathname` verbatim. On
// `GET /addresses/{addressId}` that path IS a G-NAF identifier, so the
// commercial database WOULD HAVE BEGUN accumulating, on activation, which
// addresses each organisation resolved, against their API key, with no redaction
// and no expiry. Nothing was disclosed: the channel is off and the commercial
// tables were empty when this was found. Prospective, and fixed while free. Nothing between
// authorisation and reservation validates the path either, so a caller holding
// a valid key could put anything in ANY segment, including the first.
//
// So the stored value is drawn from a CLOSED SET rather than derived from the
// path. That is the property that matters: no caller input can reach the column
// by construction, rather than by an argument about what well-behaved clients
// send. Per-request billing is unaffected. In the Worker and the health script,
// `request_path` is WRITTEN in exactly one statement — the reserve insert below
// — and READ in none: nothing there selects, filters, groups or orders by it. Stated
// as a grep result rather than a statement count, because a count is a second
// thing to get wrong and the property does not need one. It survives for
// per-endpoint accounting, which collection granularity satisfies.
//
// A path outside the set accounts as `other`, which is fail-safe for privacy
// and blind for accounting: add an entry when an endpoint is added, or new
// traffic lands in `other`. Recorded as a decision rather than left implicit.
//
// Two `indexOf` calls rather than a split. The scans are linear, not O(1) — but
// the work is a bounded scan with a small constant instead of a per-segment
// array, so a caller near Cloudflare's URL ceiling cannot buy an allocation
// proportional to what they sent. Total
// by construction — it cannot throw, which matters because `reserveUsage`
// catches into a `usage_store_unavailable` 503 that would misreport a parse
// failure as a storage fault.
export function requestRoute(pathname) {
  if (typeof pathname !== 'string' || pathname === '/' || pathname === '') {
    return 'root';
  }
  const start = pathname.charCodeAt(0) === 47 ? 1 : 0;
  const next = pathname.indexOf('/', start);
  const head = next === -1 ? pathname.slice(start) : pathname.slice(start, next);
  const rest = next === -1 ? '' : pathname.slice(next + 1);
  if (head !== 'addresses') return 'other';
  if (rest === '') return 'addresses';
  // A single further segment is the documented lookup. Anything deeper is not a
  // route this API declares, so it is not given a name that implies it is.
  return rest.indexOf('/') === -1 ? 'addresses/:id' : 'other';
}

export async function reserveUsage(environment, customer, request) {
  const id = crypto.randomUUID();
  try {
    const result = await environment.CUSTOMER_DB.prepare(RESERVE_SQL)
      .bind(
        id,
        customer.organizationId,
        customer.apiKeyId,
        requestRoute(new URL(request.url).pathname),
        new Date().toISOString(),
        customer.organizationId,
      )
      .run();
    // Zero rows means the EXISTS guard refused: the customer is at their hard
    // limit. A refusal the store handled is not a store fault, so it must not be
    // reported as one.
    if (!Number.isSafeInteger(result?.meta?.changes) || result.meta.changes < 1) {
      return { ok: false, response: problem(429, 'quota_exhausted') };
    }
    return { ok: true, id };
  } catch {
    return { ok: false, response: problem(503, 'usage_store_unavailable') };
  }
}

export async function settleUsage(environment, usageId, originStatus) {
  const billableStatuses = parseBillableStatuses(environment.BILLABLE_STATUSES);
  const statement = billableStatuses.has(originStatus)
    ? environment.CUSTOMER_DB.prepare(FINALIZE_SQL).bind(originStatus, usageId)
    : environment.CUSTOMER_DB.prepare(RELEASE_SQL).bind(usageId);

  try {
    const result = await statement.run();
    return (
      Number.isSafeInteger(result?.meta?.changes) && result.meta.changes > 0
    );
  } catch {
    return false;
  }
}

export function managedOrigins(environment) {
  try {
    const origins = JSON.parse(environment?.MANAGED_ORIGIN_URLS || '[]');
    return Array.isArray(origins)
      ? origins.filter((origin) => /^https:\/\/[^/]+\/?$/.test(origin))
      : [];
  } catch {
    return [];
  }
}

export function isManagedChannelEnabled(environment) {
  return environment?.MANAGED_CHANNEL_ENABLED === 'true';
}

export function isManagedOrganizationAllowed(environment, organizationId) {
  const value = environment?.MANAGED_ORGANIZATION_ALLOWLIST;
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const organizations = JSON.parse(value);
    return (
      Array.isArray(organizations) &&
      organizations.length > 0 &&
      organizations.length <= 16 &&
      organizations.every(
        (id) => typeof id === 'string' && /^org_[A-Za-z0-9_]{1,124}$/.test(id),
      ) &&
      organizations.includes(organizationId)
    );
  } catch {
    return false;
  }
}

export function isManagedConfigAvailable(environment) {
  return Boolean(
    isManagedChannelEnabled(environment) &&
    environment?.CUSTOMER_DB &&
    managedOrigins(environment).length > 0 &&
    environment?.ORIGIN_AUTH_HEADER &&
    environment?.ORIGIN_AUTH_VALUE &&
    parseBillableStatuses(environment?.BILLABLE_STATUSES).size > 0,
  );
}

export function directOriginRequest(request, environment, origin) {
  const inbound = new URL(request.url);
  const target = new URL(inbound.pathname + inbound.search, origin);
  const headers = new Headers(request.headers);
  headers.delete('x-addressr-api-key');
  headers.delete('authorization');
  headers.delete('x-rapidapi-key');
  headers.delete('x-rapidapi-host');
  headers.delete(environment.ORIGIN_AUTH_HEADER);
  headers.set(environment.ORIGIN_AUTH_HEADER, environment.ORIGIN_AUTH_VALUE);
  return new Request(target, {
    method: request.method,
    headers,
    body: request.body,
  });
}

export function chooseOrigin(request, origins) {
  const seed = request.headers.get('CF-Ray') || crypto.randomUUID();
  let hash = 0;
  for (const character of seed)
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return origins.at(hash % origins.length);
}

export function unavailable(code) {
  return { kind: 'rejected', response: problem(503, code) };
}

function denied(code) {
  return { kind: 'rejected', response: problem(401, code) };
}

function problem(status, code) {
  return Response.json({ error: code }, { status });
}

function parseBillableStatuses(value) {
  try {
    const statuses = JSON.parse(value || '[]');
    return new Set(
      Array.isArray(statuses)
        ? statuses.filter(
            (status) =>
              Number.isSafeInteger(status) && status >= 100 && status <= 599,
          )
        : [],
    );
  } catch {
    return new Set();
  }
}

async function keyMatches(key, record) {
  if (
    record.hash_version !== HASH_VERSION ||
    !Number.isSafeInteger(record.key_iterations) ||
    record.key_iterations < 10_000 ||
    record.key_iterations > 100_000
  ) {
    return false;
  }

  try {
    const salt = fromBase64(record.key_salt);
    const expected = fromBase64(record.key_hash);
    const actual = await deriveKeyHash(
      key,
      salt,
      record.key_iterations,
      expected.byteLength,
    );
    return equalBytes(actual, expected);
  } catch {
    return false;
  }
}

function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left.at(index) ^ right.at(index);
  }
  return difference === 0;
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.codePointAt(0));
}

async function deriveKeyHash(key, salt, iterations, byteLength) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      byteLength * 8,
    ),
  );
}

function randomToken(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary);
}
/* eslint-enable n/no-unsupported-features/node-builtins */
