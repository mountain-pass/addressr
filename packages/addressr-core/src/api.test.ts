import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAddressrClient } from './api';

const MOCK_ROOT_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: [
      '</addresses{?q}>; rel="https://addressr.io/rels/address-search"',
      '</postcodes{?q}>; rel="https://addressr.io/rels/postcode-search"',
      '</localities{?q}>; rel="https://addressr.io/rels/locality-search"',
      '</states{?q}>; rel="https://addressr.io/rels/state-search"',
      '</health>; rel="https://addressr.io/rels/health"',
    ].join(', '),
  }),
  json: () => Promise.resolve({}),
};

const MOCK_SEARCH_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/addresses?q=1+george',
  headers: new Headers({
    link: '</addresses/GANSW123>; rel=canonical; anchor="#/0", </addresses?q=1+george&p=2>; rel=next',
  }),
  json: () =>
    Promise.resolve([
      { sla: '1 GEORGE ST, SYDNEY NSW 2000', pid: 'GANSW123', score: 19, highlight: { sla: '<em>1</em> <em>GEORGE</em> ST' } },
    ]),
};

const MOCK_SEARCH_PAGE2_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/addresses?q=1+george&p=2',
  headers: new Headers({
    link: '</addresses/GANSW456>; rel=canonical; anchor="#/0"',
  }),
  json: () =>
    Promise.resolve([
      { sla: '2 GEORGE ST, SYDNEY NSW 2000', pid: 'GANSW456', score: 18, highlight: { sla: '<em>2</em> <em>GEORGE</em> ST' } },
    ]),
};

const MOCK_POSTCODE_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/postcodes?q=2000',
  headers: new Headers({
    link: '</postcodes/2000>; rel=canonical; anchor="#/0"',
  }),
  json: () =>
    Promise.resolve([
      { postcode: '2000', localities: [{ name: 'SYDNEY' }, { name: 'BARANGAROO' }] },
    ]),
};

const MOCK_LOCALITY_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/localities?q=sydney',
  headers: new Headers({
    link: '</localities/loc46e6625bb24d>; rel=canonical; anchor="#/0"',
  }),
  json: () =>
    Promise.resolve([
      {
        name: 'SYDNEY',
        state: { name: 'NEW SOUTH WALES', abbreviation: 'NSW' },
        class: { code: 'G', name: 'GAZETTED LOCALITY' },
        postcode: '2000',
        score: 9.78,
        pid: 'loc46e6625bb24d',
      },
    ]),
};

const MOCK_STATE_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/states?q=NSW',
  headers: new Headers({}),
  json: () =>
    Promise.resolve([{ abbreviation: 'NSW', name: 'NEW SOUTH WALES' }]),
};

const MOCK_DETAIL_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/addresses/GANSW123',
  headers: new Headers({}),
  json: () =>
    Promise.resolve({
      pid: 'GANSW123',
      sla: '1 GEORGE ST, SYDNEY NSW 2000',
      mla: ['1 GEORGE ST', 'SYDNEY NSW 2000'],
      structured: { locality: { name: 'SYDNEY' }, state: { name: 'NEW SOUTH WALES', abbreviation: 'NSW' }, postcode: '2000', confidence: 2 },
    }),
};

