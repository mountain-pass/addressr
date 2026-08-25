import { expect, test } from '@playwright/test';

const viewports = [
  ['base', 1800, false],
  ['xlarge', 1500, true],
  ['large', 1100, true],
  ['small', 600, true],
  ['xsmall', 400, true],
];

test.describe('P137 header landmark semantics preserve responsive layout', () => {
  for (const [name, width, sitsBelowHeader] of viewports) {
    test(`${name} header geometry`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.locator('nav')).toHaveCount(1);
      await expect(page.locator('nav#menu')).toHaveCount(1);

      const status = page.locator('#status-header');
      await expect(status).toHaveCSS('position', 'absolute');
      await expect
        .poll(async () => {
          const top = Number.parseFloat(await status.evaluate((element) => getComputedStyle(element).top));
          if (!sitsBelowHeader) return top === 0;
          const headerHeight = await page.locator('header#header').evaluate(
            (element) => element.getBoundingClientRect().height,
          );
          return Math.abs(top - headerHeight) < 0.1;
        })
        .toBe(true);
      await expect(status.locator('.logo')).toHaveCSS('display', 'block');

      if (name === 'xsmall') {
        const button = page.getByRole('button', { name: 'Menu', exact: true });
        await expect(button).toHaveCSS('overflow', 'hidden');
        await expect
          .poll(() =>
            button.evaluate((element) => {
              const style = getComputedStyle(element);
              const width = Number.parseFloat(style.width);
              return width < 80 && Math.abs(Number.parseFloat(style.textIndent) - width) < 0.1;
            }),
          )
          .toBe(true);
      }
    });
  }
});
