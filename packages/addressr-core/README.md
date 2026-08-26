# @mountainpass/addressr-core

Framework-agnostic HATEOAS client for the [Addressr](https://addressr.io) Australian address API. Use this to build your own address search UI in any framework, or pair it with a framework package:

- React: [`@mountainpass/addressr-react`](../react)
- Svelte: [`@mountainpass/addressr-svelte`](../svelte)
- Vue: [`@mountainpass/addressr-vue`](../vue)

## Install

```bash
npm install @mountainpass/addressr-core
```

## Usage

```ts
import {
  createAddressrClient,
  parseHighlight,
} from '@mountainpass/addressr-core';

const client = createAddressrClient({
  apiUrl: 'https://api.addressr.io/',
  // Or use RapidAPI:
  // apiKey: 'your-rapidapi-key',
});

// Search
const page = await client.searchAddresses('1 george st');
console.log(page.results); // AddressSearchResult[]
console.log(page.nextLink); // Link | null

// Paginate
if (page.nextLink) {
  const page2 = await client.fetchNextPage(page.nextLink);
}

// Get full detail
const detail = await client.getAddressDetail('GANSW123');
console.log(detail.structured); // { street, locality, state, postcode, ... }
console.log(detail.geocoding); // { latitude, longitude, ... }

// Safe highlight rendering
const segments = parseHighlight('<em>1</em> <em>GEORGE</em> ST');
// [{ text: '1', highlighted: true }, { text: ' ', highlighted: false }, ...]
```

## API

### `createAddressrClient(options)`

| Option      | Type                    | Default                                                 | Description                               |
| ----------- | ----------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `apiKey`    | `string`                | --                                                      | RapidAPI key. Omit for direct API access. |
| `apiUrl`    | `string`                | `"https://addressr.p.rapidapi.com/"`                    | API root URL                              |
| `apiHost`   | `string`                | `"addressr.p.rapidapi.com"`                             | RapidAPI host header                      |
| `retry`     | `RetryOptions \| false` | `{ maxRetries: 2, baseDelayMs: 500, maxDelayMs: 5000 }` | Retry config, or `false` to disable       |
| `fetchImpl` | `typeof fetch`          | `globalThis.fetch`                                      | Custom fetch (for testing)                |

Returns an `AddressrClient` with:

| Method                                                | Returns                                     | Description                                                                   |
| ----------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `searchAddresses(query, signal?)`                     | `Promise<SearchPage<AddressSearchResult>>`  | Search addresses. Returns results + HATEOAS next link.                        |
| `searchPostcodes(query, signal?)`                     | `Promise<SearchPage<PostcodeSearchResult>>` | Search postcodes.                                                             |
| `searchLocalities(query, signal?)`                    | `Promise<SearchPage<LocalitySearchResult>>` | Search suburbs/towns.                                                         |
| `searchStates(query, signal?)`                        | `Promise<SearchPage<StateSearchResult>>`    | Search states/territories.                                                    |
| `fetchNextPage(nextLink, signal?)`                    | `Promise<SearchPage<T>>`                    | Follow a next-page link relation.                                             |
| `getAddressDetail(pid, signal?, searchPage?, index?)` | `Promise<AddressDetail>`                    | Get full address detail. Follows canonical link when search context provided. |

### `SearchPage<T>`

Generic over the result type. Defaults to `AddressSearchResult` for backward compatibility.

```ts
{
  results: T[];           // Array of search results
  nextLink: Link | null;  // HATEOAS link to next page, or null
}
```

## Postcode, locality, and state search

In addition to `searchAddresses`, the client exposes three narrower search methods for when a form needs only a postcode, suburb, or state. Each shares the same HATEOAS root discovery, retry behaviour, and abort semantics as `searchAddresses`.

### Postcodes

```ts
const page = await client.searchPostcodes('2000');
// page.results[0] is { postcode: '2000', localities: [{ name: 'SYDNEY' }, ...] }
```

### Localities

```ts
const page = await client.searchLocalities('sydney');
// page.results[0] is { name: 'SYDNEY', state: { abbreviation: 'NSW', name: 'NEW SOUTH WALES' }, postcode: '2000', score, pid }
```

### States

```ts
const page = await client.searchStates('NSW');
// page.results[0] is { name: 'NEW SOUTH WALES', abbreviation: 'NSW' }
```

### `RetryOptions`

```ts
{
  maxRetries?: number;   // Default: 2
  baseDelayMs?: number;  // Default: 500 — exponential backoff base
  maxDelayMs?: number;   // Default: 5000 — backoff cap
}
```

Failed requests are retried with exponential backoff and jitter. Only network errors and 5xx responses are retried -- 4xx errors fail immediately. Pass `retry: false` to disable.

### `parseHighlight(html)`

Safely parses Elasticsearch `<em>` highlight tags into segments. No innerHTML, no XSS.

```ts
parseHighlight(html: string): HighlightSegment[]
// HighlightSegment = { text: string; highlighted: boolean }
```

## Architecture

- **HATEOAS** -- API root discovery via RFC 8288 Link headers, no hardcoded paths
- **Pagination** -- follows `next` link relations, accumulates results across pages
- **Canonical links** -- `getAddressDetail` follows canonical link from search results when available, falls back to URL construction
- **Root caching** -- API root fetched once per client instance
- **Abort support** -- all methods accept `AbortSignal` for cancellation

## License

Apache-2.0
