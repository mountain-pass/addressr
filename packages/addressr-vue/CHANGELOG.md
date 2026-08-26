# @mountainpass/addressr-vue

## 0.7.0

### Minor Changes

- 54cce83: Add `PostcodeAutocomplete`, `LocalityAutocomplete`, and `StateAutocomplete` components plus matching headless hooks/stores/composables (`usePostcodeSearch`/`useLocalitySearch`/`useStateSearch` for React and Vue, `createPostcodeSearch`/`createLocalitySearch`/`createStateSearch` for Svelte) across all three framework packages.

  Each component mirrors the existing `AddressAutocomplete` baseline:
  - WAI-ARIA combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-required`, `aria-invalid`, `aria-describedby`)
  - `role="status"` `aria-live="polite"` live region with entity-specific announcements
  - Full keyboard support (ArrowDown/Up, Enter, Escape; ArrowDown opens menu when closed)
  - 44px minimum touch target and 3:1 focus ring inherited from existing `--addressr-*` tokens (no new tokens)
  - Same four render zones per ADR 004: `renderItem`/`renderLoading`/`renderNoResults`/`renderError` (props in React, slots in Svelte/Vue: `item`, `loading`, `no-results`, `error`)

  `onSelect` (React)/`select` event (Vue)/`onSelect` prop (Svelte) emits the search result directly — postcode, locality, and state results carry every field consumers need, so no follow-up HATEOAS detail fetch is performed (asymmetry with `AddressAutocomplete` is deliberate; see ADR 006).

  Internal refactor: `useAddressSearch` (React/Vue) and `createAddressSearch` (Svelte) now delegate to a private generic primitive (`useSearch<T>` / `createSearch<T>`) shared with the new wrappers. Public API and behaviour unchanged — covered by existing test suites as a regression gate.

  See ADR 006 (`docs/decisions/006-additional-search-endpoints.accepted.md`) for the architectural rationale.

### Patch Changes

- Updated dependencies [825cf97]
  - @mountainpass/addressr-core@0.7.0

## 0.6.1

### Patch Changes

- 2f606df: docs: document theming, render customization, form props, retry config, and skeleton loading in READMEs
- Updated dependencies [2f606df]
  - @mountainpass/addressr-core@0.6.1

## 0.6.0

### Minor Changes

- 2856995: Loading skeleton animation and render customization for styled components.
  - **Skeleton loading**: Replaces "Searching..." text with 3 animated shimmer lines. Respects `prefers-reduced-motion: reduce`. Customizable via `--addressr-skeleton-from` and `--addressr-skeleton-to` tokens.
  - **React render props**: `renderLoading`, `renderNoResults`, `renderError`, `renderItem` — override any rendering zone while keeping built-in accessibility.
  - **Svelte named slots**: `loading`, `no-results` — slot-based customization.
  - **Vue scoped slots**: `loading`, `no-results` — scoped slot customization.
  - Default rendering is unchanged when no overrides are provided.

### Patch Changes

- Updated dependencies [2856995]
  - @mountainpass/addressr-core@0.6.0

## 0.5.0

### Minor Changes

- 636c530: Error retry with exponential backoff for all API requests.
  - Transient failures (network errors, 5xx, 429) are retried automatically with exponential backoff and jitter
  - Client errors (4xx) fail immediately — no wasted retries
  - Default: 2 retries, 500ms base delay, 5s max delay
  - Configurable via `retry` option on `createAddressrClient`, or disable with `retry: false`
  - Respects AbortSignal during backoff — cancelled requests stop retrying immediately

### Patch Changes

- Updated dependencies [636c530]
  - @mountainpass/addressr-core@0.5.0

## 0.4.0

### Minor Changes

- 69246f7: Prefetch API root on mount, CSS custom properties for theming, and accessibility fixes.
  - **Prefetch**: API root discovery now happens eagerly on mount, eliminating the extra round-trip on the first search.
  - **CSS custom properties**: All visual tokens exposed as `--addressr-*` custom properties. Override on any ancestor element to theme the component without forking. Defaults preserve current appearance.
  - **Accessibility**: Added `name` and `required` props, `aria-atomic` on React status region, `aria-invalid` binding from error state, and `tabindex="-1"` on list items in Svelte/Vue.

### Patch Changes

- Updated dependencies [69246f7]
  - @mountainpass/addressr-core@0.4.0

## 0.3.0

### Minor Changes

- 50b8be0: Add Svelte and Vue address autocomplete packages. Both provide a headless
  state layer (Svelte store / Vue composable) and a drop-in styled component
  with WAI-ARIA combobox pattern, keyboard navigation, infinite scroll
  pagination, and screen reader announcements. Both depend on
  @mountainpass/addressr-core for the HATEOAS API client.
