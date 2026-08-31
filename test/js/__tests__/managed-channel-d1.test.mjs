import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import {
  authorizeCustomer,
  createCustomerKey,
  reserveUsage,
  settleUsage,
} from '../../../apps/addressr-deployment/cloudflare-worker/customer-channel.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const migrations = path.join(
  root,
  'apps/addressr-deployment/cloudflare-worker/migrations',
);
const reserve = `
  INSERT INTO usage_records (
    id, organization_id, api_key_id, request_path, outcome, created_at
  ) VALUES (?, 'org', 'key', '/addresses', 'reserved', 'now')
`;

test('D1 atomically enforces quota and idempotency under concurrent reservations', async () => {
  const { miniflare, database } = await migratedDatabase('concurrency');

  try {
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now'); INSERT INTO entitlements (organization_id,stripe_subscription_id,plan_key,subscription_status,pause_collection,payment_method_policy,cancel_at_period_end,quota_limit,quota_used,quota_period,stripe_event_created,updated_at) VALUES ('org','sub','basic','active',0,'immediate',0,1,0,'2026-08',1,'now'); INSERT INTO api_keys VALUES ('key','org','default','ABCDEF123456','hash','salt',10000,'pbkdf2-sha256-v1',NULL,'now');",
    );

    const quotaRace = await Promise.allSettled([
      database.prepare(reserve).bind('concurrent-one').run(),
      database.prepare(reserve).bind('concurrent-two').run(),
    ]);
    assert.equal(fulfilled(quotaRace), 1);
    assert.match(rejection(quotaRace), /quota_exhausted/);
    await assertState(database, 1, 1);

    await database.exec(
      "DELETE FROM usage_records; UPDATE entitlements SET quota_limit=2, quota_used=0 WHERE organization_id='org';",
    );
    const replayRace = await Promise.allSettled([
      database.prepare(reserve).bind('same-request').run(),
      database.prepare(reserve).bind('same-request').run(),
    ]);
    assert.equal(fulfilled(replayRace), 1);
    assert.match(rejection(replayRace), /UNIQUE constraint failed/);
    await assertState(database, 1, 1);

    await database.prepare('DELETE FROM usage_records').run();
    await database.prepare(reserve).bind('refundable').run();
    await database
      .prepare("DELETE FROM usage_records WHERE id='refundable'")
      .run();
    await assertState(database, 0, 0);
  } finally {
    await miniflare.dispose();
  }
});

