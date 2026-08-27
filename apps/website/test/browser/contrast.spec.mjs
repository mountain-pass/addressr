import { expect, test } from '@playwright/test';

const channels = (value) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];

const luminance = (colour) => {
  const linear = colour.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (foreground, background) => {
  const values = [luminance(channels(foreground)), luminance(channels(background))]
    .toSorted((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test('primary actions and footer links retain readable contrast', async ({ page }) => {
  await page.goto('/');

  const primary = page.getByRole('link', { name: 'Make your first hosted request' }).first();
  const primaryColours = await primary.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.color, style.backgroundColor];
  });
  expect(contrast(...primaryColours)).toBeGreaterThanOrEqual(4.5);

  const footerLink = page.locator('#footer').getByRole('link', { name: 'Pricing' });
  const footerColours = await footerLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.color, getComputedStyle(element.closest('footer')).backgroundColor];
  });
  expect(contrast(...footerColours)).toBeGreaterThanOrEqual(4.5);
});
