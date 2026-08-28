import StripeClient from 'stripe';

const MAX_METER_ATTEMPTS = 12;
const METER_BATCH_SIZE = 100;
const WEBHOOK_BODY_LIMIT = 256 * 1024;
const CHECKOUT_ATTEMPT_SECONDS = 31 * 60;

export function createStripeClient(environment) {
  if (!environment?.STRIPE_SECRET_KEY) return;
  return new StripeClient(environment.STRIPE_SECRET_KEY, {
    httpClient: StripeClient.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}

export function isStripeConfigAvailable(environment) {
  return Boolean(
    createStripeClient(environment) &&
    environment?.STRIPE_WEBHOOK_SECRET &&
    environment?.STRIPE_METER_EVENT_NAME &&
    environment?.STRIPE_METER_ID &&
    planCatalogue(environment).size > 0 &&
    paymentMethods(environment).length > 0,
  );
}

export async function createCheckout(
  environment,
  organization,
  planKey,
  stripe = createStripeClient(environment),
) {
  const plan = planCatalogue(environment).get(planKey);
  const methods = paymentMethods(environment);
  if (!stripe || !plan || methods.length === 0) return unavailable();

  const customerId = await ensureStripeCustomer(
    environment,
    organization,
    stripe,
  );
  if (!customerId) return unavailable();
  const attempt = await claimCheckoutAttempt(
    environment.CUSTOMER_DB,
    organization.id,
    planKey,
  );
  if (!attempt || attempt.plan_key !== planKey) {
    return { ok: false, error: 'checkout_pending' };
  }
  if (attempt.url) return { ok: true, url: attempt.url };
  const expiresAt = Math.floor(Date.parse(attempt.expires_at) / 1000);

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      client_reference_id: organization.id,
      customer: customerId,
      line_items: [{ price: plan.priceId }],
      payment_method_types: methods,
      expires_at: expiresAt,
      success_url: accountReturnUrl(environment, organization, 'success'),
      cancel_url: accountReturnUrl(environment, organization, 'cancelled'),
      metadata: {
        addressr_organization_id: organization.id,
        clerk_organization_id: organization.clerk_organization_id,
      },
      subscription_data: {
        metadata: {
          addressr_organization_id: organization.id,
          clerk_organization_id: organization.clerk_organization_id,
          addressr_plan_key: planKey,
          addressr_payment_method_policy: 'immediate',
        },
      },
    },
    {
      idempotencyKey: `checkout:${attempt.attempt_id}`,
    },
  );
  await environment.CUSTOMER_DB.prepare(
    `UPDATE checkout_attempts
        SET stripe_session_id = ?, url = ?, expires_at = ?
      WHERE organization_id = ? AND attempt_id = ?`,
  )
    .bind(
      session.id,
      session.url,
      new Date((session.expires_at || expiresAt) * 1000).toISOString(),
      organization.id,
      attempt.attempt_id,
    )
    .run();
  return { ok: true, url: session.url };
}

export async function createPortal(
  environment,
  organization,
  stripe = createStripeClient(environment),
) {
  if (!stripe || !organization.stripe_customer_id) return unavailable();
  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripe_customer_id,
    return_url: accountReturnUrl(environment, organization),
  });
  return { ok: true, url: session.url };
}

export async function handleStripeWebhook(
  request,
  environment,
  stripe = createStripeClient(environment),
) {
  if (
    !stripe ||
    !environment?.STRIPE_WEBHOOK_SECRET ||
    !environment?.CUSTOMER_DB
  ) {
    return Response.json({ error: 'stripe_not_configured' }, { status: 503 });
  }

  let event;
  try {
    const body = await readBodyAtMost(request, WEBHOOK_BODY_LIMIT);
    event = await stripe.webhooks.constructEventAsync(
      body,
      request.headers.get('stripe-signature'),
      environment.STRIPE_WEBHOOK_SECRET,
      undefined,
      StripeClient.createSubtleCryptoProvider(),
    );
  } catch (error) {
    if (error?.message === 'webhook_body_too_large') {
      return Response.json(
        { error: 'webhook_body_too_large' },
        { status: 413 },
      );
    }
    return Response.json(
      { error: 'invalid_webhook_signature' },
      { status: 400 },
    );
  }

  const subscriptionId = subscriptionIdFrom(event);
  if (!subscriptionId) return Response.json({ received: true });

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const projection = subscriptionProjection(subscription, event, environment);
    if (!projection) {
      return Response.json({ error: 'unmapped_subscription' }, { status: 422 });
    }
    const outcome = await storeProjection(environment.CUSTOMER_DB, projection);
    return Response.json({
      received: true,
      duplicate: outcome === 'duplicate',
    });
  } catch (error) {
    if (String(error?.message).includes('stripe_events.id')) {
      return Response.json({ received: true, duplicate: true });
    }
    return Response.json({ error: 'projection_failed' }, { status: 503 });
  }
}

