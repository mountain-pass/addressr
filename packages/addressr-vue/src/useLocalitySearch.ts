// @jtbd JTBD-003
import { useSearch, type UseSearchOptions, type UseSearchReturn } from './useSearch';
import type { LocalitySearchResult } from '@mountainpass/addressr-core';

export type UseLocalitySearchOptions = Omit<UseSearchOptions<LocalitySearchResult>, 'searchFn'>;
export type UseLocalitySearchReturn = Omit<UseSearchReturn<LocalitySearchResult>, 'client' | 'getLastPage'>;

export function useLocalitySearch(options: UseLocalitySearchOptions): UseLocalitySearchReturn {
  const { client: _c, getLastPage: _p, ...rest } = useSearch<LocalitySearchResult>({
    ...options,
    searchFn: (client, q, signal) => client.searchLocalities(q, signal),
  });
  return rest;
}
