# @mountainpass/addressr-deployment

## 1.0.6

### Patch Changes

- 549d391: Keep the Addressr-managed API and account journeys closed behind one explicit production activation switch. Terraform now rejects activation unless the origin, Clerk, Stripe catalogue, payment-method and metering configuration is complete, while signed Stripe webhooks remain available to prepare entitlement projections before launch.

## 1.0.5

### Patch Changes

- 16098ac: Allow the managed-channel D1 schema to deploy through Cloudflare's remote migration parser while preserving atomic quota enforcement and refunds.

## 1.0.4

### Patch Changes

- b55e356: Add the Addressr-managed hosted API gateway in a default-closed posture. The Cloudflare Worker now supports organisation-scoped API keys, D1-backed entitlement and quota checks, pre-accounting abuse throttling, direct origin routing, Stripe subscription projection, batched meter delivery, and provider-side meter reconciliation while keeping existing RapidAPI traffic unchanged.

## 1.0.3

### Patch Changes

- 1b9f160: Replace the website's bespoke address demo with the published React autocomplete components, adding live address, suburb or town, postcode, and state or territory examples with visible and announced selections.

  Disable browser autofill on the React search comboboxes so native suggestions do not compete with Addressr results.

  Restore the site's square, dark autocomplete styling and show detailed result panels for addresses, localities, postcodes, and states or territories. Address results again include structured and geocoding data plus a keyless map.

  Move website production delivery from Netlify's push integration to a changeset-gated Cloudflare Pages direct upload, with an exact-release revision check before the deployment is accepted.

## 1.0.2

### Patch Changes

- Updated dependencies [635084c]
  - @mountainpass/addressr@3.3.2

## 1.0.1

### Patch Changes

- Updated dependencies [33d06d5]
  - @mountainpass/addressr@3.3.1
