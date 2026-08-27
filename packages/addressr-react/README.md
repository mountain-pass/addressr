# @mountainpass/addressr-react

React address autocomplete component for Australian address search, powered by [Addressr](https://addressr.io).

Part of the [Addressr](https://github.com/mountain-pass/addressr) monorepo.

## Install

```bash
npm install @mountainpass/addressr-react
```

Peer dependencies: `react` >= 18, `react-dom` >= 18.

## Drop-in component

```tsx
import { AddressAutocomplete } from '@mountainpass/addressr-react';
import '@mountainpass/addressr-react/style.css';

function MyForm() {
  return (
    <AddressAutocomplete
      apiUrl="https://api.addressr.io/"
      onSelect={(address) => {
        console.log(address.sla); // "1 GEORGE ST, SYDNEY NSW 2000"
        console.log(address.structured); // { street, locality, state, postcode, ... }
        console.log(address.geocoding); // { latitude, longitude, ... }
      }}
    />
  );
}
```

### Props

| Prop              | Type                                         | Default                              | Description                                        |
| ----------------- | -------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| `apiKey`          | `string`                                     | --                                   | RapidAPI key. Omit for direct API access.          |
| `onSelect`        | `(address: AddressDetail) => void`           | **required**                         | Called when an address is selected                 |
| `label`           | `string`                                     | `"Search Australian addresses"`      | Accessible label text                              |
| `placeholder`     | `string`                                     | `"Start typing an address..."`       | Input placeholder                                  |
| `className`       | `string`                                     | --                                   | Additional CSS class for the wrapper               |
| `debounceMs`      | `number`                                     | `300`                                | Debounce delay in milliseconds                     |
| `name`            | `string`                                     | `"address"`                          | Input name attribute for form submission           |
| `required`        | `boolean`                                    | --                                   | Adds native required state and a visible indicator |
| `apiUrl`          | `string`                                     | `"https://addressr.p.rapidapi.com/"` | API root URL                                       |
| `apiHost`         | `string`                                     | `"addressr.p.rapidapi.com"`          | RapidAPI host header                               |
| `renderLoading`   | `() => ReactNode`                            | --                                   | Custom loading state renderer                      |
| `renderNoResults` | `() => ReactNode`                            | --                                   | Custom no-results renderer                         |
| `renderError`     | `(error: Error) => ReactNode`                | --                                   | Custom error renderer                              |
| `renderItem`      | `(item, highlighted, segments) => ReactNode` | --                                   | Custom result item renderer                        |

### Render customization

Override any rendering zone while keeping built-in search logic and keyboard navigation:

```tsx
<AddressAutocomplete
  apiUrl="https://api.addressr.io/"
  onSelect={handleSelect}
  renderLoading={() => <li>Loading addresses...</li>}
  renderNoResults={() => <li>No matches found</li>}
  renderError={(err) => <div role="alert">Error: {err.message}</div>}
  renderItem={(item, highlighted, segments) => (
    <span>
      {segments.map((s, i) =>
        s.highlighted ? <mark key={i}>{s.text}</mark> : s.text,
      )}
    </span>
  )}
/>
```

When you provide a custom renderer, you are responsible for accessibility in that zone -- use appropriate roles and contrast ratios. Custom error content is automatically associated with the input; keep `role="alert"` on the rendered error so it is announced when it appears.

## Headless hook

Build your own UI while keeping the search logic, debounce, pagination, and abort handling:

```tsx
import { useAddressSearch } from '@mountainpass/addressr-react';

function MyCustomAutocomplete() {
  const {
    query,
    setQuery,
    results,
    isLoading,
    hasMore,
    loadMore,
    isLoadingMore,
    selectedAddress,
    selectAddress,
    error,
    clear,
  } = useAddressSearch({ apiUrl: 'https://api.addressr.io/' });

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>
        {results.map((r) => (
          <li key={r.pid} onClick={() => selectAddress(r.pid)}>
            {r.sla}
          </li>
        ))}
        {hasMore && <li onClick={loadMore}>Load more...</li>}
      </ul>
    </div>
  );
}
```

### Return values

| Property          | Type                             | Description                               |
| ----------------- | -------------------------------- | ----------------------------------------- |
| `query`           | `string`                         | Current input value                       |
| `setQuery`        | `(q: string) => void`            | Update query (triggers debounced search)  |
| `results`         | `AddressSearchResult[]`          | Search results (accumulated across pages) |
| `isLoading`       | `boolean`                        | Debounce or initial search in progress    |
| `isLoadingMore`   | `boolean`                        | Pagination fetch in progress              |
| `hasMore`         | `boolean`                        | More pages available                      |
| `loadMore`        | `() => Promise<void>`            | Load next page of results                 |
| `error`           | `Error \| null`                  | Latest error                              |
| `selectedAddress` | `AddressDetail \| null`          | Selected address detail                   |
| `selectAddress`   | `(pid: string) => Promise<void>` | Fetch full address detail                 |
| `clear`           | `() => void`                     | Reset all state                           |

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

Built with [downshift](https://www.downshift-js.com/) for WAI-ARIA combobox pattern compliance:

- Full keyboard navigation (Arrow keys, Enter, Escape)
- Screen reader announcements for search, pagination, and settled result counts
- Visible focus indicators (3:1 contrast)
- Touch targets >= 44px
- Accessible label always present
- Native and visible required-field indication when `required` is set
- Custom errors remain programmatically associated with the input
- Infinite scroll with loading indicator

## Postcode, Locality, and State search

For narrower lookups (postcode-only picker on a shipping form, suburb autocomplete, state dropdown) the package also exports three drop-in components and matching headless hooks. Each mirrors `AddressAutocomplete`'s a11y, keyboard, and render-zone contract; the only difference is `onSelect` receives the `SearchResult` directly (no follow-up detail fetch — see ADR 006).

```tsx
import { PostcodeAutocomplete, LocalityAutocomplete, StateAutocomplete } from '@mountainpass/addressr-react';

<PostcodeAutocomplete apiKey="..." onSelect={(r) => console.log(r.postcode, r.localities)} />
<LocalityAutocomplete apiKey="..." onSelect={(r) => console.log(r.name, r.state.abbreviation, r.postcode)} />
<StateAutocomplete   apiKey="..." onSelect={(r) => console.log(r.name, r.abbreviation)} />
```

Headless equivalents `usePostcodeSearch`, `useLocalitySearch`, `useStateSearch` are also exported and follow the same shape as `useAddressSearch`.

## Re-exports

This package re-exports everything from [`@mountainpass/addressr-core`](../core) for convenience -- `createAddressrClient`, `parseHighlight`, and all types.

## License

Apache-2.0
