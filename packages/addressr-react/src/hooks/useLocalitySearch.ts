// @jtbd JTBD-003
import { useSearch, type UseSearchOptions, type UseSearchReturn } from './useSearch';
import type { LocalitySearchResult } from '@mountainpass/addressr-core';

export type UseLocalitySearchOptions = Omit<UseSearchOptions<LocalitySearchResult>, 'searchFn'>;
export type UseLocalitySearchReturn = Omit<UseSearchReturn<LocalitySearchResult>, 'client' | 'lastPage'>;

export function useLocalitySearch(options: UseLocalitySearchOptions): UseLocalitySearchReturn {
  const { client: _client, lastPage: _lastPage, ...rest } = useSearch<LocalitySearchResult>({
    ...options,
    searchFn: (client, query, signal) => client.searchLocalities(query, signal),
  });
  return rest;
}