async function ensureStripeCustomer(environment, organization, stripe) {
  if (organization.stripe_customer_id) return organization.stripe_customer_id;
  if (!environment?.CUSTOMER_DB) return;
  const customer = await stripe.customers.create(
    {
      metadata: {
        addressr_organization_id: organization.id,
        clerk_organization_id: organization.clerk_organization_id,
      },
    },
    { idempotencyKey: `customer:${organization.id}` },
  );
  await environment.CUSTOMER_DB.prepare(
    `UPDATE organizations SET stripe_customer_id = ?
      WHERE id = ? AND stripe_customer_id IS NULL`,
  )
    .bind(customer.id, organization.id)
    .run();
  const stored = await environment.CUSTOMER_DB.prepare(
    'SELECT stripe_customer_id FROM organizations WHERE id = ? LIMIT 1',
  )
    .bind(organization.id)
    .first();
  return stored?.stripe_customer_id;
}

async function claimCheckoutAttempt(database, organizationId, planKey) {
  const now = new Date();
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Cloudflare Workers provides Web Crypto and randomUUID.
  const attemptId = crypto.randomUUID();
  const expiresAt = new Date(
    now.getTime() + CHECKOUT_ATTEMPT_SECONDS * 1000,
  ).toISOString();
  await database
    .prepare(
      `INSERT INTO checkout_attempts (
         organization_id,plan_key,attempt_id,expires_at,created_at
       ) VALUES (?,?,?,?,?)
       ON CONFLICT(organization_id) DO UPDATE SET
         plan_key = excluded.plan_key,
         attempt_id = excluded.attempt_id,
         stripe_session_id = NULL,
         url = NULL,
         expires_at = excluded.expires_at,
         created_at = excluded.created_at
       WHERE checkout_attempts.expires_at <= excluded.created_at`,
    )
    .bind(organizationId, planKey, attemptId, expiresAt, now.toISOString())
    .run();
  return database
    .prepare(
      `SELECT plan_key,attempt_id,stripe_session_id,url,expires_at
         FROM checkout_attempts WHERE organization_id = ? LIMIT 1`,
    )
    .bind(organizationId)
    .first();
}

function accountReturnUrl(environment, organization, outcome) {
  const url = new URL('/account/', environment.MANAGED_APP_URL);
  url.searchParams.set('organization', organization.clerk_organization_id);
  if (outcome) url.searchParams.set('checkout', outcome);
  return url.toString();
}

async function readBodyAtMost(request, limit) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > limit) throw new Error('webhook_body_too_large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('webhook_body_too_large');
    }
    body += decoder.decode(value, { stream: true });
  }
}

export async function deliverMeterEvents(
  environment,
  stripe = createStripeClient(environment),
) {
  if (
    !stripe ||
    !environment?.CUSTOMER_DB ||
    !environment?.STRIPE_METER_EVENT_NAME
  ) {
    return { attempted: 0, delivered: 0 };
  }

  const pending = await environment.CUSTOMER_DB.prepare(
    `SELECT u.id, u.created_at, o.stripe_customer_id
       FROM usage_records u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.outcome = 'billable'
        AND u.meter_state = 'pending'
        AND u.meter_attempts < ?
        AND o.stripe_customer_id IS NOT NULL
      ORDER BY u.created_at
      LIMIT ?`,
  )
    .bind(MAX_METER_ATTEMPTS, METER_BATCH_SIZE)
    .all();
  const records = pending?.results || [];
  if (records.length === 0) return { attempted: 0, delivered: 0 };

  try {
    const session = await stripe.v2.billing.meterEventSession.create();
    await stripe.v2.billing.meterEventStream.create(
      {
        events: records.map((record) => ({
          event_name: environment.STRIPE_METER_EVENT_NAME,
          identifier: record.id,
          timestamp: record.created_at,
          payload: {
            stripe_customer_id: record.stripe_customer_id,
            value: '1',
          },
        })),
      },
      { apiKey: session.authentication_token },
    );
    await updateMeterRecords(environment.CUSTOMER_DB, records, 'delivered');
  } catch (error) {
    await updateMeterRecords(
      environment.CUSTOMER_DB,
      records,
      'failed',
      providerErrorCode(error),
    );
    return { attempted: records.length, delivered: 0 };
  }
  return {
    attempted: records.length,
    delivered: records.length,
  };
}

