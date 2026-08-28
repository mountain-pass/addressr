import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeSession, handleManagedRequest } from './managed-account.mjs';

/* eslint-disable unicorn/no-null -- D1 and Clerk represent absent persisted/session fields as null. */

const APP_ORIGIN = 'https://app.addressr.io';

describe('managed account boundary', () => {
  it('publishes only sanitized runtime plan metadata to the allowed app', async () => {
    const response = await handleManagedRequest(
      request('/managed/config'),
      environment(),
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      APP_ORIGIN,
    );
    assert.deepEqual(await response.json(), {
      available: true,
      clerkPublishableKey: 'pk_test_addressr',
      plans: [{ key: 'developer', name: 'Developer' }],
    });
  });

  it('rejects an untrusted browser origin before Clerk authentication', async () => {
    let isAuthenticated = false;
    const response = await handleManagedRequest(
      request('/managed/account', { origin: 'https://attacker.example' }),
      environment(),
      {
        clerk: {
          async authenticateRequest() {
            isAuthenticated = true;
          },
        },
      },
    );

    assert.equal(response.status, 403);
    assert.equal(isAuthenticated, false);
  });

  it('requires an active organization in the verified Clerk session', async () => {
    const result = await authorizeSession(
      request('/managed/account'),
      environment(),
      {
        async authenticateRequest() {
          return authenticatedState({ orgId: null, orgRole: null });
        },
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.response.status, 403);
    assert.deepEqual(await result.response.json(), {
      error: 'active_organization_required',
    });
  });

  it('does not let an organization member create an API key', async () => {
    const database = managedDatabase();
    const response = await handleManagedRequest(
      request('/managed/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'Production' }),
      }),
      environment(database),
      { clerk: clerkFor({ orgRole: 'org:member' }) },
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'organization_admin_required',
    });
    assert.equal(database.apiKeyInsert, undefined);
  });

  it('returns an API key once while storing only its hash in the active organization', async () => {
    const database = managedDatabase();
    const response = await handleManagedRequest(
      request('/managed/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'Production' }),
      }),
      environment(database),
      { clerk: clerkFor({ orgRole: 'org:admin' }) },
    );
    const created = await response.json();

    assert.equal(response.status, 201);
    assert.match(created.key, /^addr_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{32,}$/);
    assert.equal(database.apiKeyInsert[1], 'org-addressr');
    assert.equal(database.apiKeyInsert[2], 'Production');
    assert.equal(database.apiKeyInsert.includes(created.key), false);
    assert.notEqual(database.apiKeyInsert[4], created.key);
  });

  it('cannot revoke an API key outside the active organization', async () => {
    const database = managedDatabase({ revokeChanges: 0 });
    const response = await handleManagedRequest(
      request('/managed/api-keys/00000000-0000-4000-8000-000000000001', {
        method: 'DELETE',
      }),
      environment(database),
      { clerk: clerkFor({ orgRole: 'org:admin' }) },
    );

    assert.equal(response.status, 404);
    assert.deepEqual(database.revokeBind.slice(1), [
      '00000000-0000-4000-8000-000000000001',
      'org-addressr',
    ]);
  });
});

function request(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('origin', options.origin || APP_ORIGIN);
  if (options.body) headers.set('content-type', 'application/json');
  return new Request(`https://api.addressr.io${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });
}

function environment(database = managedDatabase()) {
  return {
    CUSTOMER_DB: database,
    CLERK_PUBLISHABLE_KEY: 'pk_test_addressr',
    CLERK_JWT_KEY: 'public-key',
    MANAGED_APP_ORIGINS: JSON.stringify([APP_ORIGIN]),
    STRIPE_SECRET_KEY: 'sk_test_addressr',
    STRIPE_WEBHOOK_SECRET: 'whsec_addressr',
    STRIPE_METER_EVENT_NAME: 'addressr_request',
    STRIPE_PAYMENT_METHOD_TYPES: '["card"]',
    STRIPE_PLAN_CATALOGUE: JSON.stringify({
      developer: {
        name: '  Developer  ',
        priceId: 'price_developer',
        quota: 1000,
      },
      invalid: { name: 'Never exposed', priceId: 'product_wrong', quota: 1000 },
    }),
  };
}

function clerkFor(auth) {
  return {
    async authenticateRequest() {
      return authenticatedState(auth);
    },
  };
}

function authenticatedState({
  orgId = 'org_clerk_addressr',
  orgRole = 'org:admin',
} = {}) {
  return {
    isAuthenticated: true,
    toAuth() {
      return { orgId, orgRole, userId: 'user_addressr' };
    },
  };
}

function managedDatabase({ revokeChanges = 1 } = {}) {
  const database = {
    apiKeyInsert: undefined,
    revokeBind: undefined,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes('INSERT INTO api_keys')) {
                database.apiKeyInsert = values;
              }
              if (sql.includes('UPDATE api_keys')) {
                database.revokeBind = values;
                return { meta: { changes: revokeChanges } };
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              if (sql.includes('FROM organizations')) {
                return {
                  id: 'org-addressr',
                  clerk_organization_id: 'org_clerk_addressr',
                  stripe_customer_id: null,
                  plan_key: null,
                  subscription_status: null,
                  quota_limit: null,
                  quota_used: null,
                  quota_period: null,
                  cancel_at_period_end: 0,
                };
              }
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };
  return database;
}
/* eslint-enable unicorn/no-null */
