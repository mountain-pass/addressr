# @mountainpass/website

## 1.0.10

### Patch Changes

- faa325f: Preserve each managed plan's request policy: hard limits still stop at the allowance, while pay-per-use and overage plans continue counting billable requests. Account usage now distinguishes included requests from an access limit. Existing entitlements retain their hard limits during migration; managed access remains disabled pending launch verification.

## 1.0.9

### Patch Changes

- ffbb37b: Announce completed and cancelled hosted-plan checkouts to screen readers when customers return to the account page.
- 0a49e82: Move focus to the visible “Copy this API key now” heading after creating a managed API key, so keyboard and screen-reader users land on the one-time key instructions.

## 1.0.8

### Patch Changes

- 1273b22: Deploy website releases with Wrangler's cache in the writable GitHub runner temporary directory, avoiding a post-upload permission failure after the containerised production deployment.

## 1.0.7

### Patch Changes

- e998686: Keep keyboard focus on the destination page when navigating from the site menu, even when the menu's inert state and Gatsby route update complete in different frames.
- Updated dependencies [2079904]
  - @mountainpass/addressr-react@0.7.5

## 1.0.6

### Patch Changes

- b55e356: Add the Addressr account route and managed-hosted API website journey. The site now links to the account app, keeps RapidAPI as an available hosted path, documents hosted/self-hosted responsibilities, and provides an accessible Clerk-backed account shell for billing, quota, and API-key management.

## 1.0.5

### Patch Changes

- 5350902: Wait until an address query contains at least three characters after whitespace normalisation before searching or showing an empty result. Replace the homepage evidence heading with buyer-focused copy.
- Updated dependencies [5350902]
  - @mountainpass/addressr-react@0.7.4

## 1.0.4

### Patch Changes

- e77e20d: Lead addressr.io with the hosted Australian address-quality API for product and data owners. Add a complete hosted first-request journey, evidence-backed service and adoption proof, accessible pricing comparison, static task-oriented API guide, and detailed address, locality, postcode and state demonstrations. Clarify the RapidAPI account handoff, keep self-hosting as a supported secondary path, and remove the client-only Swagger UI bundle.

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
