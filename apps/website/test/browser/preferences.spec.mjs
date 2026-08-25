import { expect, test } from '@playwright/test';

test('the menu keeps a visible label in forced-colors mode at 360px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');

  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS('text-indent', '0px');
  await expect(menu).toContainText('Menu');
  await expect
    .poll(() =>
      menu.evaluate((element) => ({
        before: getComputedStyle(element, '::before').display,
        after: getComputedStyle(element, '::after').display,
      })),
    )
    .toEqual({ before: 'none', after: 'none' });
});

test('the ribbon keeps a visible outline in forced-colors mode', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 640 });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');

  const ribbon = page.locator('.ribbon');
  await expect(ribbon).toBeVisible();
  await expect
    .poll(() =>
      ribbon.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderColour: style.borderTopColor,
          borderStyle: style.borderTopStyle,
          borderWidth: style.borderTopWidth,
          colour: style.color,
          before: getComputedStyle(element, '::before').display,
          after: getComputedStyle(element, '::after').display,
        };
      }),
    )
    .toMatchObject({
      borderStyle: 'solid',
      borderWidth: '1px',
      before: 'none',
      after: 'none',
    });
  const colours = await ribbon.evaluate((element) => ({
    border: getComputedStyle(element).borderTopColor,
    text: getComputedStyle(element).color,
  }));
  expect(colours.border).toBe(colours.text);
});

test('reduced-motion removes the site transitions and animations', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const styles = await page.locator('a').first().evaluate((element) => ({
    animationDelay: getComputedStyle(element).animationDelay,
    animationDuration: getComputedStyle(element).animationDuration,
    transitionDelay: getComputedStyle(element).transitionDelay,
    transitionDuration: getComputedStyle(element).transitionDuration,
  }));
  expect(styles).toEqual({
    animationDelay: '0s',
    animationDuration: '0s',
    transitionDelay: '0s',
    transitionDuration: '0s',
  });
});
