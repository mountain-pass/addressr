// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// The behavioural suite for the acting half, against real D1 under Miniflare.
// Annotated 2026-09-06: the job's screens list gained this file the same day,
// and the link was one-directional until now.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import Stripe from 'stripe';
import {
  authorizeCustomer,
  createCustomerKey,
  RESERVE_SQL,
  reserveUsage,
  settleUsage,
} from '../../../apps/addressr-deployment/cloudflare-worker/customer-channel.mjs';
import {
  handleStripeWebhook,
  reconcileEntitlements,
} from '../../../apps/addressr-deployment/cloudflare-worker/stripe-channel.mjs';
import {
  healthQuery,
  healthFromRow,
} from '../../../scripts/managed-channel-health.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const migrations = path.join(
  root,
  'apps/addressr-deployment/cloudflare-worker/migrations',
);
// ENUMERATED, NEVER LISTED. This used to name each migration twice -- once as an
// import and once in a ternary chain picking which to apply -- so a new migration
// was applied by NO test in this file until someone remembered to edit the helper.
// A guard that silently stops covering the thing it guards is the failure this
// whole file exists to avoid, and it was one level below where anyone was looking.
// Adding 0005 now requires no edit here.
const migrationFiles = readdirSync(migrations)
  .filter((file) => file.endsWith('.sql'))
  .sort();
// The statement under test, imported rather than mirrored. A copy would let a
// change to RESERVE_SQL leave every quota assertion below passing against SQL
// that is no longer shipped.
const reserve = RESERVE_SQL.replace(
  /SELECT \?, \?, \?, \?, 'reserved', \?/,
  "SELECT ?, 'org', 'key', '/addresses', 'reserved', 'now'",
).replace(/organization_id = \?/, "organization_id = 'org'");

test('D1 atomically enforces quota and idempotency under concurrent reservations', async () => {
  const { miniflare, database } = await migratedDatabase('concurrency');

  try {
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now'); INSERT INTO entitlements (organization_id,stripe_subscription_id,plan_key,subscription_status,pause_collection,payment_method_policy,cancel_at_period_end,quota_limit,quota_used,quota_period,stripe_event_created,updated_at) VALUES ('org','sub','basic','active',0,'immediate',0,1,0,'2026-08',1,'now'); INSERT INTO api_keys VALUES ('key','org','default','ABCDEF123456','hash','salt',10000,'pbkdf2-sha256-v1',NULL,'now');",
    );

    // THIS ASSERTION INVERTED ON 2026-09-06 and the inversion is the decision, not
    // a test being fitted to new code. The quota used to be charged at RESERVE, so
    // two simultaneous reserves against a limit of one meant the second was refused
    // by a trigger. That is also why a reservation whose settle never completed
    // leaked the customer's quota permanently — problem 147.
    //
    // The count now happens at SETTLE, so a reservation costs nothing until it is
    // known billable. The leak cannot occur. The price, accepted by the maintainer
    // over a genuinely hard limit: simultaneous requests each read the pre-increment
    // count, so a hard limit can be exceeded by roughly the number in flight. Both
    // reserves below are admitted, and NEITHER has charged anything yet.
    const quotaRace = await Promise.allSettled([
      database.prepare(reserve).bind('concurrent-one').run(),
      database.prepare(reserve).bind('concurrent-two').run(),
    ]);
    assert.equal(fulfilled(quotaRace), 2, 'both in-flight reserves are admitted');
    await assertState(database, 0, 2);

    // The overshoot is bounded by concurrency and becomes visible only on settle.
    await database.exec("UPDATE usage_records SET outcome='billable';");
    await assertState(database, 2, 2);

    // And the limit still stops SEQUENTIAL requests, which is the case that governs
    // a customer working through their allowance rather than racing themselves.
    await database.exec("DELETE FROM usage_records; UPDATE entitlements SET quota_used=1 WHERE organization_id='org';");
    const sequential = await database.prepare(reserve).bind('past-limit').run();
    assert.equal(
      sequential.meta.changes,
      0,
      'a request past a hard limit was admitted; the gate is not gating',
    );
    await database.exec("UPDATE entitlements SET quota_used=0 WHERE organization_id='org';");

    await database.exec(
      "DELETE FROM usage_records; UPDATE entitlements SET quota_limit=2, quota_used=0 WHERE organization_id='org';",
    );
    const replayRace = await Promise.allSettled([
      database.prepare(reserve).bind('same-request').run(),
      database.prepare(reserve).bind('same-request').run(),
    ]);
    assert.equal(fulfilled(replayRace), 1);
    assert.match(rejection(replayRace), /UNIQUE constraint failed/);
    // Idempotency is unchanged — the primary key still rejects the replay. What
    // changed is that neither attempt charged anything: reservations are free until
    // they settle.
    await assertState(database, 0, 1);

    // A non-billable outcome used to need a refund: the reserve had charged, and
    // deleting the row gave it back. Now there is nothing to give back, which is
    // exactly why an abandoned reservation can no longer leak. Asserted on both
    // sides of the delete so a future reintroduction of charge-at-reserve reds here.
    await database.prepare('DELETE FROM usage_records').run();
    await database.prepare(reserve).bind('refundable').run();
    await assertState(database, 0, 1);
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
    assertWithinByteEnvelope(excluded, 'organisation-excluded', 1);
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
    assertWithinByteEnvelope(invalid, 'invalid-key', 1);

    await database
      .prepare("UPDATE api_keys SET revoked_at='now' WHERE id='key'")
      .run();
    const revoked = traceDatabase(database);
    const revokedAuthorization = await authorizeCustomer(
      requestWithKey(key.key),
      { CUSTOMER_DB: revoked.binding },
    );
    assert.equal(revokedAuthorization.kind, 'rejected');
    assertWithinByteEnvelope(revoked, 'revoked-key', 1);
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
    assertWithinByteEnvelope(exhausted, 'quota-exhausted', 2);

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
    assertWithinByteEnvelope(released, 'released', 3);
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
    await assertTriggerIndexed(database, 'settle_usage_quota');
    await assertTriggerIndexed(database, 'count_billable_insert');
  } finally {
    await miniflare.dispose();
  }
});

