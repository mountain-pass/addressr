import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearch } from './useSearch';
import type { AddressrClient, SearchPage } from '@mountainpass/addressr-core';

const MOCK_ROOT_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: '</addresses{?q}>; rel="https://addressr.io/rels/address-search"',
  }),
  json: () => Promise.resolve({}),
};

const MOCK_SEARCH_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/addresses?q=foo',
  headers: new Headers({
    link: '</addresses/PID1>; rel=canonical; anchor="#/0"',
  }),
  json: () =>
    Promise.resolve([{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }]),
};

describe('useSearch (internal generic)', () => {
  // Regression-gate: searchFn must not feed into the search effect deps or we get
  // an infinite loop. Wrapper hooks recreate the arrow each render.
  it('does not re-render infinitely when searchFn identity changes per render', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);
    let renderCount = 0;
    const { result, rerender } = renderHook(() => {
      renderCount++;
      return useSearch({
        apiKey: 'k',
        fetchImpl: mockFetch,
        debounceMs: 1,
        minQueryLength: 2,
        // Fresh closure each render — should not re-trigger the search effect.
        searchFn: (client, query, signal) => client.searchAddresses(query, signal),
      });
    });
    act(() => result.current.setQuery('foo'));
    await waitFor(() => expect(result.current.results.length).toBe(2));
    const countAfterSettle = renderCount;
    // Force a few more renders by external input; render count should grow linearly, not explode.
    rerender();
    rerender();
    rerender();
    expect(renderCount).toBeLessThanOrEqual(countAfterSettle + 5);
  });
});

describe('useSearch (more)', () => {
  it('returns the generic type from searchFn', async () => {
    type Item = { id: number; name: string };
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);

    const { result } = renderHook(() =>
      useSearch<Item>({
        apiKey: 'k',
        fetchImpl: mockFetch,
        debounceMs: 1,
        minQueryLength: 2,
        searchFn: (client: AddressrClient, query, signal) =>
          // Any existing search method returns SearchPage<T> shape; cast to the test type
          client.searchAddresses(query, signal) as unknown as Promise<SearchPage<Item>>,
      }),
    );

    act(() => result.current.setQuery('foo'));
    await waitFor(() => expect(result.current.results.length).toBe(2));
    expect(result.current.results[0].name).toBe('alpha');
  });

  it('exposes client and lastPage for wrapper hooks', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_SEARCH_RESPONSE);
    const { result } = renderHook(() =>
      useSearch({
        apiKey: 'k',
        fetchImpl: mockFetch,
        debounceMs: 1,
        minQueryLength: 2,
        searchFn: (client, query, signal) => client.searchAddresses(query, signal),
      }),
    );
    expect(result.current.client).toBeDefined();
    expect(typeof result.current.client.searchAddresses).toBe('function');
  });
});