describe('createAddressrClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ReturnType<typeof createAddressrClient>;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = createAddressrClient({ apiKey: 'test-key', fetchImpl: mockFetch });
  });

  it('discovers search link from API root and returns SearchPage', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);

    const page = await client.searchAddresses('1 george');
    expect(page.results).toHaveLength(1);
    expect(page.results[0].sla).toBe('1 GEORGE ST, SYDNEY NSW 2000');
  });

  it('returns nextLink when API provides next link relation', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);

    const page = await client.searchAddresses('1 george');
    expect(page.nextLink).not.toBeNull();
  });

  it('returns null nextLink on last page', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_PAGE2_RESPONSE);

    const page = await client.searchAddresses('1 george');
    expect(page.nextLink).toBeNull();
  });

  it('fetches next page via fetchNextPage', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_PAGE2_RESPONSE);

    const page1 = await client.searchAddresses('1 george');
    expect(page1.nextLink).not.toBeNull();

    const page2 = await client.fetchNextPage(page1.nextLink!);
    expect(page2.results).toHaveLength(1);
    expect(page2.results[0].sla).toBe('2 GEORGE ST, SYDNEY NSW 2000');
    expect(page2.nextLink).toBeNull();
  });

  it('sends RapidAPI auth headers', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);

    await client.searchAddresses('test');

    // Both root and search calls should have auth headers
    for (const call of mockFetch.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.headers).toMatchObject({
        'x-rapidapi-key': 'test-key',
        'x-rapidapi-host': 'addressr.p.rapidapi.com',
      });
    }
  });

  it('caches the root discovery', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);

    await client.searchAddresses('first');
    await client.searchAddresses('second');

    // Root should only be fetched once
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 root + 2 searches
  });

  it('follows canonical link for address detail', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE)
      .mockResolvedValueOnce(MOCK_DETAIL_RESPONSE);

    const page = await client.searchAddresses('1 george');
    const detail = await client.getAddressDetail(page.results[0].pid, undefined, page, 0);
    expect(detail.pid).toBe('GANSW123');
    expect(detail.structured.locality.name).toBe('SYDNEY');
  });

  it('falls back to constructed URL when no search context', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_DETAIL_RESPONSE);

    const detail = await client.getAddressDetail('GANSW123');
    expect(detail.pid).toBe('GANSW123');
    expect(detail.structured.locality.name).toBe('SYDNEY');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({}),
    });

    await expect(client.searchAddresses('test')).rejects.toThrow('403');
  });

  it('prefetch eagerly fetches the API root', async () => {
    mockFetch.mockResolvedValueOnce(MOCK_ROOT_RESPONSE);

    await client.prefetch();

    // Should have fetched the root
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('prefetch warms cache so searchAddresses skips root discovery', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);

    await client.prefetch();
    await client.searchAddresses('1 george');

    // 1 root (from prefetch) + 1 search = 2 total, NOT 3
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('prefetch swallows errors so it does not break the app', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    // Should not throw
    await expect(client.prefetch()).resolves.toBeUndefined();
  });

  it('retries search on transient 503 failure', async () => {
    const retryClient = createAddressrClient({
      apiKey: 'test-key',
      fetchImpl: mockFetch,
      retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 5 },
    });

    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable', headers: new Headers({}) })
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);

    const page = await retryClient.searchAddresses('1 george');
    expect(page.results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(3); // root + 503 + success
  });

  it('does not retry when retry is disabled', async () => {
    const noRetryClient = createAddressrClient({
      apiKey: 'test-key',
      fetchImpl: mockFetch,
      retry: false,
    });

    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable', headers: new Headers({}) });

    await expect(noRetryClient.searchAddresses('test')).rejects.toThrow('503');
    expect(mockFetch).toHaveBeenCalledTimes(2); // root + single 503
  });

  describe('searchPostcodes', () => {
    it('discovers postcode-search rel and returns typed results', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_POSTCODE_RESPONSE);

      const page = await client.searchPostcodes('2000');
      expect(page.results).toHaveLength(1);
      expect(page.results[0].postcode).toBe('2000');
      expect(page.results[0].localities[0].name).toBe('SYDNEY');
    });

    it('expands query into the postcode-search template URL', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_POSTCODE_RESPONSE);

      await client.searchPostcodes('2000');

      const searchCall = mockFetch.mock.calls[1];
      const searchUrl = typeof searchCall[0] === 'string' ? searchCall[0] : searchCall[0].url ?? searchCall[0].href;
      expect(searchUrl).toContain('/postcodes');
      expect(searchUrl).toContain('q=2000');
    });

    it('forwards AbortSignal to fetch', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_POSTCODE_RESPONSE);

      const controller = new AbortController();
      await client.searchPostcodes('2000', controller.signal);

      const searchInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(searchInit.signal).toBe(controller.signal);
    });

    it('retries on transient 503 failure', async () => {
      const retryClient = createAddressrClient({
        apiKey: 'test-key',
        fetchImpl: mockFetch,
        retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 5 },
      });
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable', headers: new Headers({}) })
        .mockResolvedValueOnce(MOCK_POSTCODE_RESPONSE);

      const page = await retryClient.searchPostcodes('2000');
      expect(page.results).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('searchLocalities', () => {
    it('discovers locality-search rel and returns typed results', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_LOCALITY_RESPONSE);

      const page = await client.searchLocalities('sydney');
      expect(page.results).toHaveLength(1);
      expect(page.results[0].name).toBe('SYDNEY');
      expect(page.results[0].state.abbreviation).toBe('NSW');
      expect(page.results[0].postcode).toBe('2000');
      expect(page.results[0].pid).toBe('loc46e6625bb24d');
    });

    it('expands query into the locality-search template URL', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_LOCALITY_RESPONSE);

      await client.searchLocalities('sydney');

      const searchCall = mockFetch.mock.calls[1];
      const searchUrl = typeof searchCall[0] === 'string' ? searchCall[0] : searchCall[0].url ?? searchCall[0].href;
      expect(searchUrl).toContain('/localities');
      expect(searchUrl).toContain('q=sydney');
    });

    it('forwards AbortSignal to fetch', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_LOCALITY_RESPONSE);

      const controller = new AbortController();
      await client.searchLocalities('sydney', controller.signal);

      const searchInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(searchInit.signal).toBe(controller.signal);
    });
  });

  describe('searchStates', () => {
    it('discovers state-search rel and returns typed results', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_STATE_RESPONSE);

      const page = await client.searchStates('NSW');
      expect(page.results).toHaveLength(1);
      expect(page.results[0].abbreviation).toBe('NSW');
      expect(page.results[0].name).toBe('NEW SOUTH WALES');
    });

    it('expands query into the state-search template URL', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_STATE_RESPONSE);

      await client.searchStates('NSW');

      const searchCall = mockFetch.mock.calls[1];
      const searchUrl = typeof searchCall[0] === 'string' ? searchCall[0] : searchCall[0].url ?? searchCall[0].href;
      expect(searchUrl).toContain('/states');
      expect(searchUrl).toContain('q=NSW');
    });

    it('forwards AbortSignal to fetch', async () => {
      mockFetch
        .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
        .mockResolvedValueOnce(MOCK_STATE_RESPONSE);

      const controller = new AbortController();
      await client.searchStates('NSW', controller.signal);

      const searchInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(searchInit.signal).toBe(controller.signal);
    });
  });

  it('shares root discovery across all search method variants', async () => {
    mockFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE)
      .mockResolvedValueOnce(MOCK_POSTCODE_RESPONSE)
      .mockResolvedValueOnce(MOCK_LOCALITY_RESPONSE)
      .mockResolvedValueOnce(MOCK_STATE_RESPONSE);

    await client.searchAddresses('test');
    await client.searchPostcodes('2000');
    await client.searchLocalities('sydney');
    await client.searchStates('NSW');

    // Root fetched once; four search fetches.
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('works without apiKey (no RapidAPI headers)', async () => {
    const noKeyFetch = vi.fn();
    const noKeyClient = createAddressrClient({
      apiUrl: 'https://api.addressr.io/',
      fetchImpl: noKeyFetch,
    });

    noKeyFetch
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);

    const page = await noKeyClient.searchAddresses('1 george');
    expect(page.results).toHaveLength(1);

    // Should NOT include RapidAPI headers
    for (const call of noKeyFetch.mock.calls) {
      const init = call[1] as RequestInit;
      const hdrs = init.headers as Record<string, string>;
      expect(hdrs).not.toHaveProperty('x-rapidapi-key');
      expect(hdrs).not.toHaveProperty('x-rapidapi-host');
    }
  });
});
