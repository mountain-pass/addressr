import { expect, test } from '@playwright/test';
import {
  analyseReachability,
  builtPages,
  ownedSelectors,
} from '../css-reachability.mjs';

const selectedAddress = {
  pid: 'TEST',
  sla: '1 TEST ST, SYDNEY NSW 2000',
  mla: ['1 TEST ST', 'SYDNEY NSW 2000'],
  smla: ['1 TEST ST', 'SYDNEY NSW 2000'],
  structured: {
    locality: { name: 'SYDNEY' },
    number: { number: 1 },
    postcode: '2000',
    state: { name: 'NEW SOUTH WALES' },
    street: { name: 'TEST', type: { code: 'ST' } },
  },
  geocoding: { level: { name: 'ADDRESS' }, geocodes: [] },
};

test('site CSS reaches emitted markup in both directions across hydrated states', async ({ page }) => {
  await page.route('https://api.addressr.io/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') {
      await route.fulfill({
        body: '{}',
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'link',
          link: [
            '</addresses{?q}>; rel="https://addressr.io/rels/address-search"',
            '</localities{?q}>; rel="https://addressr.io/rels/locality-search"',
          ].join(', '),
        },
      });
    } else if (url.pathname === '/addresses') {
      await route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json: [
          {
            pid: 'TEST',
            sla: '1 TEST ST, SYDNEY NSW 2000',
            highlight: { sla: '<em>1 TEST ST</em>, SYDNEY NSW 2000' },
          },
        ],
      });
    } else if (url.pathname === '/localities') {
      await route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json: [
          {
            name: 'SYDNEY',
            state: { name: 'New South Wales', abbreviation: 'NSW' },
            postcode: '2000',
            score: 1,
            pid: 'LOCALITY',
          },
        ],
      });
    } else {
      await route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json: selectedAddress,
      });
    }
  });

  const pages = builtPages();
  for (const route of ['/', '/404/', '/api-docs/', '/download/', '/pricing/', '/quick-start/']) {
    await page.goto(route);
    pages.push([`${route} settled`, await page.content()]);

    if (route !== '/') continue;
    const menuButton = page.getByRole('button', { name: 'Menu', exact: true });
    await menuButton.click();
    pages.push(['/ menu open', await page.content()]);
    await page.keyboard.press('Escape');

    const search = page.getByRole('combobox', {
      name: 'Search Australian addresses',
    });
    await search.fill('1 Test Street');
    await page.getByRole('option').waitFor();
    await page.keyboard.press('ArrowDown');
    pages.push(['/ suggestions highlighted', await page.content()]);
    await page.keyboard.press('Enter');
    await page.getByText('Selected: 1 TEST ST, SYDNEY NSW 2000').waitFor();
    pages.push(['/ address selected', await page.content()]);

    const locality = page.getByRole('combobox', {
      name: 'Search Australian suburbs and towns',
    });
    await locality.fill('syd');
    await page.getByRole('option').waitFor();
    pages.push(['/ locality suggestion', await page.content()]);
  }

  const result = analyseReachability({ pages, selectors: ownedSelectors() });
  expect(result.unsupported, 'site CSS contains selectors the checker cannot evaluate').toEqual([]);
  expect(
    result.forward,
    'emitted elements carry site styling tokens but match no site-authored selector',
  ).toEqual([]);
  expect(result.reverse, 'site-authored selectors match no emitted element/state').toEqual([]);
});
