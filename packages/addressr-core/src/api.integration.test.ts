// @jtbd JTBD-001 (contract) + JTBD-002/003/004 (rel discovery)
import { describe, it, expect } from 'vitest';
import { createIntegrationClient } from '../test/integration-setup';
import { glowUpFetchWithLinks } from '@windyroad/fetch-link';

describe('addressr live API integration', () => {
  describe('root caching contract', () => {
    it('sends Cache-Control with a non-zero max-age on the root response', async () => {
      const apiKey = process.env.ADDRESSR_RAPIDAPI_KEY!;
      const response = await fetch('https://addressr.p.rapidapi.com/', {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'addressr.p.rapidapi.com',
        },
      });
      expect(response.ok).toBe(true);
      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).not.toBeNull();
      // Accept any cacheable directive: explicit max-age, or public/private with a TTL
      const maxAgeMatch = cacheControl!.match(/max-age=(\d+)/);
      expect(maxAgeMatch).not.toBeNull();
      expect(Number(maxAgeMatch![1])).toBeGreaterThan(0);
      // Reject no-store or no-cache — those defeat the browser-cache scenario ADR 007 protects
      expect(cacheControl).not.toMatch(/\bno-store\b/);
      expect(cacheControl).not.toMatch(/\bno-cache\b/);
    }, 30000);
  });

  describe('root discovery', () => {
    it('advertises search rels via HATEOAS Link header', async () => {
      const apiKey = process.env.ADDRESSR_RAPIDAPI_KEY!;
      const fetchLink = glowUpFetchWithLinks(((url: RequestInfo | URL, init?: RequestInit) =>
        fetch(url, {
          ...init,
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': 'addressr.p.rapidapi.com',
            ...init?.headers,
          },
        })) as typeof fetch);

      // RapidAPI edge caches the root response and serves a stale Link header
      // missing newer rels. Any query param busts that cache; the addressr server
      // ignores unknown params on the root.
      const root = await fetchLink(`https://addressr.p.rapidapi.com/?_rapidapi-cache-bust=${Date.now()}`);
      expect(root.ok).toBe(true);

      const allLinks = root.links();
      const rels = allLinks.map((l) => l.rel).sort();

      // eslint-disable-next-line no-console
      console.log('DISCOVERED RELS:', JSON.stringify(rels, null, 2));

      expect(rels.length).toBeGreaterThan(0);
      expect(rels).toContain('https://addressr.io/rels/address-search');
    });
  });

  describe('searchAddresses', () => {
    it('returns at least one result for a known address', async () => {
      const client = createIntegrationClient();
      const page = await client.searchAddresses('100 Pitt St');
      expect(page.results.length).toBeGreaterThan(0);
      expect(page.results[0]).toHaveProperty('sla');
      expect(page.results[0]).toHaveProperty('highlight');
    }, 30000);
  });

  describe('searchPostcodes', () => {
    it('returns at least one result for a known postcode', async () => {
      const client = createIntegrationClient();
      const page = await client.searchPostcodes('2000');
      expect(page.results.length).toBeGreaterThan(0);
      const [first] = page.results;
      expect(typeof first.postcode).toBe('string');
      expect(first.postcode).toBe('2000');
      expect(Array.isArray(first.localities)).toBe(true);
      expect(first.localities.length).toBeGreaterThan(0);
      expect(typeof first.localities[0].name).toBe('string');
    }, 30000);
  });

  describe('searchLocalities', () => {
    it('returns at least one result for a known locality', async () => {
      const client = createIntegrationClient();
      const page = await client.searchLocalities('sydney');
      expect(page.results.length).toBeGreaterThan(0);
      const [first] = page.results;
      expect(typeof first.name).toBe('string');
      expect(first.state).toBeDefined();
      expect(typeof first.state.abbreviation).toBe('string');
      expect(typeof first.state.name).toBe('string');
      expect(typeof first.postcode).toBe('string');
      expect(typeof first.score).toBe('number');
      expect(typeof first.pid).toBe('string');
    }, 30000);
  });

  describe('searchStates', () => {
    it('returns at least one result for a known state', async () => {
      const client = createIntegrationClient();
      const page = await client.searchStates('NSW');
      expect(page.results.length).toBeGreaterThan(0);
      const [first] = page.results;
      expect(typeof first.abbreviation).toBe('string');
      expect(typeof first.name).toBe('string');
    }, 30000);
  });
});
