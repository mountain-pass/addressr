// @jtbd JTBD-002
import { useSearch, type UseSearchOptions, type UseSearchReturn } from './useSearch';
import type { PostcodeSearchResult } from '@mountainpass/addressr-core';

export type UsePostcodeSearchOptions = Omit<UseSearchOptions<PostcodeSearchResult>, 'searchFn'>;
export type UsePostcodeSearchReturn = Omit<UseSearchReturn<PostcodeSearchResult>, 'client' | 'lastPage'>;

export function usePostcodeSearch(options: UsePostcodeSearchOptions): UsePostcodeSearchReturn {
  const { client: _client, lastPage: _lastPage, ...rest } = useSearch<PostcodeSearchResult>({
    ...options,
    searchFn: (client, query, signal) => client.searchPostcodes(query, signal),
  });
  return rest;
}