test('quota migration preserves populated state and counts soft and pay-per-use requests', async () => {
  const { miniflare, database } = await migratedDatabase('policies', 1);
  try {
    const key = await createCustomerKey();
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now'); INSERT INTO entitlements (organization_id,plan_key,subscription_status,payment_method_policy,quota_limit,quota_period,stripe_event_created,updated_at) VALUES ('org','synthetic','active','immediate',2,'period',1,'now');",
    );
    await database
      .prepare(
        "INSERT INTO api_keys VALUES ('key','org','default',?,?,?,?,?,NULL,'now')",
      )
      .bind(
        key.prefix,
        key.keyHash,
        key.keySalt,
        key.keyIterations,
        key.hashVersion,
      )
      .run();
    // Pre-0002 there is no `hard_limit` column, so the gated fixture cannot run
    // here. This phase is about the migration preserving state, not about the gate.
    await database
      .prepare(
        `INSERT INTO usage_records (id,organization_id,api_key_id,request_path,outcome,created_at)
           VALUES ('before-migration','org','key','/addresses','reserved','now')`,
      )
      .run();
    const before = await database.prepare('SELECT * FROM entitlements').first();
    await applyMigration(miniflare, 1);
    assert.deepEqual(
      await database.prepare('SELECT * FROM entitlements').first(),
      { ...before, hard_limit: 1 },
    );
    // The row inserted above was charged by 0001's reserve trigger, and 0002 carries
    // that state across. Assert it BEFORE 0003 lands, because 0003 is what stops
    // reservations charging and the migration must preserve what was already counted.
    await assertState(database, 1, 1);

    await applyMigration(miniflare, 2);
    // 0003 must not disturb a count already taken — a customer mid-period does not
    // get their allowance back because we changed when we count.
    await assertState(database, 1, 1);

    // Under 0003 both simultaneous reserves are admitted against the remaining
    // allowance of one: the overshoot the maintainer accepted on 2026-09-06 in
    // exchange for reservations no longer leaking quota when they fail to settle.
    const race = await Promise.allSettled([
      database.prepare(reserve).bind('hard-one').run(),
      database.prepare(reserve).bind('hard-two').run(),
    ]);
    assert.equal(fulfilled(race), 2);
    await assertState(database, 1, 3);
    await database.exec('DELETE FROM usage_records');
    await assertState(database, 1, 0);
    await database.exec(
      "UPDATE entitlements SET quota_used=0 WHERE organization_id='org'",
    );

    for (const allowance of [1, 0]) {
      await database
        .prepare('UPDATE entitlements SET hard_limit=0, quota_limit=?')
        .bind(allowance)
        .run();
      const accepted = await Promise.all([
        exerciseAccepted(database, key.key, 200),
        exerciseAccepted(database, key.key, 200),
        exerciseAccepted(database, key.key, 200),
      ]);
      for (const trace of accepted) {
        // Was `calls[0].responseBytes <= 4096`, which checked the first statement of
        // three and let the other two through unmeasured. The statement count now
        // travels inside the envelope assertion rather than beside it.
        assertWithinByteEnvelope(trace, 'accepted', 3);
      }
      await assertState(database, 3, 3);
      await exerciseAccepted(database, key.key, 404);
      await assertState(database, 3, 3);
      // A bare reserve with no settle: the row lands, the count does not move.
      // Under charge-at-reserve this read (4, 4); it is now (3, 4), and that gap is
      // precisely the quota that used to be lost when a settle never arrived.
      await database.prepare(reserve).bind('duplicate').run();
      await assert.rejects(
        database.prepare(reserve).bind('duplicate').run(),
        /UNIQUE/,
      );
      await assertState(database, 3, 4);
      await database.exec(
        'DELETE FROM usage_records; UPDATE entitlements SET quota_used=0',
      );
    }
    await assert.rejects(
      database.exec('UPDATE entitlements SET hard_limit=1'),
      /CHECK/,
    );
    await assert.rejects(
      database.exec('UPDATE entitlements SET hard_limit=2'),
      /CHECK/,
    );
    await assertTriggerIndexed(database, 'settle_usage_quota');
    await assertTriggerIndexed(database, 'count_billable_insert');
  } finally {
    await miniflare.dispose();
  }
});

