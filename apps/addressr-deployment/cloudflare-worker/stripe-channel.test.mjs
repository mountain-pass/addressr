import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCheckout,
  deliverMeterEvents,
  handleStripeWebhook,
  reconcileEntitlements,
  reconcileMeterEvents,
  runMeterOperations,
} from './stripe-channel.mjs';

describe('Stripe projection and metering', () => {
  it('rejects a webhook before touching D1 when its signature is invalid', async () => {
    const database = stripeDatabase();
    const response = await handleStripeWebhook(
      webhookRequest(),
      environment(database),
      {
        webhooks: {
          async constructEventAsync() {
            throw new Error('bad signature');
          },
        },
      },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'invalid_webhook_signature',
    });
    assert.equal(database.batchStatements, undefined);
  });

  it('rejects an oversized webhook before signature work or D1', async () => {
    const database = stripeDatabase();
    let isVerified = false;
    const response = await handleStripeWebhook(
      webhookRequest('x'.repeat(256 * 1024 + 1)),
      environment(database),
      {
        webhooks: {
          async constructEventAsync() {
            isVerified = true;
          },
        },
      },
    );

    assert.equal(response.status, 413);
    assert.equal(isVerified, false);
    assert.equal(database.batchStatements, undefined);
  });

  it('projects object-current subscription state into the mapped organization', async () => {
    const database = stripeDatabase();
    const stripe = {
      webhooks: {
        async constructEventAsync() {
          return {
            id: 'evt_addressr_1',
            type: 'customer.subscription.updated',
            created: 1_787_900_000,
            data: { object: { id: 'sub_addressr' } },
          };
        },
      },
      subscriptions: {
        async retrieve(id) {
          assert.equal(id, 'sub_addressr');
          return subscription();
        },
      },
    };

    const response = await handleStripeWebhook(
      webhookRequest(),
      environment(database),
      stripe,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      received: true,
      duplicate: false,
    });
    assert.equal(database.batchStatements.length, 3);
    assert.deepEqual(database.batchStatements[0].values.slice(0, 4), [
      'evt_addressr_1',
      'customer.subscription.updated',
      'sub_addressr',
      1_787_900_000,
    ]);
    assert.deepEqual(database.batchStatements[2].values.slice(0, 10), [
      'org-addressr',
      'sub_addressr',
      'developer',
      'active',
      0,
      'immediate',
      0,
      1000,
      '1787800000',
      1_787_900_000,
    ]);
    assert.equal(
      Number.isNaN(Date.parse(database.batchStatements[2].values[10])),
      false,
    );
  });

  it('does not revoke access from an invoice payment-failed notification', async () => {
    const database = stripeDatabase();
    const response = await handleStripeWebhook(
      webhookRequest(),
      environment(database),
      {
        webhooks: {
          async constructEventAsync() {
            return {
              id: 'evt_payment_failed',
              type: 'invoice.payment_failed',
              data: { object: { subscription: 'sub_addressr' } },
            };
          },
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(database.batchStatements, undefined);
  });

  it('converges an older webhook to the object-current subscription state', async () => {
    const database = stripeDatabase();
    const current = subscription();
    current.status = 'canceled';
    const stripe = {
      webhooks: {
        async constructEventAsync() {
          return {
            id: 'evt_addressr_older',
            type: 'customer.subscription.updated',
            created: 1,
            data: { object: { id: 'sub_addressr' } },
          };
        },
      },
      subscriptions: {
        async retrieve() {
          return current;
        },
      },
    };

    const response = await handleStripeWebhook(
      webhookRequest(),
      environment(database),
      stripe,
    );

    assert.equal(response.status, 200);
    assert.equal(database.batchStatements[2].values[3], 'canceled');
    assert.match(
      database.batchStatements[2].sql,
      /stripe_event_created = MAX\(/,
    );
    assert.doesNotMatch(database.batchStatements[2].sql, /WHERE excluded/);
  });

  it('streams each usage record once with its stable identifier', async () => {
    const database = stripeDatabase({
      pending: [
        {
          id: 'usage-addressr-1',
          created_at: '2026-08-29T00:00:00.000Z',
          stripe_customer_id: 'cus_addressr',
        },
      ],
    });
    const calls = [];
    const stripe = {
      v2: {
        billing: {
          meterEventSession: {
            async create() {
              return { authentication_token: 'meter-session-token' };
            },
          },
          meterEventStream: {
            async create(payload, options) {
              calls.push({ payload, options });
            },
          },
        },
      },
    };

    const result = await deliverMeterEvents(environment(database), stripe);

    assert.deepEqual(result, { attempted: 1, delivered: 1 });
    assert.equal(calls[0].payload.events[0].identifier, 'usage-addressr-1');
    assert.equal(calls[0].options.apiKey, 'meter-session-token');
    assert.deepEqual(calls[0].payload.events[0].payload, {
      stripe_customer_id: 'cus_addressr',
      value: '1',
    });
    assert.equal(database.updates.at(0).values[1], 'usage-addressr-1');
  });

  it('retries a failed batch without replacing stable event identifiers', async () => {
    const database = stripeDatabase({
      pending: [
        {
          id: 'usage-addressr-2',
          created_at: '2026-08-29T00:00:00.000Z',
          stripe_customer_id: 'cus_addressr',
        },
      ],
    });
    const stripe = meterStripe(async () => {
      const error = new Error('temporarily unavailable');
      error.code = 'rate_limit';
      throw error;
    });

    assert.deepEqual(await deliverMeterEvents(environment(database), stripe), {
      attempted: 1,
      delivered: 0,
    });
    assert.deepEqual(database.updates.at(0).values, [
      'rate_limit',
      'usage-addressr-2',
    ]);
  });

  it('records and repairs provider reconciliation states', async () => {
    const database = stripeDatabase({
      pending: [
        reconciliationGroup('org-matched', 'cus_matched', 2, 2),
        reconciliationGroup('org-mismatch', 'cus_mismatch', 2, 2),
        reconciliationGroup('org-pending', 'cus_pending', 2, 1),
        reconciliationGroup('org-rejected', 'cus_rejected', 2, 1, 1),
      ],
    });
    const providerCounts = {
      cus_matched: 2,
      cus_mismatch: 1,
      cus_pending: 1,
      cus_rejected: 1,
    };
    const stripe = {
      billing: {
        meters: {
          async listEventSummaries(meterId, options) {
            assert.equal(meterId, 'mtr_addressr');
            return {
              data: [{ aggregated_value: providerCounts[options.customer] }],
            };
          },
        },
      },
    };
    const config = {
      ...environment(database),
      STRIPE_METER_ID: 'mtr_addressr',
    };

    assert.deepEqual(
      await reconcileMeterEvents(
        config,
        stripe,
        new Date('2026-08-29T04:30:00.000Z'),
      ),
      {
        checked: 4,
        matched: 1,
        mismatched: 1,
        pending: 1,
        rejected: 1,
        errors: 0,
      },
    );
    assert.deepEqual(
      database.updates
        .filter(({ sql }) => sql.includes('INSERT INTO meter_reconciliations'))
        .map(({ values }) => values[7]),
      ['matched', 'mismatched', 'pending', 'rejected'],
    );
    const replay = database.updates.find(({ sql }) =>
      sql.includes("SET meter_state = 'pending'"),
    );
    assert.equal(replay.values[0], 'org-mismatch');
    const retry = database.updates.find(({ sql }) =>
      sql.includes('SET meter_attempts = 0'),
    );
    assert.equal(retry.values[0], 'org-rejected');
  });

  it('repairs a missing entitlement from Stripe object-current state', async () => {
    const database = stripeDatabase({
      pending: [
        {
          id: 'org-addressr',
          clerk_organization_id: 'org_clerk',
          stripe_customer_id: 'cus_addressr',
        },
      ],
    });
    const current = subscription();
    current.updated = 1_787_900_500;
    const stripe = {
      subscriptions: {
        async list(options) {
          assert.equal(options.customer, 'cus_addressr');
          return { data: [current] };
        },
      },
    };

    assert.deepEqual(
      await reconcileEntitlements(environment(database), stripe),
      { checked: 1, repaired: 1, errors: 0 },
    );
    assert.equal(database.batchStatements.length, 3);
    assert.equal(
      database.batchStatements[0].values[0],
      'reconcile:sub_addressr:1787900500',
    );
  });

  it('revisits the oldest unreconciled meter window after the current window', async () => {
    const windows = [];
    const database = {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async all() {
                if (sql.includes('GROUP BY u.organization_id')) {
                  windows.push(values.slice(1, 3));
                }
                return { results: [] };
              },
              async first() {
                return { window_start: '2026-08-29T00:00:00.000Z' };
              },
            };
          },
        };
      },
    };
    const config = {
      ...environment(database),
      STRIPE_METER_ID: 'mtr_addressr',
    };

    await runMeterOperations(config, {}, new Date('2026-08-29T04:30:00.000Z'));

    assert.deepEqual(windows, [
      ['2026-08-29T02:00:00.000Z', '2026-08-29T03:00:00.000Z'],
      ['2026-08-29T00:00:00.000Z', '2026-08-29T01:00:00.000Z'],
    ]);
  });

  it('reuses the organization customer and pending checkout attempt', async () => {
    const keys = [];
    const payloads = [];
    const stripe = {
      checkout: {
        sessions: {
          async create(payload, options) {
            payloads.push(payload);
            keys.push(options.idempotencyKey);
            return {
              id: 'cs_addressr',
              url: 'https://checkout.stripe.com/addressr',
              expires_at: payload.expires_at,
            };
          },
        },
      },
    };
    const config = {
      ...environment(stripeDatabase()),
      MANAGED_APP_URL: 'https://app.addressr.io',
    };
    const organization = {
      id: 'org-addressr',
      clerk_organization_id: 'org_clerk',
      stripe_customer_id: 'cus_addressr',
    };

    await createCheckout(config, organization, 'developer', stripe);
    await createCheckout(config, organization, 'developer', stripe);

    assert.match(keys[0], /^checkout:[0-9a-f-]{36}$/);
    assert.equal(keys.length, 1);
    assert.equal(payloads[0].customer, 'cus_addressr');
    assert.equal(
      payloads[0].success_url,
      'https://app.addressr.io/account/?organization=org_clerk&checkout=success',
    );
    assert.equal(
      payloads[0].cancel_url,
      'https://app.addressr.io/account/?organization=org_clerk&checkout=cancelled',
    );
  });

  it('uses one Stripe idempotency key for concurrent checkout requests', async () => {
    const keys = [];
    const database = stripeDatabase();
    const stripe = {
      checkout: {
        sessions: {
          async create(payload, options) {
            keys.push(options.idempotencyKey);
            return {
              id: 'cs_addressr',
              url: 'https://checkout.stripe.com/addressr',
              expires_at: payload.expires_at,
            };
          },
        },
      },
    };
    const config = {
      ...environment(database),
      MANAGED_APP_URL: 'https://app.addressr.io',
    };
    const organization = {
      id: 'org-addressr',
      clerk_organization_id: 'org_clerk',
      stripe_customer_id: 'cus_addressr',
    };

    await Promise.all([
      createCheckout(config, organization, 'developer', stripe),
      createCheckout(config, organization, 'developer', stripe),
    ]);

    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
  });

  it('creates and stores one Stripe customer for an organization', async () => {
    const database = stripeDatabase();
    let customerCreates = 0;
    const stripe = {
      customers: {
        async create(_payload, options) {
          customerCreates += 1;
          assert.equal(options.idempotencyKey, 'customer:org-addressr');
          return { id: 'cus_addressr' };
        },
      },
      checkout: {
        sessions: {
          async create(payload) {
            assert.equal(payload.customer, 'cus_addressr');
            return {
              id: 'cs_addressr',
              url: 'https://checkout.stripe.com/addressr',
              expires_at: payload.expires_at,
            };
          },
        },
      },
    };
    const organization = {
      id: 'org-addressr',
      clerk_organization_id: 'org_clerk',
    };

    await createCheckout(
      {
        ...environment(database),
        MANAGED_APP_URL: 'https://app.addressr.io',
      },
      organization,
      'developer',
      stripe,
    );

    assert.equal(customerCreates, 1);
    assert.equal(database.stripeCustomerId, 'cus_addressr');
  });
});

