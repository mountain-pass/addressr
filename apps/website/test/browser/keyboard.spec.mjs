import { expect, test } from '@playwright/test';

test.describe(
  'ADR-056 scripted Chromium interactions only; not full keyboard, screen-reader, cross-browser or WCAG conformance',
  () => {
    test('the skip link moves focus into content and bypasses repeated navigation', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('.body')).not.toHaveClass(/is-loading/);

      const skipLink = page.getByRole('link', { name: 'Skip to main content' });
      const main = page.locator('main#content');

      await page.keyboard.press('Tab');
      await expect(skipLink).toBeFocused();

      await page.keyboard.press('Enter');
      await expect(main).toBeFocused();

      await page.keyboard.press('Tab');
      await expect.poll(() => main.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    });

    test('the menu keeps focus out of inert content and restores it on Escape', async ({
      page,
    }) => {
      await page.goto('/');

      const opener = page.getByRole('button', { name: 'Menu', exact: true });
      const menu = page.locator('nav#menu');
      const wrapper = page.locator('#wrapper');
      const skipLink = page.getByRole('link', { name: 'Skip to main content' });

      await expect(opener).toHaveAttribute('aria-expanded', 'false');
      await opener.focus();
      await page.keyboard.press('Enter');

      await expect(opener).toHaveAttribute('aria-expanded', 'true');
      await expect(wrapper).toHaveAttribute('inert', '');
      await expect(menu).toBeFocused();

      await page.keyboard.press('Shift+Tab');
      await expect(skipLink).not.toBeFocused();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const active = document.activeElement;
            const menuElement = document.querySelector('#menu');
            const wrapperElement = document.querySelector('#wrapper');
            return (
              (active === document.body ||
                active === document.documentElement ||
                menuElement?.contains(active)) &&
              !wrapperElement?.contains(active)
            );
          }),
        )
        .toBe(true);
      await expect
        .poll(() => wrapper.evaluate((element) => element.contains(document.activeElement)))
        .toBe(false);

      await menu.focus();
      await page.keyboard.press('Tab');
      await expect
        .poll(() => menu.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true);
      await expect
        .poll(() => wrapper.evaluate((element) => element.contains(document.activeElement)))
        .toBe(false);

      await page.keyboard.press('Escape');
      await expect(opener).toHaveAttribute('aria-expanded', 'false');
      await expect(wrapper).not.toHaveAttribute('inert', '');
      await expect(opener).toBeFocused();
    });

    test('menu navigation moves focus to the new page without reclaiming it', async ({
      page,
    }) => {
      await page.goto('/');

      const opener = page.getByRole('button', { name: 'Menu', exact: true });
      await opener.focus();
      await page.keyboard.press('Enter');

      await page.locator('#menu').getByRole('link', { name: 'Pricing' }).press('Enter');
      await expect(page).toHaveURL(/\/pricing\/$/);

      const main = page.locator('main#content');
      await expect(main).toBeFocused();
      await expect(page.locator('#wrapper')).not.toHaveAttribute('inert', '');
      await expect(page.locator('#gatsby-announcer')).toContainText(
        'Navigated to Pricing',
      );

      await page.keyboard.press('Tab');
      await expect
        .poll(() => main.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true);
    });
  },
);
