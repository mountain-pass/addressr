import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Link } from '@windyroad/link-header';
import { createAddressrClient } from '@mountainpass/addressr-core';
import type { SearchPage, AddressSearchResult, AddressDetail } from '@mountainpass/addressr-core';

export interface UseAddressSearchOptions {
  /** RapidAPI key. Omit when connecting directly to an addressr instance. */
  apiKey?: string;
  apiUrl?: string;
  apiHost?: string;
  debounceMs?: number;
  minQueryLength?: number;
  /** @internal — for testing only */
  fetchImpl?: typeof fetch;
}

export interface UseAddressSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: AddressSearchResult[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  error: Error | null;
  selectedAddress: AddressDetail | null;
  selectAddress: (pid: string) => Promise<void>;
  clear: () => void;
}

export const normaliseAddressQuery = (query: string) => query.trim().replace(/\s+/g, ' ');

export function useAddressSearch(options: UseAddressSearchOptions): UseAddressSearchReturn {
  const {
    apiKey,
    apiUrl,
    apiHost,
    debounceMs = 300,
    minQueryLength = 3,
    fetchImpl,
  } = options;

  const [query, setQueryState] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<AddressDetail | null>(null);

  const queryRef = useRef('');
  const queryGenerationRef = useRef(0);
  const settledGenerationRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);
  const paginationAbortRef = useRef<AbortController>(undefined);
  const nextLinkRef = useRef<Link | null>(null);
  const searchPageRef = useRef<SearchPage | null>(null);

  const client = useMemo(
    () => createAddressrClient({ apiKey, apiUrl, apiHost, fetchImpl }),
    [apiKey, apiUrl, apiHost, fetchImpl],
  );

  const setQuery = useCallback(
    (q: string) => {
      if (q === queryRef.current) return;
      const previousNormalisedQuery = normaliseAddressQuery(queryRef.current);
      const normalisedQuery = normaliseAddressQuery(q);
      queryRef.current = q;
      setQueryState(q);
      if (normalisedQuery === previousNormalisedQuery) return;
      queryGenerationRef.current += 1;
      settledGenerationRef.current = null;
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      paginationAbortRef.current?.abort();
      setError(null);
      setIsLoadingMore(false);
      nextLinkRef.current = null;
      searchPageRef.current = null;
      setHasMore(false);

      if (normalisedQuery.length >= minQueryLength) {
        setIsLoading(true);
      } else {
        setIsLoading(false);
        setResults([]);
        nextLinkRef.current = null;
        searchPageRef.current = null;
        setHasMore(false);
      }

      debounceRef.current = setTimeout(() => {
        setDebouncedQuery(normalisedQuery);
      }, debounceMs);
    },
    [debounceMs, minQueryLength],
  );

  // Prefetch API root on mount so the first search doesn't pay discovery latency
  useEffect(() => {
    client.prefetch();
  }, [client]);

  // Search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length < minQueryLength) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      nextLinkRef.current = null;
      searchPageRef.current = null;
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = queryGenerationRef.current;

    setIsLoading(true);
    setError(null);

    client
      .searchAddresses(debouncedQuery, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted && generation === queryGenerationRef.current) {
          setResults(page.results);
          nextLinkRef.current = page.nextLink;
          searchPageRef.current = page;
          settledGenerationRef.current = generation;
          setHasMore(page.nextLink !== null);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && err.name !== 'AbortError') {
          setError(err);
          setIsLoading(false);
          setResults([]);
          nextLinkRef.current = null;
          searchPageRef.current = null;
        }
      });

    return () => controller.abort();
  }, [debouncedQuery, minQueryLength, client]);

  const loadMore = useCallback(async () => {
    const nextLink = nextLinkRef.current;
    const generation = settledGenerationRef.current;
    if (!nextLink || isLoading || isLoadingMore || generation === null || generation !== queryGenerationRef.current) {
      return;
    }

    const controller = new AbortController();
    paginationAbortRef.current = controller;
    setIsLoadingMore(true);
    try {
      const page = await client.fetchNextPage(nextLink, controller.signal);
      if (controller.signal.aborted || generation !== queryGenerationRef.current) return;
      setResults((prev) => [...prev, ...page.results]);
      nextLinkRef.current = page.nextLink;
      searchPageRef.current = page;
      setHasMore(page.nextLink !== null);
    } catch (err) {
      if (generation === queryGenerationRef.current && err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      if (generation === queryGenerationRef.current) setIsLoadingMore(false);
    }
  }, [client, isLoading, isLoadingMore]);

  const selectAddress = useCallback(
    async (pid: string) => {
      // Find the result index for HATEOAS canonical link following
      const index = results.findIndex((r) => r.pid === pid);
      const detail = await client.getAddressDetail(
        pid,
        undefined,
        index !== -1 ? searchPageRef.current ?? undefined : undefined,
        index !== -1 ? index : undefined,
      );
      setSelectedAddress(detail);
    },
    [client, results],
  );

  const clear = useCallback(() => {
    queryRef.current = '';
    queryGenerationRef.current += 1;
    settledGenerationRef.current = null;
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    paginationAbortRef.current?.abort();
    setQueryState('');
    setDebouncedQuery('');
    setResults([]);
    setIsLoading(false);
    setIsLoadingMore(false);
    setSelectedAddress(null);
    setError(null);
    nextLinkRef.current = null;
    searchPageRef.current = null;
    setHasMore(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    error,
    selectedAddress,
    selectAddress,
    clear,
  };
}
