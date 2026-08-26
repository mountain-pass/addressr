import { ref, type Ref } from 'vue';
import type { AddressSearchResult, AddressDetail } from '@mountainpass/addressr-core';
import { useSearch } from './useSearch';

export interface UseAddressSearchOptions {
  /** RapidAPI key. Omit when connecting directly to an addressr instance. */
  apiKey?: string;
  apiUrl?: string;
  apiHost?: string;
  debounceMs?: number;
  minQueryLength?: number;
  /** Custom fetch implementation (useful for testing) */
  fetchImpl?: typeof fetch;
}

export interface UseAddressSearchReturn {
  query: Ref<string>;
  results: Ref<AddressSearchResult[]>;
  isLoading: Ref<boolean>;
  isLoadingMore: Ref<boolean>;
  hasMore: Ref<boolean>;
  error: Ref<Error | null>;
  selectedAddress: Ref<AddressDetail | null>;
  setQuery: (q: string) => void;
  loadMore: () => Promise<void>;
  selectAddress: (pid: string) => Promise<void>;
  clear: () => void;
}

export function useAddressSearch(options: UseAddressSearchOptions): UseAddressSearchReturn {
  const inner = useSearch<AddressSearchResult>({
    ...options,
    searchFn: (client, q, signal) => client.searchAddresses(q, signal),
  });

  const selectedAddress = ref<AddressDetail | null>(null);

  async function selectAddress(pid: string) {
    const lastPage = inner.getLastPage();
    const index = inner.results.value.findIndex((r) => r.pid === pid);
    const detail = await inner.client.getAddressDetail(
      pid,
      undefined,
      index !== -1 ? lastPage ?? undefined : undefined,
      index !== -1 ? index : undefined,
    );
    selectedAddress.value = detail;
  }

  function clear() {
    inner.clear();
    selectedAddress.value = null;
  }

  return {
    query: inner.query,
    results: inner.results,
    isLoading: inner.isLoading,
    isLoadingMore: inner.isLoadingMore,
    hasMore: inner.hasMore,
    error: inner.error,
    selectedAddress,
    setQuery: inner.setQuery,
    loadMore: inner.loadMore,
    selectAddress,
    clear,
  };
}
