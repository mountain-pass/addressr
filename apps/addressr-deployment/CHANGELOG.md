# @mountainpass/addressr-deployment

## 1.0.11

### Patch Changes

- 61f4ed1: Prepare the dormant managed API for production billing configuration by wiring its Stripe runtime inputs through the same reviewed plan and release path. Terraform now supplies the catalogue price and meter identifiers it already owns, while customer access remains disabled.

  Verified subscription events from other integrations sharing the Stripe account are acknowledged without changing Addressr entitlements.

- dc31658: Provision the managed billing webhook through Terraform and pass its signing secret directly to the gateway, removing manual secret copying. Customer access and catalogue sales remain disabled pending launch verification.
- 86abeb5: Keep successful managed API responses available when D1 reports both the usage settlement and its quota-trigger side effect. Missing or failed settlements still fail closed.

## 1.0.10

### Patch Changes

- 0ff5c8b: Mark managed-channel Stripe customers so Addressr payment recovery can be scoped without changing other products in the Stripe account.

## 1.0.9

### Patch Changes

- cf0cf27: Provision Addressr's inactive Stripe launch catalogue through the governed Terraform release pipeline. This does not enable the managed channel or create customers, subscriptions or charges.

## 1.0.8

### Patch Changes

- 9fccb51: Supply the production Clerk publishable key and JWT verification key to the matching Terraform plan and release paths, allowing identity configuration to reach the managed-channel Worker while the customer channel remains disabled.

## 1.0.7

### Patch Changes

- c2b1da6: Provision Addressr's Clerk production DNS records through the existing Terraform release path so managed-account authentication, the account portal and verification email can be activated without dashboard-only infrastructure.

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
