# @mountainpass/website

## 1.0.3

### Patch Changes

- Updated dependencies [3061317]
  - @mountainpass/addressr-react@0.7.3

## 1.0.2

### Patch Changes

- 89d0ba2: Retry the Addressr website release with the Cloudflare Pages upload reading the built site from the correct workspace-relative path.

## 1.0.1

### Patch Changes

- 1b9f160: Replace the website's bespoke address demo with the published React autocomplete components, adding live address, suburb or town, postcode, and state or territory examples with visible and announced selections.

  Disable browser autofill on the React search comboboxes so native suggestions do not compete with Addressr results.

  Restore the site's square, dark autocomplete styling and show detailed result panels for addresses, localities, postcodes, and states or territories. Address results again include structured and geocoding data plus a keyless map.

  Move website production delivery from Netlify's push integration to a changeset-gated Cloudflare Pages direct upload, with an exact-release revision check before the deployment is accepted.

- Updated dependencies [1b9f160]
  - @mountainpass/addressr-react@0.7.2
