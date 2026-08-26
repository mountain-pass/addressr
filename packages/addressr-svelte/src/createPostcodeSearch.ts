// @jtbd JTBD-002
import { createSearch, type CreateSearchOptions, type SearchStore } from './createSearch';
import type { PostcodeSearchResult } from '@mountainpass/addressr-core';

export type CreatePostcodeSearchOptions = Omit<CreateSearchOptions<PostcodeSearchResult>, 'searchFn'>;
export type PostcodeSearchStore = Omit<SearchStore<PostcodeSearchResult>, 'client' | 'getLastPage'>;

export function createPostcodeSearch(options: CreatePostcodeSearchOptions): PostcodeSearchStore {
  const inner = createSearch<PostcodeSearchResult>({
    ...options,
    searchFn: (client, q, signal) => client.searchPostcodes(q, signal),
  });
  return {
    subscribe: inner.subscribe,
    setQuery: inner.setQuery,
    loadMore: inner.loadMore,
    clear: inner.clear,
    destroy: inner.destroy,
  };
}