test('subscription projection persists explicit policy and preserves usage on replay and resets on period rollover', async () => {
  const { miniflare, database } = await migratedDatabase('projection');
  try {
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now')",
    );
    const subscription = {
      id: 'sub_synthetic',
      customer: 'stripe',
      status: 'active',
      metadata: {
        addressr_organization_id: 'org',
        addressr_plan_key: 'synthetic',
        addressr_payment_method_policy: 'immediate',
      },
      payment_settings: { payment_method_types: ['card'] },
      items: {
        data: [{ price: { id: 'price_synthetic' }, current_period_start: 100 }],
      },
    };
    let eventId = 'evt_first';
    const stripe = {
      webhooks: {
        async constructEventAsync() {
          return {
            id: eventId,
            type: 'customer.subscription.updated',
            created: 200,
            data: { object: { id: subscription.id } },
          };
        },
      },
      subscriptions: {
        async retrieve() {
          return subscription;
        },
      },
    };
    const environment = {
      CUSTOMER_DB: database,
      STRIPE_WEBHOOK_SECRET: 'synthetic',
      STRIPE_PAYMENT_METHOD_TYPES: '["card"]',
      STRIPE_PLAN_CATALOGUE: JSON.stringify({
        synthetic: { priceId: 'price_synthetic', quota: 0, hardLimit: false },
      }),
    };
    const project = async () => {
      const response = await handleStripeWebhook(
        new Request('https://api.addressr.io/managed/stripe-webhook', {
          method: 'POST',
          body: '{}',
        }),
        environment,
        stripe,
      );
      assert.equal(response.status, 200);
      return response.json();
    };
    await project();
    let entitlement = await database
      .prepare('SELECT * FROM entitlements')
      .first();
    assert.equal(entitlement.quota_limit, 0);
    assert.equal(entitlement.hard_limit, 0);
    await database.exec('UPDATE entitlements SET quota_used=7');
    assert.deepEqual(await project(), {
      received: true,
      duplicate: true,
    });
    entitlement = await database.prepare('SELECT * FROM entitlements').first();
    assert.equal(entitlement.quota_used, 7);
    eventId = 'evt_same_period';
    environment.STRIPE_PLAN_CATALOGUE = JSON.stringify({
      synthetic: { priceId: 'price_synthetic', quota: 2, hardLimit: false },
    });
    await project();
    entitlement = await database.prepare('SELECT * FROM entitlements').first();
    assert.equal(entitlement.quota_used, 7);
    assert.equal(entitlement.quota_limit, 2);
    eventId = 'evt_next_period';
    subscription.items.data[0].current_period_start = 300;
    await project();
    entitlement = await database.prepare('SELECT * FROM entitlements').first();
    assert.equal(entitlement.quota_used, 0);
    assert.equal(entitlement.quota_period, '300');
    eventId = 'evt_missing_policy';
    environment.STRIPE_PLAN_CATALOGUE = JSON.stringify({
      synthetic: { priceId: 'price_synthetic', quota: 2 },
    });
    await project();
    entitlement = await database.prepare('SELECT * FROM entitlements').first();
    assert.equal(entitlement.payment_method_policy, 'unsupported');
    assert.equal(entitlement.hard_limit, 1);
  } finally {
    await miniflare.dispose();
  }
});

test('repeated reconciliation repairs policy while preserving usage and ownership', async () => {
  const { miniflare, database } = await migratedDatabase('repeated-repair');
  try {
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now');",
    );
    const subscription = {
      id: 'sub_synthetic',
      customer: 'stripe',
      status: 'active',
      metadata: {
        addressr_organization_id: 'org',
        addressr_plan_key: 'synthetic',
        addressr_payment_method_policy: 'immediate',
      },
      payment_settings: { payment_method_types: ['card'] },
      items: {
        data: [{ price: { id: 'price_synthetic' }, current_period_start: 100 }],
      },
    };
    const stripe = {
      subscriptions: {
        async list() {
          return { data: [subscription] };
        },
      },
    };
    const environment = {
      CUSTOMER_DB: database,
      STRIPE_PAYMENT_METHOD_TYPES: '["card"]',
      STRIPE_PLAN_CATALOGUE: JSON.stringify({
        synthetic: { priceId: 'price_synthetic', quota: 2, hardLimit: true },
      }),
    };
    const repair = () => reconcileEntitlements(environment, stripe);
    const success = { checked: 1, repaired: 1, errors: 0 };
    assert.deepEqual(await repair(), success);
    await database.exec('UPDATE entitlements SET quota_used=2');
    environment.STRIPE_PLAN_CATALOGUE = JSON.stringify({
      synthetic: { priceId: 'price_synthetic', quota: 0, hardLimit: false },
    });
    assert.deepEqual(await Promise.all([repair(), repair()]), [
      success,
      success,
    ]);
    const repaired = await database
      .prepare('SELECT * FROM entitlements')
      .first();
    assert.equal(repaired.quota_limit, 0);
    assert.equal(repaired.hard_limit, 0);
    assert.equal(repaired.quota_used, 2);
    assert.equal(repaired.payment_method_policy, 'immediate');
    const ledger = await database
      .prepare('SELECT COUNT(*) AS count FROM stripe_events')
      .first();
    assert.equal(ledger.count, 1);
    subscription.customer = 'stripe_other';
    assert.deepEqual(await repair(), { checked: 1, repaired: 0, errors: 1 });
    assert.deepEqual(
      await database.prepare('SELECT * FROM entitlements').first(),
      repaired,
    );
  } finally {
    await miniflare.dispose();
  }
});

