// @jtbd JTBD-004
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { createStateSearch } from './createStateSearch';

const MOCK_ROOT = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: '</states{?q}>; rel="https://addressr.io/rels/state-search"',
  }),
  json: () => Promise.resolve({}),
};

const MOCK_RESULTS = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/states?q=n',
  headers: new Headers({}),
  json: () =>
    Promise.resolve([
      { name: 'New South Wales', abbreviation: 'NSW' },
      { name: 'Northern Territory', abbreviation: 'NT' },
    ]),
};

describe('createStateSearch', () => {
  it('returns typed state results', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const store = createStateSearch({ apiKey: 'k', fetchImpl, debounceMs: 1, minQueryLength: 1 });
    store.setQuery('n');
    await new Promise((r) => setTimeout(r, 50));
    const s = get(store);
    expect(s.results.length).toBe(2);
    expect(s.results[0].abbreviation).toBe('NSW');
  });
});
