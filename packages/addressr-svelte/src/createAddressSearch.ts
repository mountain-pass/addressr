import { writable, type Readable } from 'svelte/store';
import type {
  AddressSearchResult,
  AddressDetail,
} from '@mountainpass/addressr-core';
import { createSearch } from './createSearch';

export interface AddressSearchOptions {
  /** RapidAPI key. Omit when connecting directly to an addressr instance. */
  apiKey?: string;
  apiUrl?: string;
  apiHost?: string;
  debounceMs?: number;
  minQueryLength?: number;
  /** Custom fetch implementation (useful for testing) */
  fetchImpl?: typeof fetch;
}

export interface AddressSearchState {
  query: string;
  results: AddressSearchResult[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  selectedAddress: AddressDetail | null;
}

export interface AddressSearchStore extends Readable<AddressSearchState> {
  setQuery: (q: string) => void;
  loadMore: () => Promise<void>;
  selectAddress: (pid: string) => Promise<void>;
  clear: () => void;
  destroy: () => void;
}

export function createAddressSearch(options: AddressSearchOptions): AddressSearchStore {
  const inner = createSearch<AddressSearchResult>({
    ...options,
    searchFn: (client, q, signal) => client.searchAddresses(q, signal),
  });

  let currentResults: AddressSearchResult[] = [];
  let currentDetail: AddressDetail | null = null;

  const merged = writable<AddressSearchState>({
    query: '',
    results: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    selectedAddress: null,
  });

  const unsubInner = inner.subscribe((s) => {
    currentResults = s.results;
    merged.set({ ...s, selectedAddress: currentDetail });
  });

  async function selectAddress(pid: string) {
    const lastPage = inner.getLastPage();
    const index = currentResults.findIndex((r) => r.pid === pid);
    const detail = await inner.client.getAddressDetail(
      pid,
      undefined,
      index !== -1 ? lastPage ?? undefined : undefined,
      index !== -1 ? index : undefined,
    );
    currentDetail = detail;
    merged.update((m) => ({ ...m, selectedAddress: detail }));
  }

  function clear() {
    inner.clear();
    currentDetail = null;
    merged.update((m) => ({ ...m, selectedAddress: null }));
  }

  function destroy() {
    inner.destroy();
    unsubInner();
  }

  return {
    subscribe: merged.subscribe,
    setQuery: inner.setQuery,
    loadMore: inner.loadMore,
    selectAddress,
    clear,
    destroy,
  };
}
