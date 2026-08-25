import { expect, test } from '@playwright/test';

const rgba = (value) => {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return [...channels.slice(0, 3), channels[3] ?? 1];
};

const composite = (foreground, background, alpha) =>
  foreground.map((channel, index) =>
    channel * alpha + background[index] * (1 - alpha),
  );

const luminance = (colour) => {
  const linear = colour.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

test('the six accent tiles keep white text above 4.5:1 over any image', async ({
  page,
}) => {
  await page.goto('/');

  const tiles = await page.locator('.tiles article').evaluateAll((articles) =>
    articles.slice(0, 6).map((article) => {
      const accent = getComputedStyle(article, '::before');
      const scrim = getComputedStyle(article, '::after');
      const header = getComputedStyle(article.querySelector('header'));
      const link = article.querySelector('.link.primary');
      return {
        accent: accent.backgroundColor,
        accentOpacity: Number(accent.opacity),
        accentZ: Number(accent.zIndex),
        scrim: scrim.backgroundColor,
        scrimZ: Number(scrim.zIndex),
        text: header.color,
        textZ: Number(header.zIndex),
        linkZ: link ? Number(getComputedStyle(link).zIndex) : null,
      };
    }),
  );

  expect(tiles).toHaveLength(6);
  for (const tile of tiles) {
    expect(tile.accentZ).toBeLessThan(tile.scrimZ);
    expect(tile.scrimZ).toBeLessThan(tile.textZ);
    if (tile.linkZ !== null) expect(tile.textZ).toBeLessThan(tile.linkZ);
    expect(tile.text).toBe('rgb(255, 255, 255)');

    const [accentR, accentG, accentB] = rgba(tile.accent);
    const [scrimR, scrimG, scrimB, scrimAlpha] = rgba(tile.scrim);
    const accentOverWhite = composite(
      [accentR, accentG, accentB],
      [255, 255, 255],
      tile.accentOpacity,
    );
    const background = composite(
      [scrimR, scrimG, scrimB],
      accentOverWhite,
      scrimAlpha,
    );
    const ratio = 1.05 / (luminance(background) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
