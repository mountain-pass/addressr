// @jtbd JTBD-004
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStateSearch } from './useStateSearch';

const MOCK_ROOT_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: '</states{?q}>; rel="https://addressr.io/rels/state-search"',
  }),
  json: () => Promise.resolve({}),
};

const MOCK_STATE_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/states?q=NSW',
  headers: new Headers({}),
  json: () =>
    Promise.resolve([
      { abbreviation: 'NSW', name: 'NEW SOUTH WALES' },
      { abbreviation: 'NT', name: 'NORTHERN TERRITORY' },
    ]),
};

describe('useStateSearch', () => {
  it('returns empty results below minQueryLength', async () => {
    const mockFetch = vi.fn();
    const { result } = renderHook(() =>
      useStateSearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 2 }),
    );
    act(() => result.current.setQuery('N'));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.results).toEqual([]);
  });

  it('fetches and exposes typed state results', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_STATE_RESPONSE);
    const { result } = renderHook(() =>
      useStateSearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 2 }),
    );
    act(() => result.current.setQuery('NSW'));
    await waitFor(() => expect(result.current.results.length).toBe(2));
    expect(result.current.results[0].abbreviation).toBe('NSW');
    expect(result.current.results[0].name).toBe('NEW SOUTH WALES');
  });

  it('clear() resets state', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_STATE_RESPONSE);
    const { result } = renderHook(() =>
      useStateSearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 2 }),
    );
    act(() => result.current.setQuery('NSW'));
    await waitFor(() => expect(result.current.results.length).toBe(2));
    act(() => result.current.clear());
    expect(result.current.results).toEqual([]);
  });
});
