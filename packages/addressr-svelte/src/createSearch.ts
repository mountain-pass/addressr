// Internal generic store shared by createAddressSearch and the three narrower
// search stores (postcode, locality, state) per ADR 006. Not exported from the
// package — only used via the public wrapper stores.

import { writable, type Readable } from 'svelte/store';
import type { Link } from '@windyroad/link-header';
import {
  createAddressrClient,
  type AddressrClient,
  type SearchPage,
} from '@mountainpass/addressr-core';

export interface CreateSearchOptions<T> {
  apiKey?: string;
  apiUrl?: string;
  apiHost?: string;
  debounceMs?: number;
  minQueryLength?: number;
  /** @internal — for testing only */
  fetchImpl?: typeof fetch;
  /** Which client search method to invoke — pinned by each public wrapper. */
  searchFn: (client: AddressrClient, query: string, signal: AbortSignal) => Promise<SearchPage<T>>;
}

export interface SearchState<T> {
  query: string;
  results: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
}

export interface SearchStore<T> extends Readable<SearchState<T>> {
  setQuery: (q: string) => void;
  loadMore: () => Promise<void>;
  clear: () => void;
  destroy: () => void;
  /** @internal — exposed to wrapper stores that need detail-fetch semantics. */
  client: AddressrClient;
  /** @internal — latest SearchPage for HATEOAS canonical links. */
  getLastPage: () => SearchPage<T> | null;
}

export function createSearch<T>(options: CreateSearchOptions<T>): SearchStore<T> {
  const {
    apiKey,
    apiUrl,
    apiHost,
    debounceMs = 300,
    minQueryLength = 3,
    fetchImpl,
    searchFn,
  } = options;

  const client = createAddressrClient({ apiKey, apiUrl, apiHost, fetchImpl });
  client.prefetch();

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let abortController: AbortController | undefined;
  let nextLink: Link | null = null;
  let lastPage: SearchPage<T> | null = null;

  const { subscribe, set, update } = writable<SearchState<T>>({
    query: '',
    results: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
  });

  function doSearch(q: string) {
    if (q.length < minQueryLength) {
      update((s) => ({ ...s, results: [], isLoading: false, hasMore: false }));
      nextLink = null;
      lastPage = null;
      return;
    }

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    update((s) => ({ ...s, isLoading: true, error: null }));

    searchFn(client, q, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          nextLink = page.nextLink;
          lastPage = page;
          update((s) => ({
            ...s,
            results: page.results,
            isLoading: false,
            hasMore: page.nextLink !== null,
          }));
        }
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted && err.name !== 'AbortError') {
          nextLink = null;
          lastPage = null;
          update((s) => ({
            ...s,
            error: err,
            isLoading: false,
            results: [],
            hasMore: false,
          }));
        }
      });
  }

  function setQuery(q: string) {
    update((s) => ({ ...s, query: q }));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      doSearch(q);
    }, debounceMs);
  }

  async function loadMore() {
    if (!nextLink) return;
    let currentlyLoading = false;
    update((s) => {
      currentlyLoading = s.isLoadingMore;
      return s;
    });
    if (currentlyLoading) return;

    update((s) => ({ ...s, isLoadingMore: true }));
    try {
      const page = await client.fetchNextPage<T>(nextLink);
      nextLink = page.nextLink;
      lastPage = page;
      update((s) => ({
        ...s,
        results: [...s.results, ...page.results],
        isLoadingMore: false,
        hasMore: page.nextLink !== null,
      }));
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        update((s) => ({ ...s, error: err, isLoadingMore: false }));
      }
    }
  }

  function clear() {
    clearTimeout(debounceTimer);
    abortController?.abort();
    nextLink = null;
    lastPage = null;
    set({
      query: '',
      results: [],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
    });
  }

  function destroy() {
    clearTimeout(debounceTimer);
    abortController?.abort();
  }

  return {
    subscribe,
    setQuery,
    loadMore,
    clear,
    destroy,
    client,
    getLastPage: () => lastPage,
  };
}
