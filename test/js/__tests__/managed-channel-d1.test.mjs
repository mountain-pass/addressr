import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

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
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      name: 'managed-channel-test',
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
      d1Databases: { CUSTOMER_DB: 'managed-channel-test' },
    }),
  );

  try {
    const database = await miniflare.getD1Database('CUSTOMER_DB');
    const migrated = await miniflare.dispatchFetch('http://localhost/migrate');
    assert.equal(migrated.status, 204);
    await database.exec(
      "INSERT INTO organizations VALUES ('org','clerk','stripe','now'); INSERT INTO entitlements (organization_id,stripe_subscription_id,plan_key,subscription_status,pause_collection,payment_method_policy,cancel_at_period_end,quota_limit,quota_used,quota_period,stripe_event_created,updated_at) VALUES ('org','sub','basic','active',0,'immediate',0,1,0,'2026-08',1,'now'); INSERT INTO api_keys VALUES ('key','org','default','ABCDEF123456','hash','salt',10000,'pbkdf2-sha256-v1',NULL,'now');",
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
