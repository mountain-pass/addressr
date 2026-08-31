/* eslint-disable n/no-unsupported-features/node-builtins -- Cloudflare Workers provides Web Crypto and randomUUID. */
import { createClerkClient } from '@clerk/backend';
import {
  createCustomerKey,
  isManagedChannelEnabled,
  isManagedOrganizationAllowed,
} from './customer-channel.mjs';
import {
  createCheckout,
  createPortal,
  handleStripeWebhook,
  planCatalogue,
  isStripeConfigAvailable,
} from './stripe-channel.mjs';

const MANAGED_PREFIX = '/managed/';
const ADMIN_ROLE = 'org:admin';
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isManagedRequest(request) {
  return new URL(request.url).pathname.startsWith(MANAGED_PREFIX);
}

export async function handleManagedRequest(
  request,
  environment,
  dependencies = {},
) {
  const path = new URL(request.url).pathname;
  if (path === '/managed/stripe-webhook' && request.method === 'POST') {
    return handleStripeWebhook(request, environment, dependencies.stripe);
  }

  if (!allowedOrigin(request, environment)) {
    return Response.json({ error: 'origin_not_allowed' }, { status: 403 });
  }
  if (request.method === 'OPTIONS') return preflight(request, environment);
  if (path === '/managed/config' && request.method === 'GET') {
    const enabled = isManagedChannelEnabled(environment);
    const plans = enabled
      ? [...planCatalogue(environment)].map(([key, plan]) => ({
          key,
          name:
            typeof plan.name === 'string' && plan.name.trim()
              ? plan.name.trim().slice(0, 80)
              : key,
        }))
      : [];
    return withCors(
      Response.json({
        available: isManagedAccountConfigAvailable(environment),
        clerkPublishableKey: enabled
          ? environment?.CLERK_PUBLISHABLE_KEY || undefined
          : undefined,
        plans,
      }),
      request,
      environment,
    );
  }
  if (!isManagedChannelEnabled(environment)) {
    return withCors(
      problem(503, 'managed_channel_not_active'),
      request,
      environment,
    );
  }

  const session = await authorizeSession(
    request,
    environment,
    dependencies.clerk,
  );
  if (!session.ok) return withCors(session.response, request, environment);
  if (!isManagedOrganizationAllowed(environment, session.clerkOrganizationId)) {
    return withCors(
      problem(403, 'organization_not_enabled'),
      request,
      environment,
    );
  }

  try {
    const organization = await organizationForSession(environment, session);
    let response;
    if (path === '/managed/account' && request.method === 'GET') {
      response = await accountSummary(environment, organization, session);
    } else if (path === '/managed/checkout' && request.method === 'POST') {
      response = await privileged(session, async () => {
        const body = await readJson(request);
        if (!body?.plan || !planCatalogue(environment).has(body.plan)) {
          return problem(400, 'invalid_plan');
        }
        if (ENTITLED_STATUSES.has(organization.subscription_status)) {
          return problem(409, 'subscription_exists');
        }
        return redirectResult(
          await createCheckout(
            environment,
            organization,
            body.plan,
            dependencies.stripe,
          ),
        );
      });
    } else if (path === '/managed/portal' && request.method === 'POST') {
      response = await privileged(session, async () =>
        redirectResult(
          await createPortal(environment, organization, dependencies.stripe),
        ),
      );
    } else if (path === '/managed/api-keys' && request.method === 'POST') {
      response = await privileged(session, () =>
        createApiKey(request, environment, organization),
      );
    } else if (
      path.startsWith('/managed/api-keys/') &&
      request.method === 'DELETE'
    ) {
      response = await privileged(session, () =>
        revokeApiKey(
          path.slice('/managed/api-keys/'.length),
          environment,
          organization,
        ),
      );
    } else {
      response = problem(404, 'managed_route_not_found');
    }
    return withCors(response, request, environment);
  } catch {
    return withCors(
      problem(503, 'managed_account_unavailable'),
      request,
      environment,
    );
  }
}

export function isManagedAccountConfigAvailable(environment) {
  if (!environment) return false;
  return Boolean(
    isManagedChannelEnabled(environment) &&
    environment.CUSTOMER_DB &&
    environment.CLERK_PUBLISHABLE_KEY &&
    environment.CLERK_JWT_KEY &&
    allowedOrigins(environment).length > 0 &&
    isStripeConfigAvailable(environment),
  );
}

export async function authorizeSession(request, environment, clerk) {
  if (
    !environment?.CLERK_PUBLISHABLE_KEY ||
    !environment?.CLERK_JWT_KEY ||
    allowedOrigins(environment).length === 0
  ) {
    return rejected(503, 'identity_not_configured');
  }

  try {
    const client =
      clerk ||
      createClerkClient({
        publishableKey: environment.CLERK_PUBLISHABLE_KEY,
        jwtKey: environment.CLERK_JWT_KEY,
      });
    const state = await client.authenticateRequest(request, {
      acceptsToken: 'session_token',
      authorizedParties: allowedOrigins(environment),
    });
    if (!state.isAuthenticated) return rejected(401, 'sign_in_required');
    const auth = state.toAuth();
    if (!auth.orgId || !auth.userId)
      return rejected(403, 'active_organization_required');
    return {
      ok: true,
      clerkOrganizationId: auth.orgId,
      isAdmin: auth.orgRole === ADMIN_ROLE,
    };
  } catch {
    return rejected(401, 'invalid_session');
  }
}

