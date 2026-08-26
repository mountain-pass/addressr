// @jtbd JTBD-003
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { createLocalitySearch } from './createLocalitySearch';

const MOCK_ROOT = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: '</localities{?q}>; rel="https://addressr.io/rels/locality-search"',
  }),
  json: () => Promise.resolve({}),
};

const MOCK_RESULTS = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/localities?q=syd',
  headers: new Headers({}),
  json: () =>
    Promise.resolve([
      { name: 'SYDNEY', state: { name: 'New South Wales', abbreviation: 'NSW' }, postcode: '2000', score: 19, pid: 'LOC-1' },
    ]),
};

describe('createLocalitySearch', () => {
  it('returns typed locality results', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const store = createLocalitySearch({ apiKey: 'k', fetchImpl, debounceMs: 1, minQueryLength: 2 });
    store.setQuery('syd');
    await new Promise((r) => setTimeout(r, 50));
    const s = get(store);
    expect(s.results[0].name).toBe('SYDNEY');
    expect(s.results[0].state.abbreviation).toBe('NSW');
  });
});
