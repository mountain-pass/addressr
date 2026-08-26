// @jtbd JTBD-004
import { useSearch, type UseSearchOptions, type UseSearchReturn } from './useSearch';
import type { StateSearchResult } from '@mountainpass/addressr-core';

export type UseStateSearchOptions = Omit<UseSearchOptions<StateSearchResult>, 'searchFn'>;
export type UseStateSearchReturn = Omit<UseSearchReturn<StateSearchResult>, 'client' | 'lastPage'>;

export function useStateSearch(options: UseStateSearchOptions): UseStateSearchReturn {
  const { client: _client, lastPage: _lastPage, ...rest } = useSearch<StateSearchResult>({
    ...options,
    searchFn: (client, query, signal) => client.searchStates(query, signal),
  });
  return rest;
}
