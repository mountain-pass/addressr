# @mountainpass/addressr-svelte

Svelte address autocomplete component for Australian address search, powered by [Addressr](https://addressr.io).

Part of the [Addressr](https://github.com/mountain-pass/addressr) monorepo.

## Install

```bash
npm install @mountainpass/addressr-svelte
```

Peer dependencies: `svelte` >= 4.

## Drop-in component

```svelte
<script>
  import { AddressAutocomplete } from '@mountainpass/addressr-svelte';
  import '@mountainpass/addressr-svelte/style.css';
</script>

<AddressAutocomplete
  apiUrl="https://api.addressr.io/"
  onSelect={(address) => {
    console.log(address.sla);          // "1 GEORGE ST, SYDNEY NSW 2000"
    console.log(address.structured);   // { street, locality, state, postcode, ... }
    console.log(address.geocoding);    // { latitude, longitude, ... }
  }}
/>
```

### Props

| Prop          | Type                               | Default                              | Description                               |
| ------------- | ---------------------------------- | ------------------------------------ | ----------------------------------------- |
| `apiKey`      | `string`                           | --                                   | RapidAPI key. Omit for direct API access. |
| `onSelect`    | `(address: AddressDetail) => void` | --                                   | Called when an address is selected        |
| `label`       | `string`                           | `"Search Australian addresses"`      | Accessible label text                     |
| `placeholder` | `string`                           | `"Start typing an address..."`       | Input placeholder                         |
| `debounceMs`  | `number`                           | `300`                                | Debounce delay in milliseconds            |
| `name`        | `string`                           | `"address"`                          | Input name attribute for form submission  |
| `required`    | `boolean`                          | `false`                              | Sets `aria-required` on the input         |
| `apiUrl`      | `string`                           | `"https://addressr.p.rapidapi.com/"` | API root URL                              |
| `apiHost`     | `string`                           | `"addressr.p.rapidapi.com"`          | RapidAPI host header                      |

### Slots

Override rendering zones while keeping built-in search logic and keyboard navigation:

| Slot         | Default                      | Description          |
| ------------ | ---------------------------- | -------------------- |
| `loading`    | Animated skeleton lines      | Custom loading state |
| `no-results` | "No addresses found" message | Custom empty state   |

```svelte
<AddressAutocomplete apiUrl="https://api.addressr.io/" onSelect={handleSelect}>
  <li slot="loading">Loading addresses...</li>
  <li slot="no-results">No matches found</li>
</AddressAutocomplete>
```

When you provide a custom slot, you are responsible for accessibility in that zone.

## Headless store

Build your own UI while keeping the search logic, debounce, pagination, and abort handling:

```svelte
<script>
  import { createAddressSearch } from '@mountainpass/addressr-svelte';

  const search = createAddressSearch({ apiUrl: 'https://api.addressr.io/' });

  function handleInput(e) {
    search.setQuery(e.target.value);
  }
</script>

<input value={$search.query} on:input={handleInput} />

{#if $search.isLoading}
  <p>Searching...</p>
{/if}

<ul>
  {#each $search.results as result}
    <li on:click={() => search.selectAddress(result.pid)}>{result.sla}</li>
  {/each}
  {#if $search.hasMore}
    <li on:click={() => search.loadMore()}>Load more...</li>
  {/if}
</ul>
```

### Store state (`$search`)

| Property          | Type                    | Description                               |
| ----------------- | ----------------------- | ----------------------------------------- |
| `query`           | `string`                | Current input value                       |
| `results`         | `AddressSearchResult[]` | Search results (accumulated across pages) |
| `isLoading`       | `boolean`               | Initial search in progress                |
| `isLoadingMore`   | `boolean`               | Pagination fetch in progress              |
| `hasMore`         | `boolean`               | More pages available                      |
| `error`           | `Error \| null`         | Latest error                              |
| `selectedAddress` | `AddressDetail \| null` | Selected address detail                   |

### Store methods

| Method               | Description                              |
| -------------------- | ---------------------------------------- |
| `setQuery(q)`        | Update query (triggers debounced search) |
| `loadMore()`         | Load next page of results                |
| `selectAddress(pid)` | Fetch full address detail                |
| `clear()`            | Reset all state                          |
| `destroy()`          | Clean up timers and abort controllers    |

## Theming

All visual styles use CSS custom properties. Override on any ancestor element:

```css
.my-form {
  --addressr-font-family: 'Inter', sans-serif;
  --addressr-border-color: #ccc;
  --addressr-focus-color: #0066cc;
  --addressr-highlight-bg: #e0f0ff;
  --addressr-error-color: #c62828;
}
```

| Token                      | Default                                | Description               |
| -------------------------- | -------------------------------------- | ------------------------- |
| `--addressr-font-family`   | `system-ui, -apple-system, sans-serif` | Font stack                |
| `--addressr-padding-x`     | `0.75rem`                              | Horizontal padding        |
| `--addressr-padding-y`     | `0.625rem`                             | Vertical padding          |
| `--addressr-text-color`    | `inherit`                              | Text color                |
| `--addressr-border-color`  | `#767676`                              | Input and dropdown border |
| `--addressr-border-radius` | `0.25rem`                              | Corner radius             |
| `--addressr-focus-color`   | `#005fcc`                              | Focus ring and border     |
| `--addressr-z-index`       | `1000`                                 | Dropdown stacking order   |
| `--addressr-bg`            | `#fff`                                 | Dropdown background       |
| `--addressr-shadow`        | `0 4px 6px rgba(0,0,0,0.1)`            | Dropdown shadow           |
| `--addressr-highlight-bg`  | `#e8f0fe`                              | Active item background    |
| `--addressr-mark-weight`   | `700`                                  | Search match font weight  |
| `--addressr-mark-color`    | `inherit`                              | Search match text color   |
| `--addressr-muted-color`   | `#555`                                 | Status and empty text     |
| `--addressr-error-color`   | `#d32f2f`                              | Error message text        |
| `--addressr-skeleton-from` | `#e0e0e0`                              | Loading skeleton base     |
| `--addressr-skeleton-to`   | `#f0f0f0`                              | Loading skeleton shimmer  |

The loading state shows animated skeleton lines instead of text. The animation respects `prefers-reduced-motion: reduce`.

## Accessibility

Implements the WAI-ARIA combobox pattern:

- Full keyboard navigation (Arrow keys, Enter, Escape)
- Screen reader announcements for results count and loading state
- Visible focus indicators (3:1 contrast)
- Touch targets >= 44px
- Accessible label always present
- Infinite scroll with loading indicator

## Postcode, Locality, and State search

For narrower lookups (postcode-only picker on a shipping form, suburb autocomplete, state dropdown) the package also exports three drop-in components and matching headless stores. Each mirrors `AddressAutocomplete`'s a11y, keyboard, and slot contract; the only difference is `onSelect` receives the `SearchResult` directly (no follow-up detail fetch — see ADR 006).

```svelte
<script>
  import {
    PostcodeAutocomplete,
    LocalityAutocomplete,
    StateAutocomplete,
  } from '@mountainpass/addressr-svelte';
</script>

<PostcodeAutocomplete apiKey="..." onSelect={(r) => console.log(r.postcode, r.localities)} />
<LocalityAutocomplete apiKey="..." onSelect={(r) => console.log(r.name, r.state.abbreviation, r.postcode)} />
<StateAutocomplete    apiKey="..." onSelect={(r) => console.log(r.name, r.abbreviation)} />
```

Headless equivalents `createPostcodeSearch`, `createLocalitySearch`, `createStateSearch` are also exported and follow the same shape as `createAddressSearch`.

## Re-exports

This package re-exports everything from [`@mountainpass/addressr-core`](../core) for convenience -- `createAddressrClient`, `parseHighlight`, and all types.

## License

Apache-2.0
