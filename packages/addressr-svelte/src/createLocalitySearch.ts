// @jtbd JTBD-003
import { createSearch, type CreateSearchOptions, type SearchStore } from './createSearch';
import type { LocalitySearchResult } from '@mountainpass/addressr-core';

export type CreateLocalitySearchOptions = Omit<CreateSearchOptions<LocalitySearchResult>, 'searchFn'>;
export type LocalitySearchStore = Omit<SearchStore<LocalitySearchResult>, 'client' | 'getLastPage'>;

export function createLocalitySearch(options: CreateLocalitySearchOptions): LocalitySearchStore {
  const inner = createSearch<LocalitySearchResult>({
    ...options,
    searchFn: (client, q, signal) => client.searchLocalities(q, signal),
  });
  return {
    subscribe: inner.subscribe,
    setQuery: inner.setQuery,
    loadMore: inner.loadMore,
    clear: inner.clear,
    destroy: inner.destroy,
  };
}
