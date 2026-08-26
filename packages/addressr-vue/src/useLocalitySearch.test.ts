// @jtbd JTBD-003
import { describe, it, expect, vi } from 'vitest';
import { useLocalitySearch } from './useLocalitySearch';

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
  json: () => Promise.resolve([
    { name: 'SYDNEY', state: { name: 'New South Wales', abbreviation: 'NSW' }, postcode: '2000', score: 19, pid: 'LOC-1' },
  ]),
};

describe('useLocalitySearch', () => {
  it('returns typed locality results', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const s = useLocalitySearch({ apiKey: 'k', fetchImpl, debounceMs: 1, minQueryLength: 2 });
    s.setQuery('syd');
    await new Promise((r) => setTimeout(r, 50));
    expect(s.results.value[0].name).toBe('SYDNEY');
    expect(s.results.value[0].state.abbreviation).toBe('NSW');
  });
});
