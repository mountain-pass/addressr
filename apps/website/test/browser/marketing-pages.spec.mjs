import { expect, test } from '@playwright/test';

test('the hosted journey leads from the homepage to the API guide', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Make your first hosted request' }).first().click();
  await expect(page).toHaveURL(/\/quick-start\/#hosted$/);
  await expect(page.getByRole('heading', { name: 'Hosted API' })).toBeVisible();

  await page.getByRole('link', { name: 'Read the Addressr API guide' }).click();
  await expect(page).toHaveURL(/\/api-docs\/$/);
  await expect(page.getByRole('heading', { name: 'Addressr API guide' })).toBeVisible();
  await expect(page.getByText('GET /addresses?q={query}', { exact: true })).toBeVisible();
});

test('marketing pages reflow at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });

  for (const route of ['/', '/pricing/', '/quick-start/', '/api-docs/']) {
    await page.goto(route);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
});

test('overflowing tables and code examples can receive keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/pricing/');

  const table = page.getByRole('region', { name: 'Addressr delivery option comparison' });
  await table.focus();
  await expect(table).toBeFocused();
  expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  await page.goto('/quick-start/');
  const code = page.getByRole('region', { name: 'Hosted address search command' });
  await code.focus();
  await expect(code).toBeFocused();
});

test('all four demos render details from the deployed API contract', async ({ page }) => {
  test.skip(!process.env.RAPIDAPI_KEY, 'RAPIDAPI_KEY is required for the live contract check');

  await page.route('https://api.addressr.io/**', async (route) => {
    const source = new URL(route.request().url());
    const response = await route.fetch({
      url: `https://addressr.p.rapidapi.com${source.pathname}${source.search}`,
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'addressr.p.rapidapi.com',
      },
    });
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'link',
      },
    });
  });

  await page.goto('/');
  const examples = [
    ['Search Australian addresses', '300 Barangaroo Ave', 'Selected address'],
    ['Search Australian suburbs and towns', 'Sydney', 'Selected suburb or town'],
    ['Search Australian postcodes', '2000', 'Selected postcode'],
    ['Search Australian states and territories', 'NSW', 'Selected state or territory'],
  ];

  for (const [label, query, heading] of examples) {
    const input = page.getByRole('combobox', { name: label });
    await input.fill(query);
    await expect(page.getByRole('option').first()).toBeVisible();
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});
