// Internal generic hook shared by useAddressSearch and the three narrower
// search hooks (postcode, locality, state) per ADR 006. Not exported from the
// package — only used via the public wrapper hooks.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Link } from '@windyroad/link-header';
import { createAddressrClient } from '@mountainpass/addressr-core';
import type { SearchPage, AddressrClient } from '@mountainpass/addressr-core';

export interface UseSearchOptions<T> {
  apiKey?: string;
  apiUrl?: string;
  apiHost?: string;
  debounceMs?: number;
  minQueryLength?: number;
  /** @internal — for testing only */
  fetchImpl?: typeof fetch;
  /** Which client search method to invoke — pinned by each public wrapper hook. */
  searchFn: (client: AddressrClient, query: string, signal: AbortSignal) => Promise<SearchPage<T>>;
}

export interface UseSearchReturn<T> {
  query: string;
  setQuery: (q: string) => void;
  results: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  error: Error | null;
  clear: () => void;
  /** @internal — exposed for wrapper hooks that need detail-fetch semantics. */
  client: AddressrClient;
  /** @internal — exposed for wrapper hooks that need HATEOAS canonical links. */
  lastPage: SearchPage<T> | null;
}

export function useSearch<T>(options: UseSearchOptions<T>): UseSearchReturn<T> {
  const {
    apiKey,
    apiUrl,
    apiHost,
    debounceMs = 300,
    minQueryLength = 3,
    fetchImpl,
    searchFn,
  } = options;

  const [query, setQueryState] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastPage, setLastPage] = useState<SearchPage<T> | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);
  const nextLinkRef = useRef<Link | null>(null);

  // Keep searchFn in a ref so its identity does not feed into the search effect's
  // dependencies. Wrapper hooks recreate the arrow each render; without this, the
  // effect would loop infinitely.
  const searchFnRef = useRef(searchFn);
  searchFnRef.current = searchFn;

  const client = useMemo(
    () => createAddressrClient({ apiKey, apiUrl, apiHost, fetchImpl }),
    [apiKey, apiUrl, apiHost, fetchImpl],
  );

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedQuery(q);
      }, debounceMs);
    },
    [debounceMs],
  );

  useEffect(() => {
    client.prefetch();
  }, [client]);

  useEffect(() => {
    if (debouncedQuery.length < minQueryLength) {
      setResults([]);
      nextLinkRef.current = null;
      setLastPage(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    searchFnRef.current(client, debouncedQuery, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          setResults(page.results);
          nextLinkRef.current = page.nextLink;
          setLastPage(page);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted && err.name !== 'AbortError') {
          setError(err);
          setIsLoading(false);
          setResults([]);
          nextLinkRef.current = null;
          setLastPage(null);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery, minQueryLength, client]);

  useEffect(() => {
    setHasMore(nextLinkRef.current !== null);
  }, [results]);

  const loadMore = useCallback(async () => {
    const nextLink = nextLinkRef.current;
    if (!nextLink || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const page = await client.fetchNextPage<T>(nextLink);
      setResults((prev) => [...prev, ...page.results]);
      nextLinkRef.current = page.nextLink;
      setLastPage(page);
      setHasMore(page.nextLink !== null);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [client, isLoadingMore]);

  const clear = useCallback(() => {
    setQueryState('');
    setDebouncedQuery('');
    setResults([]);
    setError(null);
    nextLinkRef.current = null;
    setLastPage(null);
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
    clear,
    client,
    lastPage,
  };
}
