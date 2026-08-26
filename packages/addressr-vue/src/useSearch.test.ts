import { describe, it, expect, vi } from 'vitest';
import { useSearch } from './useSearch';

const MOCK_ROOT = {
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
  json: () => Promise.resolve([{ postcode: '2000', localities: [{ name: 'SYDNEY' }] }]),
};

describe('useSearch', () => {
  it('starts with empty state', () => {
    const { query, results, isLoading, error } = useSearch<{ postcode: string }>({
      apiKey: 'k',
      fetchImpl: vi.fn(),
      debounceMs: 1,
      searchFn: (client, q, s) => client.searchPostcodes(q, s) as never,
    });
    expect(query.value).toBe('');
    expect(results.value).toEqual([]);
    expect(isLoading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it('fetches when setQuery is called', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const { setQuery, results } = useSearch<{ postcode: string }>({
      apiKey: 'k',
      fetchImpl,
      debounceMs: 1,
      minQueryLength: 2,
      searchFn: (c, q, s) => c.searchPostcodes(q, s) as never,
    });
    setQuery('2000');
    await new Promise((r) => setTimeout(r, 50));
    expect(results.value.length).toBe(1);
  });

  it('does not search below minQueryLength', async () => {
    const fetchImpl = vi.fn();
    const { setQuery, results, isLoading } = useSearch<{ postcode: string }>({
      apiKey: 'k',
      fetchImpl,
      debounceMs: 1,
      minQueryLength: 3,
      searchFn: (c, q, s) => c.searchPostcodes(q, s) as never,
    });
    setQuery('20');
    await new Promise((r) => setTimeout(r, 20));
    expect(results.value).toEqual([]);
    expect(isLoading.value).toBe(false);
  });

  it('clear resets state', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const { setQuery, clear, query, results } = useSearch<{ postcode: string }>({
      apiKey: 'k',
      fetchImpl,
      debounceMs: 1,
      minQueryLength: 2,
      searchFn: (c, q, s) => c.searchPostcodes(q, s) as never,
    });
    setQuery('2000');
    await new Promise((r) => setTimeout(r, 50));
    clear();
    expect(query.value).toBe('');
    expect(results.value).toEqual([]);
  });
});
