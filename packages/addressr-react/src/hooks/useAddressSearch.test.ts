import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAddressSearch } from './useAddressSearch';

const MOCK_ROOT_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: '</addresses{?q}>; rel="https://addressr.io/rels/address-search"',
  }),
  json: () => Promise.resolve({}),
};

const makeMockSearchResponse = (hasNext = true) => ({
  ok: true,
  url: 'https://addressr.p.rapidapi.com/addresses?q=1+george',
  headers: new Headers(hasNext ? {
    link: '</addresses/GANSW123>; rel=canonical; anchor="#/0", </addresses?q=1+george&p=2>; rel=next',
  } : {
    link: '</addresses/GANSW123>; rel=canonical; anchor="#/0"',
  }),
  json: () =>
    Promise.resolve([
      {
        sla: '1 GEORGE ST, SYDNEY NSW 2000',
        pid: 'GANSW123',
        score: 19,
        highlight: { sla: '<em>1</em> <em>GEORGE</em> ST' },
      },
    ]),
});

const makeMockPage2Response = () => ({
  ok: true,
  url: 'https://addressr.p.rapidapi.com/addresses?q=1+george&p=2',
  headers: new Headers({
    link: '</addresses/GANSW456>; rel=canonical; anchor="#/0"',
  }),
  json: () =>
    Promise.resolve([
      {
        sla: '2 GEORGE ST, SYDNEY NSW 2000',
        pid: 'GANSW456',
        score: 18,
        highlight: { sla: '<em>2</em> <em>GEORGE</em> ST' },
      },
    ]),
});

const MOCK_DETAIL_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/addresses/GANSW123',
  headers: new Headers({}),
  json: () =>
    Promise.resolve({
      pid: 'GANSW123',
      sla: '1 GEORGE ST, SYDNEY NSW 2000',
      mla: ['1 GEORGE ST', 'SYDNEY NSW 2000'],
      structured: {
        locality: { name: 'SYDNEY' },
        state: { name: 'NSW', abbreviation: 'NSW' },
        postcode: '2000',
        confidence: 2,
      },
    }),
};

describe('useAddressSearch', () => {
  function renderSearchHook(mockFetch: ReturnType<typeof vi.fn>) {
    return renderHook(() =>
      useAddressSearch({
        apiKey: 'test-key',
        fetchImpl: mockFetch,
        debounceMs: 10, // Short debounce for tests
        minQueryLength: 3,
      }),
    );
  }

  it('starts with empty state', () => {
    const mockFetch = vi.fn();
    const { result } = renderSearchHook(mockFetch);
    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.selectedAddress).toBeNull();
  });

  it('prefetches API root on mount', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(MOCK_ROOT_RESPONSE);
    renderSearchHook(mockFetch);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  it('does not search when query is too short', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(MOCK_ROOT_RESPONSE);
    const { result } = renderSearchHook(mockFetch);

    act(() => result.current.setQuery('ab'));

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 50));
    // Only the prefetch call should have happened, no search call
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.results).toEqual([]);
  });

  it('searches after debounce', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(makeMockSearchResponse());

    const { result } = renderSearchHook(mockFetch);

    act(() => result.current.setQuery('1 george'));

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
    });
    expect(result.current.results[0].sla).toBe('1 GEORGE ST, SYDNEY NSW 2000');
  });

  it('selects an address and fetches detail', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_DETAIL_RESPONSE);

    const { result } = renderSearchHook(mockFetch);

    await act(() => result.current.selectAddress('GANSW123'));

    expect(result.current.selectedAddress?.pid).toBe('GANSW123');
  });

  it('clears all state', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(makeMockSearchResponse());

    const { result } = renderSearchHook(mockFetch);

    act(() => result.current.setQuery('1 george'));
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    act(() => result.current.clear());

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.selectedAddress).toBeNull();
  });

  it('hasMore is true when next link exists', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(makeMockSearchResponse(true));

    const { result } = renderSearchHook(mockFetch);

    act(() => result.current.setQuery('1 george'));
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    expect(result.current.hasMore).toBe(true);
  });

  it('hasMore is false on last page', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(makeMockSearchResponse(false));

    const { result } = renderSearchHook(mockFetch);

    act(() => result.current.setQuery('1 george'));
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    expect(result.current.hasMore).toBe(false);
  });

  it('loadMore appends results from next page', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(makeMockSearchResponse(true))
      .mockResolvedValueOnce(makeMockPage2Response());

    const { result } = renderSearchHook(mockFetch);

    act(() => result.current.setQuery('1 george'));
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    await act(() => result.current.loadMore());

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0].pid).toBe('GANSW123');
    expect(result.current.results[1].pid).toBe('GANSW456');
    expect(result.current.hasMore).toBe(false);
  });

  it('new search replaces accumulated results', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(makeMockSearchResponse(true))
      .mockResolvedValueOnce(makeMockPage2Response())
      .mockResolvedValueOnce(makeMockSearchResponse(false));

    const { result } = renderSearchHook(mockFetch);

    act(() => result.current.setQuery('1 george'));
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    await act(() => result.current.loadMore());
    expect(result.current.results).toHaveLength(2);

    act(() => result.current.setQuery('2 george'));
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].pid).toBe('GANSW123');
  });
});
