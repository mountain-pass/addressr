// @jtbd JTBD-004
import { createSearch, type CreateSearchOptions, type SearchStore } from './createSearch';
import type { StateSearchResult } from '@mountainpass/addressr-core';

export type CreateStateSearchOptions = Omit<CreateSearchOptions<StateSearchResult>, 'searchFn'>;
export type StateSearchStore = Omit<SearchStore<StateSearchResult>, 'client' | 'getLastPage'>;

export function createStateSearch(options: CreateStateSearchOptions): StateSearchStore {
  const inner = createSearch<StateSearchResult>({
    ...options,
    searchFn: (client, q, signal) => client.searchStates(q, signal),
  });
  return {
    subscribe: inner.subscribe,
    setQuery: inner.setQuery,
    loadMore: inner.loadMore,
    clear: inner.clear,
    destroy: inner.destroy,
  };
}
