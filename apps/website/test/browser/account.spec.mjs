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