function meterStripe(createStream) {
  return {
    v2: {
      billing: {
        meterEventSession: {
          async create() {
            return { authentication_token: 'meter-session-token' };
          },
        },
        meterEventStream: { create: createStream },
      },
    },
  };
}

function reconciliationGroup(
  organization_id,
  stripe_customer_id,
  expected_count,
  delivered_count,
  rejected_count = 0,
) {
  return {
    organization_id,
    stripe_customer_id,
    expected_count,
    delivered_count,
    rejected_count,
  };
}

function webhookRequest(body = '{}') {
  return new Request('https://api.addressr.io/managed/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'signed' },
    body,
  });
}

function environment(database) {
  return {
    CUSTOMER_DB: database,
    STRIPE_WEBHOOK_SECRET: 'whsec_addressr',
    STRIPE_METER_EVENT_NAME: 'addressr_request',
    STRIPE_PAYMENT_METHOD_TYPES: '["card"]',
    STRIPE_PLAN_CATALOGUE: JSON.stringify({
      developer: { priceId: 'price_developer', quota: 1000 },
    }),
  };
}

function subscription() {
  return {
    id: 'sub_addressr',
    customer: 'cus_addressr',
    status: 'active',
    cancel_at_period_end: false,
    payment_settings: { payment_method_types: ['card'] },
    metadata: {
      addressr_organization_id: 'org-addressr',
      addressr_plan_key: 'developer',
      addressr_payment_method_policy: 'immediate',
    },
    items: {
      data: [
        {
          current_period_start: 1_787_800_000,
          price: { id: 'price_developer' },
        },
      ],
    },
  };
}