test('meter health observes real migrated D1 without exposing workload or changing state', async () => {
  const { miniflare, database } = await migratedDatabase('health');
  const now = new Date('2026-08-31T10:10:00Z');
  const query = healthQuery(now);
  const observe = async () =>
    healthFromRow(
      await database
        .prepare(query.sql)
        .bind(...query.params)
        .first(),
      now,
    );
  try {
    const empty = await observe();
    assert.equal(empty.status, 'observed');
    assert.deepEqual(empty.limitations, [
      'workload_and_provider_parity_unverified',
    ]);
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now'); INSERT INTO entitlements (organization_id,plan_key,subscription_status,payment_method_policy,quota_limit,quota_used,quota_period,stripe_event_created,updated_at) VALUES ('org','synthetic','active','immediate',10,0,'period',1,'now'); INSERT INTO api_keys VALUES ('key','org','default','ABCDEF123456','hash','salt',10000,'pbkdf2-sha256-v1',NULL,'now');",
    );
    await database
      .prepare(
        "INSERT INTO usage_records (id,organization_id,api_key_id,request_path,outcome,created_at) VALUES ('usage','org','key','/addresses','billable',?)",
      )
      .bind('2026-08-31T09:30:00.000Z')
      .run();
    assert.deepEqual(
      await observe(),
      empty,
      'recent pending usage is not overdue or public workload evidence',
    );
    await database.exec(
      "UPDATE usage_records SET created_at='2026-08-31T08:30:00.000Z',meter_attempts=12",
    );
    const failedDelivery = await observe();
    assert.deepEqual(failedDelivery.findings, [
      'delivery_exhausted',
      'delivery_overdue',
      'reconciliation_missing',
    ]);
    await database.exec(
      "UPDATE usage_records SET meter_state='delivered'; INSERT INTO meter_reconciliations (organization_id,window_start,window_end,expected_count,delivered_count,rejected_count,provider_count,state,checked_at,error_code) VALUES ('org','2026-08-31T08:00:00.000Z','2026-08-31T09:00:00.000Z',1,1,0,1,'matched','now',NULL);",
    );
    assert.deepEqual(
      await observe(),
      empty,
      'empty and reconciled databases have equivalent public reports',
    );
    for (const state of ['pending', 'rejected', 'mismatched', 'error']) {
      await database
        .prepare('UPDATE meter_reconciliations SET state=?')
        .bind(state)
        .run();
      const failedReconciliation = await observe();
      assert.deepEqual(failedReconciliation.findings, [
        state === 'pending'
          ? 'reconciliation_pending'
          : 'reconciliation_failed',
      ]);
    }
    const entitlement = await database
      .prepare('SELECT quota_used FROM entitlements')
      .first();
    const usage = await database
      .prepare('SELECT meter_attempts FROM usage_records')
      .first();
    assert.equal(entitlement.quota_used, 1);
    assert.equal(usage.meter_attempts, 12);
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

test('the unmeterable marker migrates additively and is safe against the deployed Worker', async () => {
  // ADR-092 excludes a request served past a hard cap from metering. That needs a
  // marker column WRITTEN at settle, and ADR-093 says the Worker deploys BEFORE its
  // migrations apply — so this migration must be safe against the Worker already
  // running, which is the one in this repository, since the release carrying this
  // migration changes no Worker code. That is what the second half of this test
  // exercises, and it is the half that would have caught the real failure: a Worker
  // naming a column the schema lacks fails into settleUsage's catch and answers
  // usage_store_unavailable on requests the origin already served.
  const { miniflare, database } = await migratedDatabase('unmeterable');

  try {
    const usageColumns = await database
      .prepare('PRAGMA table_info(usage_records)')
      .all();
    const reason = usageColumns.results.find(
      (column) => column.name === 'unmeterable_reason',
    );
    assert.ok(reason, 'usage_records carries the exclusion reason');
    // A reason code rather than a boolean, so a second exclusion class never needs
    // a second widening — and NOT NULL DEFAULT 0 is what makes the ALTER additive
    // under ADR-093 and safe against a Worker that does not name the column.
    assert.equal(reason.type, 'INTEGER');
    assert.equal(reason.notnull, 1, 'the marker is NOT NULL');
    assert.equal(reason.dflt_value, '0', 'and defaults to meterable');

    const reconciliationColumns = await database
      .prepare('PRAGMA table_info(meter_reconciliations)')
      .all();
    const excluded = reconciliationColumns.results.find(
      (column) => column.name === 'unmeterable_count',
    );
    assert.ok(excluded, 'meter_reconciliations carries the unmeterable count');
    assert.equal(excluded.type, 'INTEGER');
    assert.equal(excluded.notnull, 1);
    assert.equal(excluded.dflt_value, '0');

    // The deployed Worker's own request path, unchanged, against the migrated
    // schema. Reserve and settle both name their columns explicitly, so neither
    // sees the new one.
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now'); INSERT INTO entitlements (organization_id,stripe_subscription_id,plan_key,subscription_status,pause_collection,payment_method_policy,cancel_at_period_end,quota_limit,quota_used,quota_period,stripe_event_created,updated_at) VALUES ('org','sub','basic','active',0,'immediate',0,100,0,'2026-08',1,'now');",
    );
    const created = await createCustomerKey();
    await database
      .prepare(
        `INSERT INTO api_keys (
          id, organization_id, name, prefix, key_hash, key_salt,
          key_iterations, hash_version, revoked_at, created_at
        ) VALUES ('key', 'org', 'default', ?, ?, ?, ?, ?, NULL, 'now')`,
      )
      .bind(
        created.prefix,
        created.keyHash,
        created.keySalt,
        created.keyIterations,
        created.hashVersion,
      )
      .run();

    await exerciseAccepted(database, created.key, 200);
    await assertState(database, 1, 1);

    // And the migration alone excludes nothing: every existing row stays meterable,
    // so the schema change on its own cannot stop a request being billed. Without
    // this the migration could silently switch billing off a release early.
    const settled = await database
      .prepare(
        "SELECT outcome, meter_state, unmeterable_reason FROM usage_records",
      )
      .all();
    assert.deepEqual(
      settled.results.map((row) => [
        row.outcome,
        row.meter_state,
        row.unmeterable_reason,
      ]),
      [['billable', 'pending', 0]],
    );
  } finally {
    await miniflare.dispose();
  }
});

test('a GENUINELY SIGNED webhook projects into real D1, and the stored values are read back', async () => {
  // THE SEGMENT NOTHING HAD EXERCISED. Verification and projection have each been
  // proved, and never on one path. The production probes used a real signature but
  // terminated at `ignored: true`, BEFORE any projection write. Every projection test
  // stubs `constructEventAsync`, so everything downstream of verification has only
  // ever run behind a stub. This drives real HMAC verification, over a real migrated
  // schema, through to a write it then READS BACK.
  //
  // Only `subscriptions.retrieve` is stubbed, because that is a network call to
  // Stripe. `stripe.webhooks` is the real thing: real signature parsing, real
  // timestamp tolerance, real SubtleCrypto provider.
  const { miniflare, database } = await migratedDatabase('signed-projection');
  const secret = 'whsec_synthetic_not_a_real_secret';
  const stripeClient = new Stripe('sk_test_synthetic_not_a_real_key');

  try {
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now')",
    );
    const subscription = {
      id: 'sub_synthetic',
      customer: 'stripe',
      status: 'active',
      metadata: {
        addressr_organization_id: 'org',
        addressr_plan_key: 'synthetic',
        addressr_payment_method_policy: 'immediate',
      },
      payment_settings: { payment_method_types: ['card'] },
      items: {
        data: [{ price: { id: 'price_synthetic' }, current_period_start: 100 }],
      },
    };
    const stripe = {
      webhooks: stripeClient.webhooks,
      subscriptions: {
        async retrieve() {
          return subscription;
        },
      },
    };
    const environment = {
      CUSTOMER_DB: database,
      STRIPE_WEBHOOK_SECRET: secret,
      STRIPE_PAYMENT_METHOD_TYPES: '["card"]',
      STRIPE_PLAN_CATALOGUE: JSON.stringify({
        synthetic: { priceId: 'price_synthetic', quota: 0, hardLimit: false },
      }),
    };

    // Signed the way Stripe signs, by Stripe's own helper, so the bytes the handler
    // verifies are bytes Stripe would have produced.
    const deliver = async (event, signingSecret = environment.STRIPE_WEBHOOK_SECRET) => {
      const payload = JSON.stringify(event);
      const signature = stripeClient.webhooks.generateTestHeaderString({
        payload,
        secret: signingSecret,
      });
      const response = await handleStripeWebhook(
        new Request('https://api.addressr.io/managed/stripe-webhook', {
          method: 'POST',
          headers: { 'stripe-signature': signature },
          body: payload,
        }),
        environment,
        stripe,
      );
      return { status: response.status, body: await response.json() };
    };
    const event = (id, created, type = 'customer.subscription.updated') => ({
      id,
      type,
      created,
      data: { object: { id: subscription.id } },
    });

    // A WRONG SIGNATURE IS REFUSED BY REAL CRYPTO, not by a stub deciding to throw.
    // Without this the rest could pass against a handler that never verified at all.
    const unsigned = await handleStripeWebhook(
      new Request('https://api.addressr.io/managed/stripe-webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=deadbeef' },
        body: JSON.stringify(event('evt_forged', 1000)),
      }),
      environment,
      stripe,
    );
    assert.equal(unsigned.status, 400);
    assert.deepEqual(await unsigned.json(), {
      error: 'invalid_webhook_signature',
    });
    assert.equal(
      (await database.prepare('SELECT COUNT(*) AS n FROM stripe_events').first())
        .n,
      0,
      'a forged signature reached the store',
    );

    // VERIFIED, PROJECTED, AND READ BACK OUT OF D1.
    assert.deepEqual(await deliver(event('evt_newer', 2000)), {
      status: 200,
      body: { received: true, duplicate: false },
    });
    const projected = await database
      .prepare('SELECT * FROM entitlements')
      .first();
    assert.equal(projected.organization_id, 'org');
    assert.equal(projected.subscription_status, 'active');
    assert.equal(projected.stripe_event_created, 2000);

    // REORDERING, ASSERTED ON THE STORED WATERMARK rather than on the SQL text. The
    // existing cases regex the ON CONFLICT clause against a fake that executes no SQL,
    // so they pass whatever the database would actually have done.
    subscription.status = 'past_due';
    assert.equal((await deliver(event('evt_older', 1000))).status, 200);
    const afterLate = await database
      .prepare('SELECT * FROM entitlements')
      .first();
    assert.equal(
      afterLate.stripe_event_created,
      2000,
      'a late event rolled the stored watermark backwards',
    );

    // DEDUPLICATION AGAINST THE REAL PRIMARY KEY. The existing case throws a string
    // modelled on the matcher the handler greps for, so it proves the catch responds
    // to the fake rather than that the fake is what D1 raises.
    assert.deepEqual(await deliver(event('evt_newer', 2000)), {
      status: 200,
      body: { received: true, duplicate: true },
    });
    assert.equal(
      (await database.prepare('SELECT COUNT(*) AS n FROM stripe_events').first())
        .n,
      2,
      'the replay stored a third event row',
    );

    // ROTATION. The ledger has carried "rotation remains untested" since this row was
    // written, and it is the one item on it that never needed activation: a rotation is
    // a change of the configured secret, and what must hold across one is that events
    // signed with the RETIRED secret stop being accepted while events signed with the
    // new one start. Both directions are checkable here, on the same real HMAC path.
    //
    // Scoped honestly: this proves the VERIFICATION BEHAVIOUR a rotation depends on. It
    // does not rehearse the operational rotation itself, which is a Terraform change and
    // an apply against the live destination, and which the ledger still records as owed.
    const rotated = 'whsec_rotated_synthetic_not_a_real_secret';
    const retired = environment.STRIPE_WEBHOOK_SECRET;
    environment.STRIPE_WEBHOOK_SECRET = rotated;

    const staleSignature = await deliver(event('evt_stale', 3000), retired);
    assert.equal(staleSignature.status, 400);
    assert.deepEqual(staleSignature.body, {
      error: 'invalid_webhook_signature',
    });
    assert.equal(
      (await database.prepare('SELECT COUNT(*) AS n FROM stripe_events').first())
        .n,
      2,
      'an event signed with the retired secret was stored after rotation',
    );

    assert.deepEqual(await deliver(event('evt_rotated', 3000)), {
      status: 200,
      body: { received: true, duplicate: false },
    });
    assert.equal(
      (
        await database
          .prepare("SELECT COUNT(*) AS n FROM stripe_events WHERE id='evt_rotated'")
          .first()
      ).n,
      1,
      'an event signed with the new secret was not accepted after rotation',
    );

    // RECOVERY EXHAUSTED, the third of the three event classes the launch goal names
    // and the only one still resting on a fake. The existing case in
    // `stripe-channel.test.mjs` stubs `constructEventAsync` and asserts against a
    // fake exposing `batchStatements` that executes no SQL, so it pins what the
    // handler INTENDED to write. This drives real HMAC into the real schema and reads
    // the result back, the way the duplicate and reordering legs above already do.
    //
    // WHAT IT DOES NOT REACH, because the name invites the stronger reading:
    // `subscriptions.retrieve` returns a literal whose status is set by hand here, so
    // this proves that GIVEN Stripe reports a canceled subscription the projection and
    // the request path behave. It proves NOTHING about whether the shared account's
    // three custom retries actually terminate in `canceled`. That is ADR-087's Test
    // Clock criterion and it is still owed. The retrieve-after-delete premise — that
    // retrieving a just-deleted subscription succeeds rather than throwing into the
    // 503 branch — is ASSUMED here exactly as the ledger records it assumed.
    const customerKey = await createCustomerKey();
    await database
      .prepare(
        `INSERT INTO api_keys (
          id, organization_id, name, prefix, key_hash, key_salt,
          key_iterations, hash_version, revoked_at, created_at
        ) VALUES ('key', 'org', 'default', ?, ?, ?, ?, ?, NULL, 'now')`,
      )
      .bind(
        customerKey.prefix,
        customerKey.keyHash,
        customerKey.keySalt,
        customerKey.keyIterations,
        customerKey.hashVersion,
      )
      .run();

    // A SEPARATE ENVIRONMENT. The shared one above is a precise statement of what the
    // WEBHOOK path needs; the request path needs the organisation allowlist, and
    // adding it there would blur that.
    const requestEnvironment = {
      CUSTOMER_DB: database,
      MANAGED_ORGANIZATION_ALLOWLIST: '["org_clerk_addressr"]',
    };

    // THE PRE-STATE IS ASSERTED, NOT INHERITED. It is `past_due` only because the
    // reordering leg above set it and the rotation leg re-projected it. If someone
    // changes that block, this must red rather than silently becoming a tautology --
    // an allowed status here is what makes the deny below a DIFFERENTIAL across the
    // projection rather than a state assertion that could be true by fixture accident.
    const beforeStatus = await database
      .prepare("SELECT subscription_status FROM entitlements WHERE organization_id='org'")
      .first();
    assert.equal(
      beforeStatus.subscription_status,
      'past_due',
      'the pre-state is not an allowed status, so the deny below proves nothing',
    );
    const servedBefore = traceDatabase(database);
    const beforeAuthorization = await authorizeCustomer(
      requestWithKey(customerKey.key),
      { ...requestEnvironment, CUSTOMER_DB: servedBefore.binding },
    );
    assert.equal(
      beforeAuthorization.kind,
      'customer',
      'the customer was already refused before recovery was exhausted',
    );

    subscription.status = 'canceled';
    assert.deepEqual(
      await deliver(
        event('evt_recovery_exhausted', 4000, 'customer.subscription.deleted'),
      ),
      { status: 200, body: { received: true, duplicate: false } },
    );

    // THE EVENT TYPE IS ASSERTED because nothing in the path depends on it:
    // `subscriptionIdFrom` accepts any `customer.subscription.*` identically and the
    // projection reads status from `retrieve`, never from the event. Without this read
    // the leg would pass byte-identically with `customer.subscription.updated` and its
    // name would be a lie.
    const stored = await database
      .prepare(
        "SELECT event_type, event_created FROM stripe_events WHERE id='evt_recovery_exhausted'",
      )
      .first();
    assert.equal(stored.event_type, 'customer.subscription.deleted');

    const afterTerminal = await database
      .prepare('SELECT * FROM entitlements')
      .first();
    assert.equal(
      afterTerminal.subscription_status,
      'canceled',
      'the terminal event did not project the terminal state',
    );
    // The watermark ADVANCED on a newer real event, which is the complement of the
    // did-not-regress assertion above and is the first time either is checked against
    // a real store rather than against SQL text. NOT a recency guard: the upsert
    // writes every other column from `excluded` unconditionally, so the status would
    // read `canceled` whatever `created` carried.
    assert.equal(afterTerminal.stripe_event_created, 4000);

    // AND ACCESS ACTUALLY STOPS. Without this the leg proves a row changed value and
    // nothing about whether a customer is still served. The REASON is asserted, not
    // just the refusal: a bare deny also passes on `invalid_key`,
    // `organization_not_enabled` and `invalid_entitlement`, and an earlier draft of
    // this leg denied on `organization_not_enabled` for want of the allowlist above --
    // green, and proving nothing.
    const servedAfter = traceDatabase(database);
    const afterAuthorization = await authorizeCustomer(
      requestWithKey(customerKey.key),
      { ...requestEnvironment, CUSTOMER_DB: servedAfter.binding },
    );
    assert.equal(afterAuthorization.kind, 'rejected');
    assert.deepEqual(await afterAuthorization.response.json(), {
      error: 'subscription_inactive',
    });
    // ADR-080's envelope, for an outcome that had none anywhere in the suite. This is
    // the first place the `subscription_inactive` path executes.
    assertWithinByteEnvelope(servedAfter, 'subscription-inactive', 1);
  } finally {
    await miniflare.dispose();
  }
});

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