export async function meterReconciliation(database) {
  return database
    .prepare(
      `SELECT meter_state, meter_error_code, COUNT(*) AS records
         FROM usage_records
        WHERE outcome = 'billable'
        GROUP BY meter_state, meter_error_code
        ORDER BY meter_state, meter_error_code`,
    )
    .all();
}

export async function reconcileMeterEvents(
  environment,
  stripe = createStripeClient(environment),
  now = new Date(),
) {
  if (!stripe || !environment?.CUSTOMER_DB || !environment?.STRIPE_METER_ID) {
    return {
      checked: 0,
      matched: 0,
      mismatched: 0,
      pending: 0,
      rejected: 0,
      errors: 0,
    };
  }

  const end = new Date(now);
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() - 1);
  const start = new Date(end);
  start.setUTCHours(start.getUTCHours() - 1);
  const result = emptyReconciliation();
  let cursor = '';
  while (true) {
    const groups = await environment.CUSTOMER_DB.prepare(
      `SELECT u.organization_id, o.stripe_customer_id,
            COUNT(*) AS expected_count,
            SUM(CASE WHEN u.meter_state = 'delivered' THEN 1 ELSE 0 END) AS delivered_count,
            SUM(CASE WHEN u.meter_attempts >= ? THEN 1 ELSE 0 END) AS rejected_count
       FROM usage_records u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.outcome = 'billable'
        AND u.created_at >= ? AND u.created_at < ?
        AND o.stripe_customer_id IS NOT NULL
        AND u.organization_id > ?
      GROUP BY u.organization_id, o.stripe_customer_id
      ORDER BY u.organization_id
      LIMIT 25`,
    )
      .bind(MAX_METER_ATTEMPTS, start.toISOString(), end.toISOString(), cursor)
      .all();

    const organizations = groups?.results || [];
    for (const group of organizations) {
      let providerCount;
      let state;
      let errorCode;
      try {
        const summaries = await stripe.billing.meters.listEventSummaries(
          environment.STRIPE_METER_ID,
          {
            customer: group.stripe_customer_id,
            start_time: Math.floor(start.getTime() / 1000),
            end_time: Math.floor(end.getTime() / 1000),
            limit: 100,
          },
        );
        providerCount = (summaries.data || []).reduce(
          (total, summary) => total + Number(summary.aggregated_value || 0),
          0,
        );
        state = reconciliationState(group, providerCount);
        if (
          state === 'mismatched' &&
          providerCount < Number(group.delivered_count)
        ) {
          await requeueDeliveredUsage(
            environment.CUSTOMER_DB,
            group.organization_id,
            start,
            end,
          );
        }
        if (state === 'rejected') {
          await requeueRejectedUsage(
            environment.CUSTOMER_DB,
            group.organization_id,
            start,
            end,
          );
        }
      } catch (error) {
        state = 'error';
        errorCode = providerErrorCode(error);
      }

      await storeReconciliation(environment.CUSTOMER_DB, {
        ...group,
        start: start.toISOString(),
        end: end.toISOString(),
        providerCount,
        state,
        errorCode,
      });
      result.checked += 1;
      countReconciliationState(result, state);
    }
    if (organizations.length < 25) break;
    cursor = organizations.at(-1).organization_id;
  }
  return result;
}

