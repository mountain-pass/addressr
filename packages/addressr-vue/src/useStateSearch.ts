// @jtbd JTBD-004
import { useSearch, type UseSearchOptions, type UseSearchReturn } from './useSearch';
import type { StateSearchResult } from '@mountainpass/addressr-core';

export type UseStateSearchOptions = Omit<UseSearchOptions<StateSearchResult>, 'searchFn'>;
export type UseStateSearchReturn = Omit<UseSearchReturn<StateSearchResult>, 'client' | 'getLastPage'>;

export function useStateSearch(options: UseStateSearchOptions): UseStateSearchReturn {
  const { client: _c, getLastPage: _p, ...rest } = useSearch<StateSearchResult>({
    ...options,
    searchFn: (client, q, signal) => client.searchStates(q, signal),
  });
  return rest;
}