// Problem 146. The adversarial launch review of 2026-09-06 found that every
// authorised managed request persisted `new URL(request.url).pathname` into
// `usage_records.request_path`, and that `GET /addresses/{addressId}` carries a
// G-NAF identifier in its path. So on activation the commercial database would
// have begun accumulating which addresses each organisation resolved, keyed to
// their API key —  nothing was disclosed, the channel being off and the tables
// empty when this was found,
// with no redaction and no expiry.
//
// This asserts the property that actually matters — the identifier does not
// reach the row — rather than asserting a particular replacement string, so a
// future change of representation does not have to change the test to stay
// honest. The search endpoint is included because its query string was never
// stored and must not start being.
test('a single-address lookup does not persist the address identifier', async () => {
  const { miniflare, database } = await migratedDatabase('retention');

  try {
    await database.exec(
      "INSERT INTO organizations VALUES ('org','org_clerk_addressr','stripe','now'); INSERT INTO entitlements (organization_id,stripe_subscription_id,plan_key,subscription_status,pause_collection,payment_method_policy,cancel_at_period_end,quota_limit,quota_used,quota_period,stripe_event_created,updated_at) VALUES ('org','sub','basic','active',0,'immediate',0,100,0,'2026-08',1,'now'); INSERT INTO api_keys VALUES ('key','org','default','ABCDEF123456','hash','salt',10000,'pbkdf2-sha256-v1',NULL,'now');",
    );

    const customer = { organizationId: 'org', apiKeyId: 'key' };
    const identifier = 'GAACT714845933';

    const lookup = await reserveUsage(
      { CUSTOMER_DB: database },
      customer,
      new Request(`https://api.addressr.io/addresses/${identifier}`),
    );
    assert.equal(lookup.ok, true, 'the reservation itself must still succeed');

    const search = await reserveUsage(
      { CUSTOMER_DB: database },
      customer,
      new Request('https://api.addressr.io/addresses?q=17+george+st'),
    );
    assert.equal(search.ok, true);

    // THE CASE THAT BREAKS A FIRST-SEGMENT RULE. Nothing between authorisation
    // and reservation validates the path, so a caller holding a valid key can
    // put anything in the FIRST segment too. A normaliser that keeps segment
    // one verbatim retains the identifier here while passing every routed case
    // above — which is a test certifying a property the code does not hold.
    const unrouted = await reserveUsage(
      { CUSTOMER_DB: database },
      customer,
      new Request(`https://api.addressr.io/${identifier}`),
    );
    assert.equal(unrouted.ok, true);

    // And a deep path, so the rule cannot be "first two segments".
    const deep = await reserveUsage(
      { CUSTOMER_DB: database },
      customer,
      new Request(`https://api.addressr.io/a/b/${identifier}/d`),
    );
    assert.equal(deep.ok, true);

    // Read each reservation back BY ITS OWN ID. Do not order by `id` instead: it
    // is `crypto.randomUUID()`, so the lookup-versus-search assertion below would
    // compare two arbitrary rows and fail on correct code about one run in six —
    // two of the four stored values are `other`, so (2/4)(1/3).
    const pathOf = async (id) =>
      (
        await database
          .prepare('SELECT request_path FROM usage_records WHERE id = ?')
          .bind(id)
          .first()
      ).request_path;
    const storedLookup = await pathOf(lookup.id);
    const storedSearch = await pathOf(search.id);
    const stored = [
      storedLookup,
      storedSearch,
      await pathOf(unrouted.id),
      await pathOf(deep.id),
    ];

    for (const value of stored) {
      assert.doesNotMatch(
        value,
        new RegExp(identifier),
        `usage_records retained the address identifier: ${value}. That is which ` +
          'address this organisation resolved, kept against their API key.',
      );
      assert.doesNotMatch(
        value,
        /george|17\+/i,
        `usage_records retained the search term: ${value}`,
      );
    }

    // Retaining nothing at all would break per-endpoint accounting, so the row
    // must still say WHICH endpoint was called. Asserted as a distinction the
    // two calls make, not as a literal, so the representation stays free.
    assert.equal(stored.length, 4);
    // Accounting must still distinguish a lookup from a search; asserted as a
    // distinction rather than as literals, so the representation stays free.
    assert.notEqual(
      storedLookup,
      storedSearch,
      'a lookup and a search now record identically — per-endpoint accounting is gone',
    );
    // Every stored value must come from a bounded set, which is the property
    // that makes caller input unable to reach the column at all. Asserted by
    // cardinality over a caller who supplied four different paths.
    assert.ok(
      new Set(stored).size <= 3,
      `stored values are not drawn from a bounded set: ${JSON.stringify(stored)}`,
    );
  } finally {
    await miniflare.dispose();
  }
});

