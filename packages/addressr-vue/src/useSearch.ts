// Internal generic composable shared by useAddressSearch and the three narrower
// search composables (postcode, locality, state) per ADR 006. Not exported.

import { ref, watch, onUnmounted, type Ref } from 'vue';
import type { Link } from '@windyroad/link-header';
import {
  createAddressrClient,
  type AddressrClient,
  type SearchPage,
} from '@mountainpass/addressr-core';

export interface UseSearchOptions<T> {
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

export interface UseSearchReturn<T> {
  query: Ref<string>;
  results: Ref<T[]>;
  isLoading: Ref<boolean>;
  isLoadingMore: Ref<boolean>;
  hasMore: Ref<boolean>;
  error: Ref<Error | null>;
  setQuery: (q: string) => void;
  loadMore: () => Promise<void>;
  clear: () => void;
  /** @internal — exposed for wrapper composables that need detail-fetch semantics. */
  client: AddressrClient;
  /** @internal — latest SearchPage for HATEOAS canonical links. */
  getLastPage: () => SearchPage<T> | null;
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

  const client = createAddressrClient({ apiKey, apiUrl, apiHost, fetchImpl });
  client.prefetch();

  const query = ref('');
  const debouncedQuery = ref('');
  const results = ref<T[]>([]) as Ref<T[]>;
  const isLoading = ref(false);
  const isLoadingMore = ref(false);
  const hasMore = ref(false);
  const error = ref<Error | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let abortController: AbortController | undefined;
  let nextLink: Link | null = null;
  let lastPage: SearchPage<T> | null = null;

  function setQuery(q: string) {
    query.value = q;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery.value = q;
    }, debounceMs);
  }

  watch(debouncedQuery, (q) => {
    if (q.length < minQueryLength) {
      results.value = [];
      hasMore.value = false;
      nextLink = null;
      lastPage = null;
      return;
    }

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    isLoading.value = true;
    error.value = null;

    searchFn(client, q, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          results.value = page.results;
          nextLink = page.nextLink;
          lastPage = page;
          hasMore.value = page.nextLink !== null;
          isLoading.value = false;
        }
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted && err.name !== 'AbortError') {
          error.value = err;
          isLoading.value = false;
          results.value = [];
          hasMore.value = false;
          nextLink = null;
          lastPage = null;
        }
      });
  });

  async function loadMore() {
    if (!nextLink || isLoadingMore.value) return;
    isLoadingMore.value = true;
    try {
      const page = await client.fetchNextPage<T>(nextLink);
      results.value = [...results.value, ...page.results];
      nextLink = page.nextLink;
      lastPage = page;
      hasMore.value = page.nextLink !== null;
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        error.value = err;
      }
    } finally {
      isLoadingMore.value = false;
    }
  }

  function clear() {
    clearTimeout(debounceTimer);
    abortController?.abort();
    query.value = '';
    debouncedQuery.value = '';
    results.value = [];
    isLoading.value = false;
    isLoadingMore.value = false;
    hasMore.value = false;
    error.value = null;
    nextLink = null;
    lastPage = null;
  }

  try {
    onUnmounted(() => {
      clearTimeout(debounceTimer);
      abortController?.abort();
    });
  } catch {
    // Not in component context — no cleanup needed
  }

  return {
    query,
    results,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    setQuery,
    loadMore,
    clear,
    client,
    getLastPage: () => lastPage,
  };
}
