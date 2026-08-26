// Internal generic store — shared by createAddressSearch and the three narrower stores per ADR 006.
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { createSearch } from './createSearch';

const MOCK_ROOT_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: '</postcodes{?q}>; rel="https://addressr.io/rels/postcode-search"',
  }),
  json: () => Promise.resolve({}),
};

const MOCK_RESULTS = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/postcodes?q=2000',
  headers: new Headers({}),
  json: () =>
    Promise.resolve([
      { postcode: '2000', localities: [{ name: 'SYDNEY' }] },
    ]),
};

describe('createSearch', () => {
  it('starts with empty state', () => {
    const store = createSearch<{ postcode: string }>({
      apiKey: 'k',
      fetchImpl: vi.fn(),
      debounceMs: 1,
      searchFn: (client, q, s) => client.searchPostcodes(q, s) as never,
    });
    const state = get(store);
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('calls searchFn with pinned method when query set', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const searchFn = vi.fn((client, q, s) => client.searchPostcodes(q, s) as never);
    const store = createSearch({
      apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 2, searchFn,
    });
    store.setQuery('2000');
    await new Promise((r) => setTimeout(r, 50));
    const state = get(store);
    expect(state.results.length).toBe(1);
    expect(searchFn).toHaveBeenCalled();
  });

  it('clear() resets state', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const store = createSearch<{ postcode: string }>({
      apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 2,
      searchFn: (c, q, s) => c.searchPostcodes(q, s) as never,
    });
    store.setQuery('2000');
    await new Promise((r) => setTimeout(r, 50));
    store.clear();
    const state = get(store);
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
  });

  it('does not search below minQueryLength', async () => {
    const mockFetch = vi.fn();
    const store = createSearch<{ postcode: string }>({
      apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 3,
      searchFn: (c, q, s) => c.searchPostcodes(q, s) as never,
    });
    store.setQuery('20');
    await new Promise((r) => setTimeout(r, 20));
    const state = get(store);
    expect(state.results).toEqual([]);
    expect(state.isLoading).toBe(false);
  });
});
