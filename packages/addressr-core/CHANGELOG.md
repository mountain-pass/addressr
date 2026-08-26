# @mountainpass/addressr-core

## 0.7.0

### Minor Changes

- 825cf97: Add `searchPostcodes`, `searchLocalities`, and `searchStates` methods to `createAddressrClient`. Each method mirrors `searchAddresses` (debounce, abort, retry, HATEOAS root discovery) but targets the new narrower endpoints via distinct rel URIs.

  New public types: `PostcodeSearchResult`, `LocalitySearchResult`, `StateSearchResult`.

  `SearchPage` is now generic: `SearchPage<T = AddressSearchResult>`. Existing consumers referencing the concrete `SearchPage` type remain source-compatible; the default type argument preserves behaviour.

  Internally extracted a private `searchByRel<T>(rel, query, signal)` helper that holds the shared search body; `searchAddresses` now delegates to it. No change to existing `searchAddresses` behaviour or signature.

  See ADR 006 for the architectural rationale.

  **Note**: consumers behind RapidAPI may need to wait for the edge cache to refresh before the new rels become discoverable from the API root. See PROB-004.

## 0.6.1

### Patch Changes

- 2f606df: docs: document theming, render customization, form props, retry config, and skeleton loading in READMEs

## 0.6.0

### Minor Changes

- 2856995: Loading skeleton animation and render customization for styled components.
  - **Skeleton loading**: Replaces "Searching..." text with 3 animated shimmer lines. Respects `prefers-reduced-motion: reduce`. Customizable via `--addressr-skeleton-from` and `--addressr-skeleton-to` tokens.
  - **React render props**: `renderLoading`, `renderNoResults`, `renderError`, `renderItem` — override any rendering zone while keeping built-in accessibility.
  - **Svelte named slots**: `loading`, `no-results` — slot-based customization.
  - **Vue scoped slots**: `loading`, `no-results` — scoped slot customization.
  - Default rendering is unchanged when no overrides are provided.

## 0.5.0

### Minor Changes

- 636c530: Error retry with exponential backoff for all API requests.
  - Transient failures (network errors, 5xx, 429) are retried automatically with exponential backoff and jitter
  - Client errors (4xx) fail immediately — no wasted retries
  - Default: 2 retries, 500ms base delay, 5s max delay
  - Configurable via `retry` option on `createAddressrClient`, or disable with `retry: false`
  - Respects AbortSignal during backoff — cancelled requests stop retrying immediately

## 0.4.0

### Minor Changes

- 69246f7: Prefetch API root on mount, CSS custom properties for theming, and accessibility fixes.
  - **Prefetch**: API root discovery now happens eagerly on mount, eliminating the extra round-trip on the first search.
  - **CSS custom properties**: All visual tokens exposed as `--addressr-*` custom properties. Override on any ancestor element to theme the component without forking. Defaults preserve current appearance.
  - **Accessibility**: Added `name` and `required` props, `aria-atomic` on React status region, `aria-invalid` binding from error state, and `tabindex="-1"` on list items in Svelte/Vue.