export async function reconcileEntitlements(
  environment,
  stripe = createStripeClient(environment),
) {
  const result = { checked: 0, repaired: 0, errors: 0 };
  if (!stripe || !environment?.CUSTOMER_DB) return result;
  let cursor = '';
  while (true) {
    const organizations = await environment.CUSTOMER_DB.prepare(
      `SELECT id, clerk_organization_id, stripe_customer_id
         FROM organizations
        WHERE stripe_customer_id IS NOT NULL AND id > ?
        ORDER BY id
        LIMIT 25`,
    )
      .bind(cursor)
      .all();
    const organizationRows = organizations?.results || [];
    for (const organization of organizationRows) {
      result.checked += 1;
      try {
        result.repaired += await reconcileOrganizationEntitlements(
          environment,
          stripe,
          organization,
        );
      } catch {
        result.errors += 1;
      }
    }
    if (organizationRows.length < 25) break;
    cursor = organizationRows.at(-1).id;
  }
  return result;
}

async function reconcileOrganizationEntitlements(
  environment,
  stripe,
  organization,
) {
  const response = await stripe.subscriptions.list({
    customer: organization.stripe_customer_id,
    status: 'all',
    limit: 100,
  });
  const subscriptions = (response.data || []).filter(
    (subscription) =>
      subscription.metadata?.addressr_organization_id === organization.id,
  );
  let repaired = 0;
  for (const subscription of subscriptions) {
    const event = {
      id: `reconcile:${subscription.id}:${subscription.updated || subscription.status}`,
      type: 'reconciliation.subscription',
      created: subscription.updated || Math.floor(Date.now() / 1000),
    };
    const projection = subscriptionProjection(subscription, event, environment);
    if (projection) {
      await storeProjection(environment.CUSTOMER_DB, projection);
      repaired += 1;
    }
  }
  return repaired;
}

export async function runMeterOperations(
  environment,
  stripe = createStripeClient(environment),
  now = new Date(),
) {
  const delivery = await deliverMeterEvents(environment, stripe);
  const entitlementReconciliation = await reconcileEntitlements(
    environment,
    stripe,
  );
  const reconciliation = emptyReconciliation();
  mergeReconciliation(
    reconciliation,
    await reconcileMeterEvents(environment, stripe, now),
  );
  const backlog = await oldestUnreconciledWindow(environment, now);
  if (backlog && backlog !== reconciliationWindow(now).start.toISOString()) {
    const backlogTime = new Date(Date.parse(backlog) + 2 * 60 * 60 * 1000);
    mergeReconciliation(
      reconciliation,
      await reconcileMeterEvents(environment, stripe, backlogTime),
    );
  }
  const outcome = {
    principal: 'managed-meter',
    delivery,
    entitlementReconciliation,
    reconciliation,
  };
  console.log(JSON.stringify(outcome));
  return outcome;
}

async function oldestUnreconciledWindow(environment, now) {
  if (!environment?.CUSTOMER_DB || !environment?.STRIPE_METER_ID) return;
  const { end } = reconciliationWindow(now);
  const row = await environment.CUSTOMER_DB.prepare(
    `SELECT MIN(substr(u.created_at, 1, 13) || ':00:00.000Z') AS window_start
       FROM usage_records u
       LEFT JOIN meter_reconciliations r
         ON r.organization_id = u.organization_id
        AND r.window_start = substr(u.created_at, 1, 13) || ':00:00.000Z'
      WHERE u.outcome = 'billable' AND u.created_at < ?
        AND (r.state IS NULL OR r.state != 'matched')`,
  )
    .bind(end.toISOString())
    .first();
  return row?.window_start || undefined;
}

function reconciliationWindow(now) {
  const end = new Date(now);
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() - 1);
  const start = new Date(end);
  start.setUTCHours(start.getUTCHours() - 1);
  return { start, end };
}

function emptyReconciliation() {
  return {
    checked: 0,
    matched: 0,
    mismatched: 0,
    pending: 0,
    rejected: 0,
    errors: 0,
  };
}

function mergeReconciliation(total, result) {
  for (const key of Object.keys(total)) total[key] += result[key];
}

async function requeueDeliveredUsage(database, organizationId, start, end) {
  return database
    .prepare(
      `UPDATE usage_records
          SET meter_state = 'pending', meter_delivered_at = NULL
        WHERE organization_id = ?
          AND created_at >= ? AND created_at < ?
          AND outcome = 'billable' AND meter_state = 'delivered'`,
    )
    .bind(organizationId, start.toISOString(), end.toISOString())
    .run();
}

