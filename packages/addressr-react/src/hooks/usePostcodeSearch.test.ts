// @jtbd JTBD-002
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePostcodeSearch } from './usePostcodeSearch';

const MOCK_ROOT_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/',
  headers: new Headers({
    link: '</postcodes{?q}>; rel="https://addressr.io/rels/postcode-search"',
  }),
  json: () => Promise.resolve({}),
};

const MOCK_POSTCODE_RESPONSE = {
  ok: true,
  url: 'https://addressr.p.rapidapi.com/postcodes?q=2000',
  headers: new Headers({
    link: '</postcodes/2000>; rel=canonical; anchor="#/0"',
  }),
  json: () =>
    Promise.resolve([
      { postcode: '2000', localities: [{ name: 'SYDNEY' }, { name: 'BARANGAROO' }] },
      { postcode: '2001', localities: [{ name: 'SYDNEY' }] },
    ]),
};

describe('usePostcodeSearch', () => {
  it('returns empty results below minQueryLength', async () => {
    const mockFetch = vi.fn();
    const { result } = renderHook(() =>
      usePostcodeSearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 3 }),
    );
    act(() => result.current.setQuery('20'));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches and exposes typed postcode results', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_POSTCODE_RESPONSE);
    const { result } = renderHook(() =>
      usePostcodeSearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 2 }),
    );
    act(() => result.current.setQuery('2000'));
    await waitFor(() => expect(result.current.results.length).toBe(2));
    expect(result.current.results[0].postcode).toBe('2000');
    expect(result.current.results[0].localities[0].name).toBe('SYDNEY');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces errors after retries are exhausted', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      // Use mockResolvedValue so retries all see the same 500 (per BRIEFING: error tests need consistent failures).
      .mockResolvedValue({ ok: false, status: 500, statusText: 'Boom', headers: new Headers({}) });
    const { result } = renderHook(() =>
      usePostcodeSearch({
        apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 2,
      }),
    );
    act(() => result.current.setQuery('2000'));
    // Retry with defaults (2 retries, 500ms base, exp backoff, cap 5000ms) — up to ~7.5s worst case.
    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 10000 });
    expect(result.current.error?.message).toContain('500');
  }, 15000);

  it('clear() resets state', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(MOCK_ROOT_RESPONSE)
      .mockResolvedValueOnce(MOCK_POSTCODE_RESPONSE);
    const { result } = renderHook(() =>
      usePostcodeSearch({ apiKey: 'k', fetchImpl: mockFetch, debounceMs: 1, minQueryLength: 2 }),
    );
    act(() => result.current.setQuery('2000'));
    await waitFor(() => expect(result.current.results.length).toBe(2));
    act(() => result.current.clear());
    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
  });
});