function stripeDatabase({ pending = [] } = {}) {
  const database = {
    batchStatements: undefined,
    stripeCustomerId: undefined,
    checkoutAttempt: undefined,
    updates: [],
    prepare(sql) {
      return {
        sql,
        bind(...values) {
          return {
            sql,
            values,
            async first() {
              if (
                sql.includes('SELECT stripe_customer_id FROM organizations')
              ) {
                return { stripe_customer_id: database.stripeCustomerId };
              }
              if (sql.includes('FROM checkout_attempts')) {
                return database.checkoutAttempt;
              }
              return {};
            },
            async all() {
              return { results: pending };
            },
            async run() {
              if (sql.includes('UPDATE organizations SET stripe_customer_id')) {
                database.stripeCustomerId ||= values[0];
              }
              if (sql.includes('INSERT INTO checkout_attempts')) {
                const [
                  organizationId,
                  planKey,
                  attemptId,
                  expiresAt,
                  createdAt,
                ] = values;
                if (
                  !database.checkoutAttempt ||
                  database.checkoutAttempt.expires_at <= createdAt
                ) {
                  database.checkoutAttempt = {
                    organization_id: organizationId,
                    plan_key: planKey,
                    attempt_id: attemptId,
                    stripe_session_id: undefined,
                    url: undefined,
                    expires_at: expiresAt,
                    created_at: createdAt,
                  };
                }
              }
              if (sql.includes('UPDATE checkout_attempts')) {
                const [sessionId, url, expiresAt, organizationId, attemptId] =
                  values;
                if (
                  database.checkoutAttempt?.organization_id ===
                    organizationId &&
                  database.checkoutAttempt.attempt_id === attemptId
                ) {
                  Object.assign(database.checkoutAttempt, {
                    stripe_session_id: sessionId,
                    url,
                    expires_at: expiresAt,
                  });
                }
              }
              database.updates.push({ sql, values });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements) {
      database.batchStatements = statements;
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return database;
}
