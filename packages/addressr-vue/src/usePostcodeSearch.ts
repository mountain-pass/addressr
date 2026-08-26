// @jtbd JTBD-002
import { useSearch, type UseSearchOptions, type UseSearchReturn } from './useSearch';
import type { PostcodeSearchResult } from '@mountainpass/addressr-core';

export type UsePostcodeSearchOptions = Omit<UseSearchOptions<PostcodeSearchResult>, 'searchFn'>;
export type UsePostcodeSearchReturn = Omit<UseSearchReturn<PostcodeSearchResult>, 'client' | 'getLastPage'>;

export function usePostcodeSearch(options: UsePostcodeSearchOptions): UsePostcodeSearchReturn {
  const { client: _c, getLastPage: _p, ...rest } = useSearch<PostcodeSearchResult>({
    ...options,
    searchFn: (client, q, signal) => client.searchPostcodes(q, signal),
  });
  return rest;
}
