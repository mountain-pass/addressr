// @jtbd JTBD-002
import { describe, it, expect, vi } from 'vitest';
import { usePostcodeSearch } from './usePostcodeSearch';

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
  json: () => Promise.resolve([
    { postcode: '2000', localities: [{ name: 'SYDNEY' }] },
  ]),
};

describe('usePostcodeSearch', () => {
  it('returns typed postcode results', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT)
      .mockResolvedValueOnce(MOCK_RESULTS);
    const s = usePostcodeSearch({ apiKey: 'k', fetchImpl, debounceMs: 1, minQueryLength: 2 });
    s.setQuery('2000');
    await new Promise((r) => setTimeout(r, 50));
    expect(s.results.value[0].postcode).toBe('2000');
  });
});