// eslint-disable-next-line max-lines-per-function -- one migrated D1 lifecycle proves the shared statement budget.
test('managed request outcomes stay within the indexed D1 statement envelope', async () => {
  const { miniflare, database } = await migratedDatabase('envelope');

  try {
    const key = await createCustomerKey();
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now'); INSERT INTO entitlements (organization_id,stripe_subscription_id,plan_key,subscription_status,pause_collection,payment_method_policy,cancel_at_period_end,quota_limit,quota_used,quota_period,stripe_event_created,updated_at) VALUES ('org','sub','basic','active',0,'immediate',0,10,0,'2026-08',1,'now');",
    );
    await database
      .prepare(
        `INSERT INTO api_keys (
          id, organization_id, name, prefix, key_hash, key_salt,
          key_iterations, hash_version, revoked_at, created_at
        ) VALUES ('key', 'org', 'default', ?, ?, ?, ?, ?, NULL, 'now')`,
      )
      .bind(
        key.prefix,
        key.keyHash,
        key.keySalt,
        key.keyIterations,
        key.hashVersion,
      )
      .run();

    const excluded = traceDatabase(database);
    const excludedAuthorization = await authorizeCustomer(
      requestWithKey(key.key),
      {
        CUSTOMER_DB: excluded.binding,
        MANAGED_ORGANIZATION_ALLOWLIST: '["org_other"]',
      },
    );
    assert.equal(excludedAuthorization.kind, 'rejected');
    assert.deepEqual(await excludedAuthorization.response.json(), {
      error: 'organization_not_enabled',
    });
    assert.equal(excluded.calls.length, 1);
    await assertState(database, 0, 0);

    const malformed = traceDatabase(database);
    const malformedAuthorization = await authorizeCustomer(
      requestWithKey('malformed'),
      { CUSTOMER_DB: malformed.binding },
    );
    assert.equal(malformedAuthorization.kind, 'rejected');
    assert.equal(malformed.calls.length, 0);

    const invalid = traceDatabase(database);
    const unknownKey = `addr_ffffffffffff_${'A'.repeat(43)}`;
    const invalidAuthorization = await authorizeCustomer(
      requestWithKey(unknownKey),
      { CUSTOMER_DB: invalid.binding },
    );
    assert.equal(invalidAuthorization.kind, 'rejected');
    assert.equal(invalid.calls.length, 1);

    await database
      .prepare("UPDATE api_keys SET revoked_at='now' WHERE id='key'")
      .run();
    const revoked = traceDatabase(database);
    const revokedAuthorization = await authorizeCustomer(
      requestWithKey(key.key),
      { CUSTOMER_DB: revoked.binding },
    );
    assert.equal(revokedAuthorization.kind, 'rejected');
    assert.equal(revoked.calls.length, 1);
    await database
      .prepare("UPDATE api_keys SET revoked_at=NULL WHERE id='key'")
      .run();

    await database
      .prepare(
        "UPDATE entitlements SET quota_used=quota_limit WHERE organization_id='org'",
      )
      .run();
    const exhausted = traceDatabase(database);
    const exhaustedCustomer = await authorizeCustomer(requestWithKey(key.key), {
      CUSTOMER_DB: exhausted.binding,
      MANAGED_ORGANIZATION_ALLOWLIST: '["org_clerk_addressr"]',
    });
    assert.equal(exhaustedCustomer.kind, 'customer');
    const exhaustedUsage = await reserveUsage(
      { CUSTOMER_DB: exhausted.binding },
      exhaustedCustomer,
      requestWithKey(key.key),
    );
    assert.equal(exhaustedUsage.ok, false);
    assert.equal(exhaustedUsage.response.status, 429);
    assert.equal(exhausted.calls.length, 2);

    await database
      .prepare(
        "UPDATE entitlements SET quota_used=0 WHERE organization_id='org'",
      )
      .run();
    const accepted = await exerciseAccepted(database, key.key, 200);
    assert.equal(accepted.calls.length, 3);
    assert.deepEqual(await usageState(database), {
      billable: 1,
      quotaUsed: 1,
      usageCount: 1,
    });
    const released = await exerciseAccepted(database, key.key, 404);
    assert.equal(released.calls.length, 3);
    assert.deepEqual(await usageState(database), {
      billable: 1,
      quotaUsed: 1,
      usageCount: 1,
    });

    assert.equal(
      await settleUsage(
        { CUSTOMER_DB: database, BILLABLE_STATUSES: '[200]' },
        'missing',
        200,
      ),
      false,
    );
    assert.equal(
      await settleUsage(
        { CUSTOMER_DB: failingDatabase(), BILLABLE_STATUSES: '[200]' },
        'request',
        200,
      ),
      false,
    );

    await assertIndexed(database, accepted.calls.at(0), [
      /SEARCH k USING INDEX .*prefix/i,
      /SEARCH e USING INDEX .*organization_id/i,
      /SEARCH o USING INDEX .*id/i,
    ]);
    await assertIndexed(database, accepted.calls.at(2), [
      /SEARCH usage_records USING INDEX .*id/i,
    ]);
    await assertIndexed(database, released.calls.at(2), [
      /SEARCH usage_records USING INDEX .*id/i,
    ]);
    await assertTriggerIndexed(database, 'reserve_usage_quota');
    await assertTriggerIndexed(database, 'release_usage_quota');
  } finally {
    await miniflare.dispose();
  }
});

function fulfilled(outcomes) {
  return outcomes.filter(({ status }) => status === 'fulfilled').length;
}

function rejection(outcomes) {
  return String(outcomes.find(({ status }) => status === 'rejected')?.reason);
}

async function assertState(database, quotaUsed, usageCount) {
  const entitlement = await database
    .prepare("SELECT quota_used FROM entitlements WHERE organization_id='org'")
    .first();
  const usage = await database
    .prepare('SELECT COUNT(*) AS usage_count FROM usage_records')
    .first();
  assert.equal(entitlement.quota_used, quotaUsed);
  assert.equal(usage.usage_count, usageCount);
}