// `through` is how many migrations to apply, oldest first. Defaulting to all of
// them is what makes a new migration covered by every caller automatically.
async function migratedDatabase(name, through = migrationFiles.length) {
  assert.ok(
    migrationFiles.length > 0,
    'no migrations were enumerated, so every assertion in this file would run ' +
      'against an empty database and pass having checked nothing',
  );
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      name: `managed-channel-${name}`,
      compatibilityDate: '2026-08-29',
      modules: [
        {
          type: 'ESModule',
          path: path.join(migrations, 'migration-worker.mjs'),
          contents: `${migrationFiles
            .map((file, index) => `import m${index} from './${file}';`)
            .join(' ')} const all = [${migrationFiles
            .map((_, index) => `m${index}`)
            .join(',')}]; export default { async fetch(request, environment) { const index = Number(new URL(request.url).pathname.slice(1)); await environment.CUSTOMER_DB.exec(all[index].replaceAll('\\n', ' ')); return new Response(null, { status: 204 }); } }`,
        },
        ...migrationFiles.map((file) => ({
          type: 'Text',
          path: path.join(migrations, file),
        })),
      ],
      d1Databases: { CUSTOMER_DB: `managed-channel-${name}` },
    }),
  );
  const database = await miniflare.getD1Database('CUSTOMER_DB');
  for (let index = 0; index < through; index += 1) {
    await applyMigration(miniflare, index);
  }
  return { miniflare, database };
}