async function organizationForSession(environment, session) {
  if (!environment?.CUSTOMER_DB) throw new Error('customer_db_missing');
  await environment.CUSTOMER_DB.prepare(
    `INSERT OR IGNORE INTO organizations (id,clerk_organization_id,created_at)
     VALUES (?,?,?)`,
  )
    .bind(
      crypto.randomUUID(),
      session.clerkOrganizationId,
      new Date().toISOString(),
    )
    .run();
  const organization = await environment.CUSTOMER_DB.prepare(
    `SELECT o.id, o.clerk_organization_id, o.stripe_customer_id,
            e.plan_key, e.subscription_status, e.quota_limit, e.quota_used, e.hard_limit,
            e.quota_period, e.cancel_at_period_end
       FROM organizations o
       LEFT JOIN entitlements e ON e.organization_id = o.id
      WHERE o.clerk_organization_id = ?
      LIMIT 1`,
  )
    .bind(session.clerkOrganizationId)
    .first();
  if (!organization) throw new Error('organization_unavailable');
  return organization;
}

async function accountSummary(environment, organization, session) {
  const keys = await environment.CUSTOMER_DB.prepare(
    `SELECT id,name,prefix,created_at,revoked_at
       FROM api_keys
      WHERE organization_id = ?
      ORDER BY created_at DESC`,
  )
    .bind(organization.id)
    .all();
  return Response.json({
    organization: {
      clerkId: organization.clerk_organization_id,
      canManage: session.isAdmin,
    },
    subscription: organization.subscription_status
      ? {
          plan: organization.plan_key,
          status: organization.subscription_status,
          cancelAtPeriodEnd: Boolean(organization.cancel_at_period_end),
        }
      : undefined,
    quota:
      Number.isSafeInteger(organization.quota_limit) &&
      [0, 1].includes(organization.hard_limit)
        ? {
            used: organization.quota_used,
            limit: organization.quota_limit,
            hardLimit: organization.hard_limit === 1,
            period: organization.quota_period,
          }
        : undefined,
    keys: (keys?.results || []).map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key.created_at,
      revokedAt: key.revoked_at,
    })),
  });
}

async function createApiKey(request, environment, organization) {
  const body = await readJson(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,63}$/u.test(name)) {
    return problem(400, 'invalid_key_name');
  }
  const generated = await createCustomerKey();
  const id = crypto.randomUUID();
  try {
    await environment.CUSTOMER_DB.prepare(
      `INSERT INTO api_keys (
         id,organization_id,name,prefix,key_hash,key_salt,key_iterations,
         hash_version,created_at
       ) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        organization.id,
        name,
        generated.prefix,
        generated.keyHash,
        generated.keySalt,
        generated.keyIterations,
        generated.hashVersion,
        new Date().toISOString(),
      )
      .run();
    return Response.json(
      { id, name, prefix: generated.prefix, key: generated.key },
      { status: 201 },
    );
  } catch (error) {
    return String(error?.message).includes('organization_id, name')
      ? problem(409, 'key_name_exists')
      : problem(503, 'key_creation_failed');
  }
}

async function revokeApiKey(id, environment, organization) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return problem(404, 'api_key_not_found');
  const result = await environment.CUSTOMER_DB.prepare(
    `UPDATE api_keys SET revoked_at = ?
      WHERE id = ? AND organization_id = ? AND revoked_at IS NULL`,
  )
    .bind(new Date().toISOString(), id, organization.id)
    .run();
  return result?.meta?.changes === 1
    ? new Response(undefined, { status: 204 })
    : problem(404, 'api_key_not_found');
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 4096) return;
  const text = await request.text();
  if (text.length > 4096) return;
  try {
    return JSON.parse(text);
  } catch {
    return;
  }
}

async function privileged(session, action) {
  return session.isAdmin
    ? action()
    : problem(403, 'organization_admin_required');
}

function redirectResult(result) {
  return result?.ok
    ? Response.json({ url: result.url })
    : problem(503, result?.error || 'billing_unavailable');
}

function preflight(request, environment) {
  return withCors(
    new Response(undefined, { status: 204 }),
    request,
    environment,
    {
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Max-Age': '600',
    },
  );
}

function withCors(response, request, environment, extra = {}) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin');
  if (origin && allowedOrigins(environment).includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function allowedOrigin(request, environment) {
  const origin = request.headers.get('origin');
  return !origin || allowedOrigins(environment).includes(origin);
}

function allowedOrigins(environment) {
  try {
    const parsed = JSON.parse(environment?.MANAGED_APP_ORIGINS || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((origin) => /^https:\/\/[a-z0-9.-]+$/.test(origin))
      : [];
  } catch {
    return [];
  }
}

function rejected(status, code) {
  return { ok: false, response: problem(status, code) };
}

function problem(status, code) {
  return Response.json({ error: code }, { status });
}
/* eslint-enable n/no-unsupported-features/node-builtins */