async function requeueRejectedUsage(database, organizationId, start, end) {
  return database
    .prepare(
      `UPDATE usage_records
          SET meter_attempts = 0, meter_error_code = NULL
        WHERE organization_id = ?
          AND created_at >= ? AND created_at < ?
          AND outcome = 'billable' AND meter_state = 'pending'
          AND meter_attempts >= ?`,
    )
    .bind(
      organizationId,
      start.toISOString(),
      end.toISOString(),
      MAX_METER_ATTEMPTS,
    )
    .run();
}

export function planCatalogue(environment) {
  try {
    const parsed = JSON.parse(environment?.STRIPE_PLAN_CATALOGUE || '{}');
    return new Map(
      Object.entries(parsed).filter(
        ([key, plan]) =>
          /^[a-z0-9-]{1,40}$/.test(key) &&
          typeof plan?.priceId === 'string' &&
          plan.priceId.startsWith('price_') &&
          Number.isSafeInteger(plan.quota) &&
          plan.quota > 0,
      ),
    );
  } catch {
    return new Map();
  }
}

async function updateMeterRecords(database, records, outcome, errorCode) {
  const ids = records.map((record) => record.id);
  const placeholders = ids.map(() => '?').join(',');
  if (outcome === 'delivered') {
    return database
      .prepare(
        `UPDATE usage_records
            SET meter_state = 'delivered', meter_delivered_at = ?, meter_error_code = NULL
          WHERE id IN (${placeholders}) AND meter_state = 'pending'`,
      )
      .bind(new Date().toISOString(), ...ids)
      .run();
  }
  return database
    .prepare(
      `UPDATE usage_records
          SET meter_attempts = meter_attempts + 1, meter_error_code = ?
        WHERE id IN (${placeholders}) AND meter_state = 'pending'`,
    )
    .bind(errorCode, ...ids)
    .run();
}

function reconciliationState(group, providerCount) {
  if (Number(group.rejected_count) > 0) return 'rejected';
  if (Number(group.delivered_count) < Number(group.expected_count)) {
    return 'pending';
  }
  return providerCount === Number(group.expected_count)
    ? 'matched'
    : 'mismatched';
}

function countReconciliationState(result, state) {
  switch (state) {
    case 'matched': {
      result.matched += 1;
      return;
    }
    case 'mismatched': {
      result.mismatched += 1;
      return;
    }
    case 'pending': {
      result.pending += 1;
      return;
    }
    case 'rejected': {
      result.rejected += 1;
      return;
    }
    default: {
      result.errors += 1;
    }
  }
}

async function storeReconciliation(database, reconciliation) {
  return database
    .prepare(
      `INSERT INTO meter_reconciliations (
         organization_id,window_start,window_end,expected_count,delivered_count,
         rejected_count,provider_count,state,checked_at,error_code
       ) VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(organization_id,window_start,window_end) DO UPDATE SET
         expected_count = excluded.expected_count,
         delivered_count = excluded.delivered_count,
         rejected_count = excluded.rejected_count,
         provider_count = excluded.provider_count,
         state = excluded.state,
         checked_at = excluded.checked_at,
         error_code = excluded.error_code`,
    )
    .bind(
      reconciliation.organization_id,
      reconciliation.start,
      reconciliation.end,
      Number(reconciliation.expected_count),
      Number(reconciliation.delivered_count),
      Number(reconciliation.rejected_count),
      // eslint-disable-next-line unicorn/no-null -- D1 uses JavaScript null for SQL NULL bindings.
      reconciliation.providerCount ?? null,
      reconciliation.state,
      new Date().toISOString(),
      // eslint-disable-next-line unicorn/no-null -- D1 uses JavaScript null for SQL NULL bindings.
      reconciliation.errorCode || null,
    )
    .run();
}

function subscriptionIdFrom(event) {
  if (event?.type === 'checkout.session.completed') {
    return stringId(event.data?.object?.subscription);
  }
  return event?.type?.startsWith('customer.subscription.')
    ? stringId(event.data?.object)
    : undefined;
}

