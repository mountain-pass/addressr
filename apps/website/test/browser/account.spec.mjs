import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.addressr.io/managed/config', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ available: false, plans: [] }),
    });
  });
});

const installSignedInClerk = async (page) => {
  await page.addInitScript(() => {
    const organization = { id: 'org_test', name: 'Test organisation' };
    const membership = { organization, role: 'org:admin', permissions: [] };
    const user = { id: 'user_test', organizationMemberships: [membership] };
    const session = {
      id: 'session_test',
      status: 'active',
      user,
      getToken: async () => 'test-token',
      lastActiveToken: { jwt: { claims: {} } },
      factorVerificationAge: null,
    };
    const resources = {
      client: { id: 'client_test' },
      user,
      session,
      organization,
    };
    const clerk = {
      loaded: true,
      status: 'ready',
      ...resources,
      __internal_lastEmittedResources: resources,
      __internal_state: resources,
      addListener(callback, options) {
        if (!options?.skipInitialEmit) callback(resources);
        return () => {};
      },
      on(event, callback) {
        if (event === 'status') callback('ready');
        return () => {};
      },
      off() {},
      telemetry: { record() {} },
    };
    Object.defineProperty(globalThis, 'Clerk', {
      configurable: true,
      value: new Proxy(clerk, {
        get(target, property) {
          if (property === 'then') return;
          if (Reflect.has(target, property)) return Reflect.get(target, property);
          return () => {};
        },
      }),
    });
  });
};

test('account page explains the managed-channel fallback', async ({ page }) => {
  await page.goto('/account/');

  await expect(
    page.getByRole('heading', {
      name: 'Addressr accounts are not available yet',
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Account management is not available yet.' }),
  ).toHaveText('Account management is not available yet.');
  await expect(
    page.getByRole('link', { name: 'Review Addressr plans on RapidAPI' }),
  ).toHaveAttribute('href', /rapidapi\.com/);
});

for (const [outcome, notice] of [
  ['success', 'Checkout completed. Your subscription is updating.'],
  ['cancelled', 'Checkout was cancelled. No plan change was made.'],
]) {
  test(`account page announces a ${outcome} Stripe return`, async ({ page }) => {
    await page.goto(`/account/?checkout=${outcome}`);

    await expect(page.getByRole('status').filter({ hasText: notice })).toHaveText(notice);
  });
}

test('account page preserves the working skip link', async ({ page }) => {
  await page.goto('/account/');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('main#content')).toBeFocused();
});

test('account page reflows at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/account/');
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test('focuses the API key instruction after creating a key', async ({ page }) => {
  await installSignedInClerk(page);
  await page.route('https://api.addressr.io/managed/config', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        available: true,
        clerkPublishableKey:
          'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk',
        plans: [],
      }),
    });
  });
  await page.route('https://api.addressr.io/managed/account', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        organization: { clerkId: 'org_test', canManage: true },
        subscription: null,
        keys: [],
      }),
    });
  });
  await page.route('https://api.addressr.io/managed/api-keys', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 'key_test', key: 'addressr_test_key' }),
    });
  });
  await page.goto('/account/');

  await page.getByLabel('Key name').fill('Website');
  await page.getByRole('button', { name: 'Create API key' }).click();

  const instruction = page.getByRole('heading', {
    level: 3,
    name: 'Copy this API key now',
  });
  await expect(instruction).toBeFocused();
  await expect(page.locator('.account-new-key')).not.toBeFocused();
  await expect(page.getByLabel('New API key')).toHaveValue('addressr_test_key');
});
