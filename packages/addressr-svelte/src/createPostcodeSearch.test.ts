// @jtbd JTBD-002
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { createPostcodeSearch } from './createPostcodeSearch';

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
  json: () =>
    Promise.resolve([
      { postcode: '2000', localities: [{ name: 'SYDNEY' }] },
      { postcode: '2001', localities: [{ name: 'SYDNEY' }] },
    ]),
};

describe('createPostcodeSearch', () => {
  it('returns typed postcode results', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const store = createPostcodeSearch({ apiKey: 'k', fetchImpl, debounceMs: 1, minQueryLength: 2 });
    store.setQuery('2000');
    await new Promise((r) => setTimeout(r, 50));
    const s = get(store);
    expect(s.results.length).toBe(2);
    expect(s.results[0].postcode).toBe('2000');
  });

  it('clear resets state', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const store = createPostcodeSearch({ apiKey: 'k', fetchImpl, debounceMs: 1, minQueryLength: 2 });
    store.setQuery('2000');
    await new Promise((r) => setTimeout(r, 50));
    store.clear();
    expect(get(store).query).toBe('');
    expect(get(store).results).toEqual([]);
  });
});
