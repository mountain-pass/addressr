import { expect, test } from '@playwright/test';

const directApi = 'https://api.addressr.io/**';

const mockAddressr = (page) =>
  page.route(directApi, async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*' };

    switch (url.pathname) {
    case '/': {
      await route.fulfill({
        body: '{}',
        contentType: 'application/json',
        headers: {
          ...headers,
          'access-control-expose-headers': 'link',
          link: [
            '</addresses{?q}>; rel="https://addressr.io/rels/address-search"',
            '</localities{?q}>; rel="https://addressr.io/rels/locality-search"',
            '</postcodes{?q}>; rel="https://addressr.io/rels/postcode-search"',
            '</states{?q}>; rel="https://addressr.io/rels/state-search"',
          ].join(', '),
        },
      });
      break;
    }
    case '/addresses': {
      await route.fulfill({
        headers: {
          ...headers,
          link: '</addresses/TEST>; rel="canonical"; anchor="#/0"',
        },
        json: [
          {
            pid: 'TEST',
            sla: '1 TEST ST, SYDNEY NSW 2000',
            score: 1,
            highlight: { sla: '<em>1 TEST ST</em>, SYDNEY NSW 2000' },
          },
        ],
      });
      break;
    }
    case '/addresses/TEST': {
      await route.fulfill({
        headers,
        json: {
          pid: 'TEST',
          sla: '1 TEST ST, SYDNEY NSW 2000',
          mla: ['1 TEST ST', 'SYDNEY NSW 2000'],
          structured: {
            buildingName: 'TEST BUILDING',
            number: { number: 1 },
            street: { name: 'TEST', type: { code: 'ST', name: 'STREET' } },
            locality: { name: 'SYDNEY' },
            state: { name: 'New South Wales', abbreviation: 'NSW' },
            postcode: '2000',
            confidence: 1,
          },
          geocoding: {
            level: { code: 'ADDRESS', name: 'ADDRESS' },
            geocodes: [{
              default: true,
              type: { code: 'PC', name: 'PROPERTY CENTROID' },
              reliability: { code: '2', name: 'WITHIN ADDRESS SITE' },
              latitude: -33.8688,
              longitude: 151.2093,
            }],
          },
        },
      });
      break;
    }
    case '/localities': {
      await route.fulfill({
        headers,
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
      break;
    }
    case '/postcodes': {
      await route.fulfill({
        headers,
        json: [{ postcode: '2000', localities: [{ name: 'SYDNEY' }] }],
      });
      break;
    }
    case '/states': {
      await route.fulfill({
        headers,
        json: [{ name: 'New South Wales', abbreviation: 'NSW' }],
      });
      break;
    }
    default: {
      await route.abort();
    }
    }
  });

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

    test('all four React autocomplete examples support keyboard selection', async ({
      page,
    }) => {
      await mockAddressr(page);
      await page.goto('/');

      const examples = [
        ['Search Australian addresses', '1 test', 'Selected address'],
        ['Search Australian suburbs and towns', 'syd', 'Selected suburb or town'],
        ['Search Australian postcodes', '200', 'Selected postcode'],
        ['Search Australian states and territories', 'ns', 'Selected state or territory'],
      ];

      for (const [name, query, detailsHeading] of examples) {
        const input = page.getByRole('combobox', { name });
        await expect
          .poll(() =>
            input.evaluate((element) => {
              const style = getComputedStyle(element);
              return [
                style.color,
                style.backgroundColor,
                style.borderColor,
                style.borderRadius,
              ];
            }),
          )
          .toEqual([
            'rgb(255, 255, 255)',
            'rgb(36, 41, 67)',
            'rgb(255, 255, 255)',
            '0px',
          ]);
        await input.fill(query);
        let option = page.getByRole('option');
        await expect(option).toBeVisible();

        await input.press('ArrowDown');
        await expect(input).toBeFocused();
        await expect
          .poll(() =>
            input.evaluate((element) => {
              const style = getComputedStyle(element);
              return [style.color, style.backgroundColor];
            }),
          )
          .toEqual(['rgb(255, 255, 255)', 'rgb(36, 41, 67)']);
        await expect
          .poll(() => input.getAttribute('aria-activedescendant'))
          .toBe(await option.getAttribute('id'));
        await expect(option).toHaveAttribute('aria-selected', 'true');
        const strong = option.locator('strong');
        if ((await strong.count()) > 0) {
          await expect
            .poll(() =>
              strong.evaluate((element) => [
                getComputedStyle(element).color,
                getComputedStyle(element.parentElement).color,
              ]),
            )
            .toEqual(['rgb(36, 41, 67)', 'rgb(36, 41, 67)']);
        }
        await expect
          .poll(() =>
            input.evaluate((element) => {
              const style = getComputedStyle(element);
              return [style.outlineColor, style.boxShadow];
            }),
          )
          .toEqual([
            'rgb(155, 241, 255)',
            'rgb(155, 241, 255) 0px 0px 0px 4px',
          ]);

        await input.press('Escape');
        await expect(input).toBeFocused();
        await expect(input).toHaveAttribute('aria-expanded', 'false');

        await input.press('ArrowDown');
        option = page.getByRole('option');
        await expect(option).toHaveAttribute('aria-selected', 'true');
        await input.press('Enter');
        await expect(input).toBeFocused();
        await expect(page.getByRole('heading', { name: detailsHeading })).toBeVisible();
      }

      const addressDetails = page.locator('.autocomplete-details', {
        has: page.getByRole('heading', { name: 'Selected address' }),
      });
      await expect(addressDetails).toContainText('TEST BUILDING');
      await expect(addressDetails).toContainText('PROPERTY CENTROID');
      const mapLink = addressDetails.getByRole('link', {
        name: 'View 1 TEST ST, SYDNEY NSW 2000 on OpenStreetMap',
      });
      await expect(mapLink).toBeVisible();
      const map = addressDetails.getByTitle('Map showing 1 TEST ST, SYDNEY NSW 2000');
      await expect(map).toHaveAttribute('loading', 'lazy');
      await expect(map).toHaveAttribute('tabindex', '-1');
      await expect(map).toHaveAttribute('src', /openstreetmap\.org\/export\/embed\.html/);

      await expect(page.locator('.autocomplete-details', { hasText: 'Selected suburb or town' })).toContainText('Locality ID');
      await expect(page.locator('.autocomplete-details', { hasText: 'Selected postcode' })).toContainText('SYDNEY');
      await expect(page.locator('.autocomplete-details', { hasText: 'Selected state or territory' })).toContainText('NSW');

      await page.getByRole('combobox', { name: examples[0][0] }).focus();
      await page.keyboard.press('Tab');
      await expect(mapLink).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('combobox', { name: examples[1][0] })).toBeFocused();

      const inputs = examples.map(([name]) => page.getByRole('combobox', { name }));
      for (let index = 1; index < inputs.length - 1; index += 1) {
        await inputs[index].focus();
        await page.keyboard.press('Tab');
        await expect(inputs[index + 1]).toBeFocused();
      }
    });
  },
);