async function usageState(database) {
  const entitlement = await database
    .prepare("SELECT quota_used FROM entitlements WHERE organization_id='org'")
    .first();
  const usage = await database
    .prepare(
      "SELECT COUNT(*) AS usage_count, SUM(outcome='billable') AS billable FROM usage_records",
    )
    .first();
  return {
    billable: usage.billable,
    quotaUsed: entitlement.quota_used,
    usageCount: usage.usage_count,
  };
}

async function migratedDatabase(name) {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      name: `managed-channel-${name}`,
      compatibilityDate: '2026-08-29',
      modules: [
        {
          type: 'ESModule',
          path: path.join(migrations, 'migration-worker.mjs'),
          contents: String.raw`import migration from './0001-managed-channel.sql'; export default { async fetch(_request, environment) { await environment.CUSTOMER_DB.exec(migration.replaceAll('\n', ' ')); return new Response(null, { status: 204 }); } }`,
        },
        {
          type: 'Text',
          path: path.join(migrations, '0001-managed-channel.sql'),
        },
      ],
      d1Databases: { CUSTOMER_DB: `managed-channel-${name}` },
    }),
  );
  const database = await miniflare.getD1Database('CUSTOMER_DB');
  const migrated = await miniflare.dispatchFetch('http://localhost/migrate');
  assert.equal(migrated.status, 204);
  return { miniflare, database };
}

function requestWithKey(key) {
  return new Request('https://api.addressr.io/addresses?q=17', {
    headers: { 'x-addressr-api-key': key },
  });
}

async function exerciseAccepted(database, key, originStatus) {
  const trace = traceDatabase(database);
  const customer = await authorizeCustomer(requestWithKey(key), {
    CUSTOMER_DB: trace.binding,
    MANAGED_ORGANIZATION_ALLOWLIST: '["org_clerk_addressr"]',
  });
  assert.equal(customer.kind, 'customer');
  const usage = await reserveUsage(
    { CUSTOMER_DB: trace.binding },
    customer,
    requestWithKey(key),
  );
  assert.equal(usage.ok, true);
  assert.equal(
    await settleUsage(
      {
        CUSTOMER_DB: trace.binding,
        MANAGED_ORGANIZATION_ALLOWLIST: '["org_clerk_addressr"]',
        BILLABLE_STATUSES: '[200]',
      },
      usage.id,
      originStatus,
    ),
    true,
  );
  return trace;
}

function failingDatabase() {
  return {
    prepare() {
      return {
        bind() {
          return {
            run() {
              throw new Error('D1 unavailable');
            },
          };
        },
      };
    },
  };
}

function traceDatabase(database) {
  const calls = [];
  return {
    calls,
    binding: {
      prepare(sql) {
        const call = { sql, arguments: [] };
        calls.push(call);
        return traceStatement(database.prepare(sql), call);
      },
    },
  };
}

function traceStatement(statement, call) {
  return {
    bind(...arguments_) {
      call.arguments = arguments_;
      return traceStatement(statement.bind(...arguments_), call);
    },
    first(...arguments_) {
      return statement.first(...arguments_);
    },
    run(...arguments_) {
      return statement.run(...arguments_);
    },
  };
}

async function assertIndexed(database, call, expected) {
  const plan = await database
    .prepare(`EXPLAIN QUERY PLAN ${call.sql}`)
    .bind(...call.arguments)
    .all();
  const details = plan.results.map(({ detail }) => detail).join('\n');
  assert.doesNotMatch(details, /\bSCAN\b/i);
  for (const pattern of expected) assert.match(details, pattern);
}

async function assertTriggerIndexed(database, name) {
  const trigger = await database
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=? LIMIT 1",
    )
    .bind(name)
    .first('sql');
  const update = /UPDATE[\s\S]*?;/i.exec(trigger)?.at(0);
  assert.ok(update, `${name} has an UPDATE predicate to verify`);
  await assertIndexed(
    database,
    {
      sql: update.replaceAll(/\b(?:NEW|OLD)\.organization_id\b/g, '?'),
      arguments: ['org'],
    },
    [/SEARCH entitlements USING INDEX .*organization_id/i],
  );
}