async function applyMigration(miniflare, index) {
  const applied = await miniflare.dispatchFetch(`http://localhost/${index}`);
  assert.equal(
    applied.status,
    204,
    `${migrationFiles[index]} did not apply: ${await applied.text()}`,
  );
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

// ADR-080 caps an OUTCOME at three statements AND 4 KiB of D1 response data. The
// statement half was asserted for every outcome; the byte half was asserted on ONE
// call of ONE outcome, so four outcomes had their bytes measured and discarded and
// the fifth was checked one statement deep. A number recorded and never read is the
// shape this file exists to refuse, and it was doing it to itself.
//
// Summed across the outcome, because that is what the decision caps. Per statement it
// would pass three 4 KiB reads.
const D1_RESPONSE_BYTE_CAP = 4096;

// A PROXY, AND NAMED ONE. ADR-080 criterion 1 says "D1 metadata reports statements,
// rows read and written, and RESPONSE BYTES for the exercised path". Measured
// 2026-09-19, D1 metadata reports `served_by`, `duration`, `changes`, `last_row_id`,
// `changed_db`, `size_after`, `rows_read` and `rows_written` -- and NO response-byte
// field. `size_after` is the database file size, not the response. So the provider does
// not report the figure the criterion names, and this serialises the result instead.
//
// Two ways it is not the thing: `.first()` serialises the row alone while `.run()` and
// `.all()` serialise the whole D1Result including its meta, so the six outcomes are not
// on one basis; and Miniflare is a local emulator, so there is no wire to measure. The
// direction is conservative -- it over-counts, so it cannot produce a false pass -- and
// that is the only reason it is usable as a cap at all.
function measureBytes(result) {
  return new TextEncoder().encode(JSON.stringify(result ?? null)).byteLength;
}

// ADR-080 criterion 1 asks that D1 metadata REPORT statements, rows read and written,
// and response bytes. Statements are the call count. Response bytes it does not report
// at all, hence the proxy above. Rows read and written it DOES report, so this asserts
// they arrive from the provider for every call that can carry them.
//
// It asserts REPORTING, not a ceiling: ADR-080 caps statements and bytes, and puts no
// bound on rows. An invented row ceiling would be a rule nobody decided.
//
// An earlier version of this pass DEFINED this and never called it, while the ledger
// and the comment above it both claimed criterion 1's other half "rests on the
// provider". That is the recorded-and-never-read shape the comment fifteen lines up
// declares this file exists to refuse, committed forty lines from the condemnation.
// Caught by risk review.
function assertProviderReported(trace, outcome) {
  const unreported = trace.calls
    .filter((call) => call.providerCounters !== 'unreachable-via-first')
    .filter(
      (call) =>
        typeof call.providerCounters?.rowsRead !== 'number' ||
        typeof call.providerCounters?.rowsWritten !== 'number',
    );
  assert.deepEqual(
    unreported.map((call) => call.sql),
    [],
    `the ${outcome} outcome ran statements for which D1 reported no rows_read/rows_written, so criterion 1's provider half is unevidenced there`,
  );
}

function assertWithinByteEnvelope(
  trace,
  outcome,
  expectedStatements,
  cap = D1_RESPONSE_BYTE_CAP,
) {
  // The call count travels WITH the envelope rather than beside it. Without this an
  // outcome that made no D1 calls passes every assertion below trivially.
  assert.equal(
    trace.calls.length,
    expectedStatements,
    `the ${outcome} outcome ran ${trace.calls.length} D1 statements, not ${expectedStatements}`,
  );
  assert.ok(
    expectedStatements <= 3,
    `ADR-080 caps an outcome at three statements and ${outcome} expects ${expectedStatements}`,
  );
  // THE FLOOR. Every traced call must have been measured, or the sum below is a sum
  // over silence. Without this the cap passes hardest on the outcomes it measured
  // least, which is the failure this assertion was itself committing until the cap
  // was mutated to zero.
  const unmeasured = trace.calls.filter(
    (call) => typeof call.responseBytes !== 'number',
  );
  assert.deepEqual(
    unmeasured.map((call) => call.sql),
    [],
    `the ${outcome} outcome ran statements whose response bytes were never measured, so its envelope is a sum over silence`,
  );
  assertProviderReported(trace, outcome);
  const total = trace.calls.reduce((sum, call) => sum + call.responseBytes, 0);
  assert.ok(
    total <= cap,
    `the ${outcome} outcome received ${total} bytes of D1 response data, over ${cap}`,
  );
  return total;
}

function traceStatement(statement, call) {
  return {
    bind(...arguments_) {
      call.arguments = arguments_;
      return traceStatement(statement.bind(...arguments_), call);
    },
    async first(...arguments_) {
      const result = await statement.first(...arguments_);
      call.responseBytes = measureBytes(result);
      // `first` returns the row, not the D1Result, so the provider metadata is not
      // reachable here. Recorded as such rather than left undefined, so the assertion
      // below can tell "the provider did not report it" from "nobody looked".
      call.providerCounters = 'unreachable-via-first';
      return result;
    },
    async raw(...arguments_) {
      const result = await statement.raw(...arguments_);
      call.responseBytes = measureBytes(result);
      return result;
    },
    // INSTRUMENTED 2026-09-19. `run` returned the result untouched, so four of the six
    // outcomes recorded NO bytes at all and the envelope assertion summed zero over
    // them and passed. Found by mutating the cap to 0 and seeing only two outcomes red
    // -- the other four were being measured by nothing. A cap over an unmeasured
    // quantity is not a weaker check, it is no check.
    async run(...arguments_) {
      const result = await statement.run(...arguments_);
      call.responseBytes = measureBytes(result);
      call.providerCounters = {
        rowsRead: result?.meta?.rows_read,
        rowsWritten: result?.meta?.rows_written,
      };
      return result;
    },
    async all(...arguments_) {
      const result = await statement.all(...arguments_);
      call.responseBytes = measureBytes(result);
      call.providerCounters = {
        rowsRead: result?.meta?.rows_read,
        rowsWritten: result?.meta?.rows_written,
      };
      return result;
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
  // Read the BODY, not the whole statement. A trigger declared `AFTER UPDATE OF
  // <column>` carries the word UPDATE in its header, so matching the first one
  // yields the header and a syntax error rather than the statement to be planned.
  const body = /\bBEGIN\b([\s\S]*)\bEND\b/i.exec(trigger)?.at(1) ?? '';
  const update = /UPDATE[\s\S]*?;/i.exec(body)?.at(0);
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