function subscriptionProjection(subscription, event, environment) {
  const organizationId = subscription?.metadata?.addressr_organization_id;
  const planKey = subscription?.metadata?.addressr_plan_key;
  const plan = planCatalogue(environment).get(planKey);
  const item = subscription?.items?.data?.[0];
  const customerId = stringId(subscription?.customer);
  if (!organizationId || !customerId || !item) return;

  const configuredMethods = new Set(paymentMethods(environment));
  const actualMethods = subscription.payment_settings?.payment_method_types;
  const isImmediate =
    subscription.metadata?.addressr_payment_method_policy === 'immediate' &&
    Array.isArray(actualMethods) &&
    actualMethods.length > 0 &&
    actualMethods.every((method) => configuredMethods.has(method));
  const matchesPlan = plan && item.price?.id === plan.priceId;

  return {
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    subscriptionId: subscription.id,
    organizationId,
    customerId,
    planKey: matchesPlan ? planKey : 'unsupported',
    status: subscription.status,
    isPaused: subscription.pause_collection ? 1 : 0,
    paymentPolicy: isImmediate && matchesPlan ? 'immediate' : 'unsupported',
    cancelAtPeriodEnd: subscription.cancel_at_period_end ? 1 : 0,
    quota: matchesPlan ? plan.quota : 1,
    quotaPeriod: String(item.current_period_start),
  };
}

async function storeProjection(database, projection) {
  const organization = await database
    .prepare(
      'SELECT stripe_customer_id FROM organizations WHERE id = ? LIMIT 1',
    )
    .bind(projection.organizationId)
    .first();
  if (
    !organization ||
    (organization.stripe_customer_id &&
      organization.stripe_customer_id !== projection.customerId)
  ) {
    throw new Error('organization_customer_mismatch');
  }

  await database.batch([
    database
      .prepare(
        'INSERT INTO stripe_events (id,event_type,object_id,event_created,processed_at) VALUES (?,?,?,?,?)',
      )
      .bind(
        projection.eventId,
        projection.eventType,
        projection.subscriptionId,
        projection.eventCreated,
        new Date().toISOString(),
      ),
    database
      .prepare(
        'UPDATE organizations SET stripe_customer_id = ? WHERE id = ? AND (stripe_customer_id IS NULL OR stripe_customer_id = ?)',
      )
      .bind(
        projection.customerId,
        projection.organizationId,
        projection.customerId,
      ),
    database
      .prepare(
        `INSERT INTO entitlements (
           organization_id,stripe_subscription_id,plan_key,subscription_status,
           pause_collection,payment_method_policy,cancel_at_period_end,quota_limit,
           quota_used,quota_period,stripe_event_created,updated_at
         ) VALUES (?,?,?,?,?,?,?,?,0,?,?,?)
         ON CONFLICT(organization_id) DO UPDATE SET
           stripe_subscription_id = excluded.stripe_subscription_id,
           plan_key = excluded.plan_key,
           subscription_status = excluded.subscription_status,
           pause_collection = excluded.pause_collection,
           payment_method_policy = excluded.payment_method_policy,
           cancel_at_period_end = excluded.cancel_at_period_end,
           quota_limit = excluded.quota_limit,
           quota_used = CASE WHEN entitlements.quota_period = excluded.quota_period
             THEN entitlements.quota_used ELSE 0 END,
           quota_period = excluded.quota_period,
           stripe_event_created = MAX(entitlements.stripe_event_created, excluded.stripe_event_created),
           updated_at = excluded.updated_at`,
      )
      .bind(
        projection.organizationId,
        projection.subscriptionId,
        projection.planKey,
        projection.status,
        projection.isPaused,
        projection.paymentPolicy,
        projection.cancelAtPeriodEnd,
        projection.quota,
        projection.quotaPeriod,
        projection.eventCreated,
        new Date().toISOString(),
      ),
  ]);
  return 'stored';
}

function paymentMethods(environment) {
  try {
    const methods = JSON.parse(
      environment?.STRIPE_PAYMENT_METHOD_TYPES || '[]',
    );
    return Array.isArray(methods)
      ? methods.filter((method) => /^[a-z][a-z0-9_]{1,39}$/.test(method))
      : [];
  } catch {
    return [];
  }
}

function stringId(value) {
  return typeof value === 'string' ? value : value?.id;
}

function providerErrorCode(error) {
  const code = error?.code || error?.type || 'provider_error';
  return String(code).slice(0, 80);
}

function unavailable() {
  return { ok: false, error: 'stripe_not_configured' };
}
