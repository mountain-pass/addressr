// @jtbd JTBD-003
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocalitySearch } from './useLocalitySearch';

const MOCK_ROOT_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: '</localities{?q}>; rel="https://addressr.io/rels/locality-search"',
  }),
  json: () => Promise.resolve({}),
};

const MOCK_LOCALITY_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/localities?q=syd',
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

describe('useLocalitySearch', () => {
  it('returns empty results below minQueryLength', async () => {
    const mockFetch = vi.fn();
    const { result } = renderHook(() =>
      useLocalitySearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 3 }),
    );
    act(() => result.current.setQuery('sy'));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.results).toEqual([]);
  });

  it('fetches and exposes typed locality results', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_LOCALITY_RESPONSE);
    const { result } = renderHook(() =>
      useLocalitySearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 3 }),
    );
    act(() => result.current.setQuery('syd'));
    await waitFor(() => expect(result.current.results.length).toBe(1));
    expect(result.current.results[0].name).toBe('SYDNEY');
    expect(result.current.results[0].state.abbreviation).toBe('NSW');
    expect(result.current.results[0].pid).toBe('loc46e6625bb24d');
  });

  it('clear() resets state', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_LOCALITY_RESPONSE);
    const { result } = renderHook(() =>
      useLocalitySearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 3 }),
    );
    act(() => result.current.setQuery('syd'));
    await waitFor(() => expect(result.current.results.length).toBe(1));
    act(() => result.current.clear());
    expect(result.current.results).toEqual([]);
    expect(result.current.query).toBe('');
  });
});
