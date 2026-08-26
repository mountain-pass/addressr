import { glowUpFetchWithLinks } from '@windyroad/fetch-link';
import type { Link } from '@windyroad/link-header';
import type {
  AddressSearchResult,
  AddressDetail,
  PostcodeSearchResult,
  LocalitySearchResult,
  StateSearchResult,
} from './types';
import { withRetry, type RetryOptions } from './utils/retry';

const SEARCH_REL = 'https://addressr.io/rels/address-search';
const POSTCODE_SEARCH_REL = 'https://addressr.io/rels/postcode-search';
const LOCALITY_SEARCH_REL = 'https://addressr.io/rels/locality-search';
const STATE_SEARCH_REL = 'https://addressr.io/rels/state-search';

export interface AddressrClientOptions {
  /** RapidAPI key. Omit when connecting directly to an addressr instance. */
  apiKey?: string;
  apiUrl?: string;
  apiHost?: string;
  /** Custom fetch implementation (useful for testing) */
  fetchImpl?: typeof fetch;
  /** Retry configuration. Set to false to disable retries. */
  retry?: RetryOptions | false;
}

export interface SearchPage<T = AddressSearchResult> {
  results: T[];
  nextLink: Link | null;
  /** @internal — used for HATEOAS canonical link following */
  _links: Link[];
}

export interface AddressrClient {
  searchAddresses: (query: string, signal?: AbortSignal) => Promise<SearchPage<AddressSearchResult>>;
  searchPostcodes: (query: string, signal?: AbortSignal) => Promise<SearchPage<PostcodeSearchResult>>;
  searchLocalities: (query: string, signal?: AbortSignal) => Promise<SearchPage<LocalitySearchResult>>;
  searchStates: (query: string, signal?: AbortSignal) => Promise<SearchPage<StateSearchResult>>;
  fetchNextPage: <T = AddressSearchResult>(nextLink: Link, signal?: AbortSignal) => Promise<SearchPage<T>>;
  getAddressDetail: (pid: string, signal?: AbortSignal, searchPage?: SearchPage<AddressSearchResult>, resultIndex?: number) => Promise<AddressDetail>;
  /** Pre-fetch the API root so the first search doesn't pay the discovery latency. Errors are swallowed. */
  prefetch: () => Promise<void>;
}

export function createAddressrClient(options: AddressrClientOptions): AddressrClient {
  const {
    apiKey,
    apiUrl = 'https://addressr.p.rapidapi.com/',
    apiHost = 'addressr.p.rapidapi.com',
    fetchImpl,
    retry: retryConfig,
  } = options;

  const retryOpts: RetryOptions | undefined = retryConfig === false ? undefined : retryConfig ?? { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 5000 };

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['x-rapidapi-key'] = apiKey;
    headers['x-rapidapi-host'] = apiHost;
  }

  const fetchLink = glowUpFetchWithLinks(
    ((url: RequestInfo | URL, init?: RequestInit) =>
      (fetchImpl || fetch)(url, {
        ...init,
        headers: { ...headers, ...init?.headers },
      })) as typeof fetch,
  );

  // Cache the root discovery
  let rootPromise: ReturnType<typeof fetchLink> | undefined;

  function getRoot() {
    if (!rootPromise) {
      rootPromise = fetchLink(apiUrl).then((response) => {
        if (!response.ok) {
          rootPromise = undefined;
          throw new Error(`API root error: ${response.status} ${response.statusText}`);
        }
        return response;
      }).catch((err) => {
        rootPromise = undefined;
        throw err;
      });
    }
    return rootPromise;
  }

  function toSearchPage<T>(response: Awaited<ReturnType<typeof fetchLink>>, results: T[]): SearchPage<T> {
    const nextLinks = response.links('next');
    const allLinks = response.links();
    return {
      results,
      nextLink: nextLinks.length > 0 ? nextLinks[0] : null,
      _links: allLinks,
    };
  }

  async function searchByRel<T>(
    rel: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<SearchPage<T>> {
    const root = await getRoot();
    const searchLinks = root.links(rel, { q: query.trim() });
    if (!searchLinks.length) {
      throw new Error(`Search link relation not found in API root: ${rel}`);
    }
    const doFetch = () => fetchLink(searchLinks[0], { signal });
    const response = retryOpts ? await withRetry(doFetch, { ...retryOpts, signal }) : await doFetch();
    if (!response.ok) {
      throw new Error(`Search error: ${response.status} ${response.statusText}`);
    }
    const results = (await response.json()) as T[];
    return toSearchPage(response, results);
  }

  function searchAddresses(query: string, signal?: AbortSignal) {
    return searchByRel<AddressSearchResult>(SEARCH_REL, query, signal);
  }

  function searchPostcodes(query: string, signal?: AbortSignal) {
    return searchByRel<PostcodeSearchResult>(POSTCODE_SEARCH_REL, query, signal);
  }

  function searchLocalities(query: string, signal?: AbortSignal) {
    return searchByRel<LocalitySearchResult>(LOCALITY_SEARCH_REL, query, signal);
  }

  function searchStates(query: string, signal?: AbortSignal) {
    return searchByRel<StateSearchResult>(STATE_SEARCH_REL, query, signal);
  }

  async function fetchNextPage<T = AddressSearchResult>(
    nextLink: Link,
    signal?: AbortSignal,
  ): Promise<SearchPage<T>> {
    const doFetch = () => fetchLink(nextLink, { signal });
    const response = retryOpts ? await withRetry(doFetch, { ...retryOpts, signal }) : await doFetch();
    if (!response.ok) {
      throw new Error(`Search error: ${response.status} ${response.statusText}`);
    }
    const results = (await response.json()) as T[];
    return toSearchPage(response, results);
  }

  async function getAddressDetail(
    pid: string,
    signal?: AbortSignal,
    searchPage?: SearchPage<AddressSearchResult>,
    resultIndex?: number,
  ): Promise<AddressDetail> {
    // Prefer HATEOAS: follow canonical link from search results
    if (searchPage && resultIndex !== undefined) {
      const anchor = `#/${resultIndex}`;
      const canonicalLink = searchPage._links.find(
        (link) => link.rel === 'canonical' && link.anchor === anchor,
      );
      if (canonicalLink) {
        const doFetch = () => fetchLink(canonicalLink, { signal });
        const response = retryOpts ? await withRetry(doFetch, { ...retryOpts, signal }) : await doFetch();
        if (!response.ok) {
          throw new Error(`Detail error: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<AddressDetail>;
      }
    }

    // Fallback: construct URL from PID
    const root = await getRoot();
    const baseUrl = new URL(root.url);
    const addressUrl = new URL(
      `/addresses/${encodeURIComponent(pid)}`,
      baseUrl,
    );
    const doFetch = () => fetchLink(addressUrl.toString(), { signal });
    const response = retryOpts ? await withRetry(doFetch, { ...retryOpts, signal }) : await doFetch();
    if (!response.ok) {
      throw new Error(`Detail error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<AddressDetail>;
  }

  async function prefetch(): Promise<void> {
    try {
      await getRoot();
    } catch {
      // Swallow errors — prefetch is optimistic
    }
  }

  return {
    searchAddresses,
    searchPostcodes,
    searchLocalities,
    searchStates,
    fetchNextPage,
    getAddressDetail,
    prefetch,
  };
}
