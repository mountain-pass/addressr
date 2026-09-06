# @mountainpass/addressr-deployment

## 1.0.23

### Patch Changes

- 7dba560: Charge a customer's quota when a request is known billable, not before it is attempted.

  The gateway charged before calling the origin and refunded only when the reservation
  row was deleted. A reservation whose settle never completed — a transient database
  error, or a worker stopped between the two steps — would have left the charge standing
  forever, so a customer would have silently lost one request of their paid allowance,
  permanently, per occurrence, with nothing detecting it and nothing repairing it.

  The charge now happens on the outcome being known billable. A reservation that never
  settles costs nothing, so the defect cannot occur rather than being collected after the
  fact. Exhaustion is also now reported as exhaustion rather than as the usage store
  being unavailable, which it was not.

  Two accepted costs, both recorded rather than fixed. Simultaneous requests each read the
  count before it moves, so a hard limit can be exceeded by roughly the number in flight;
  sequential requests are still refused at the limit. And a request reserved just before a
  billing period rolls over is counted against the new period rather than the one it was
  made in. What an overshoot means at the plan boundary has not been measured yet; it is
  tracked as an open launch gate in the managed-channel readiness ledger, not claimed here.

  No customer was affected. The managed channel has never been activated, and with its
  flag off the gateway refuses managed requests before any account is authorised — so
  there was no path by which the old behaviour could reach a customer, and the commercial
  tables were empty at the 2026-09-03 readback. Migration 0003 preserves any count already
  taken, so a count already in progress is not reset by applying it.

## 1.0.22

### Patch Changes

- a745732: Store a closed-set route in usage records instead of the request path.

  Nothing was disclosed, and this is why. The reserve statement persisted the
  request pathname verbatim, and the API declares a single-address lookup whose
  path carries a G-NAF identifier — so ON ACTIVATION the commercial database would
  have begun accumulating which addresses each organisation resolved, against their
  API key, with no redaction and no expiry. The channel is not activated and the
  readback of 2026-09-03 records zero rows in all seven commercial tables, so the
  exposure was entirely prospective. Fixed at the last moment it is cheap. Nothing between
  authorisation and reservation validates the path either, so a caller holding a
  valid key could put anything in any segment, including the first.

  The stored value now comes from a closed set — `root`, `addresses`,
  `addresses/:id`, `other` — so caller input cannot reach the column by
  construction rather than by an argument about what well-behaved clients send.

  Nothing reads the column. In the Worker and the health script, `request_path` is
  written in exactly one statement — the reserve insert — and read in none:
  nothing there selects, filters, groups or orders by it. The only statement that reads
  it anywhere is the test proving it holds no identifier. Billing is per request. Per-endpoint accounting survives at
  collection granularity, and a new endpoint accounts as `other` until an entry is
  added — fail-safe for privacy, blind for accounting.

  No migration: the column definition is unchanged and the tables are empty. No
  customer-visible behaviour changes, and the RapidAPI proxy path does not reach
  this code at all.

  The decision behind it is recorded and NOT ratified: four options were live, one
  is derived as chosen and three rejected, and the maintainer has confirmed none of
  it. The code changed anyway because the defect is
  live and the fix is reversible while the tables are empty.

## 1.0.21

### Patch Changes

- 768ad9a: Withdraw the Cloudflare Email Routing declarations after apply 1 failed.

  Merging the previous release ran the apply, and it failed on both halves. The
  provider's `cloudflare_email_routing_settings` errors converting the API
  response on a missing `support_subaddress` field — an upstream bug introduced in
  5.23.0, still present in the pinned 5.24.0, with the fix unmerged. Both address
  creates returned 403 because the deploy token carries no Email Routing write
  scope.

  Left declared, those three resources fail every subsequent release apply, so
  this removal is what unblocks the release path rather than a change of
  direction. Alert coverage returns to MISSING, which is the state ADR-089 already
  records as accurate while the terminus is unbuilt.

  This apply should be a no-op. Terraform recorded nothing for the three
  resources, so the plan should show zero actions for them. **Read the plan
  comment before merging: a `destroy` on any of the three would mean state was
  written after all, which also answers half of an open question — whether the
  enable call succeeded server-side while Terraform recorded nothing.**

  The zone may now be routing-enabled with no rule, and may carry a second apex
  SPF record, which is a silent permanent failure. Neither is visible from the
  tree and neither is settled here.

  No package or API surface changes. Nothing the live service serves is touched.

## 1.0.20

### Patch Changes

- 3693053: Declare Cloudflare Email Routing and two destination addresses, the first of two
  applies for the managed-channel fault notification.

  Apply one carries only what has no verification dependency: routing enabled on
  the zone, a destination address reusing the mailbox the operations topic already
  alerts so the notification has somewhere to send, and a separate address for
  inbound mail so that arbitrary mail to the domain does not land in the inbox
  carrying the search trip-wire. Both addresses are protected against silent
  replacement, because each holds a verification a person performs once.

  The catch-all rule and the Worker's send binding follow in a second apply, once
  both addresses are verified. A rule pointing at an unverified address is
  documented as staying disabled, but that describes the rule's state rather than
  whether its create call succeeds, and nothing establishes the second. Attempting
  it inside this release risks failing after the packages have published.

  Apply one therefore leaves the zone with routing enabled and no rule, for the
  interval until apply two. That state is reasoned rather than observed to refuse
  inbound mail. It is accepted here because the zone's only mail path is registrar
  forwarding that reaches nobody, recorded in the decision this implements, so the
  interval is reasoned to cost nothing, and because it is entered knowingly rather than
  discovered after a release failed partway.

  No routing DNS records are declared, because whether enabling creates them is
  unestablished — the provider's DNS piece only reports the required records, and
  nothing we have read settles who creates them. Read this release's plan comment
  before merging: whether records appear, whether enabling succeeds against the
  zone's existing registrar forwarding, and whether a second apex SPF record
  appears. The last would be a
  silent permanent failure, since the apex already carries one.

  No package or API surface changes. The zone's inbound-mail handling does change.

## 1.0.19

### Patch Changes

- 9a22040: Remove the SMS fault subscription, the variable holding its endpoint, the
  publish role and the workflow wiring that carried the variable.

  All four were added earlier the same day and the configuration was never
  applied, so this removes infrastructure-as-code that never took effect. No
  replacement is in place, and the managed channel has no fault notification.

  No published interface, endpoint or behaviour changes.

## 1.0.18

### Patch Changes

- e0bde2a: Restore the pre-rehearsal Worker after the rollback check. Entitlement repair and monitoring remain intact, and managed access stays disabled.

## 1.0.17

### Patch Changes

- 1bd54e8: Rehearse rollback to the previous working Worker with managed access disabled. Entitlement repair, the current D1 schema and monitoring remain intact. Restore the current Worker after verification.

## 1.0.16

### Patch Changes

- fe697df: Add read-only checks for managed meter delivery and reconciliation, with bounded reports for an agent to detect failed or stale monitoring. Reports exclude customer identifiers and usage totals. Managed access remains disabled; these checks do not verify billing or entitlement parity.

## 1.0.15

### Patch Changes

- ee8aa87: Allow scheduled entitlement reconciliation to repair an existing projection on repeated runs without losing usage from the current billing period. Signed Stripe webhook replay protection remains unchanged. Managed customer access remains disabled pending launch verification.

## 1.0.14

### Patch Changes

- 90faafd: Restore managed-channel deployment by making the pending quota migration compatible with Cloudflare D1 parsing. Retry the account usage display release that the failed migration prevented. Managed access remains disabled.

## 1.0.13

### Patch Changes

- faa325f: Preserve each managed plan's request policy: hard limits still stop at the allowance, while pay-per-use and overage plans continue counting billable requests. Account usage now distinguishes included requests from an access limit. Existing entitlements retain their hard limits during migration; managed access remains disabled pending launch verification.

## 1.0.12

### Patch Changes

- 7e03b5a: Restrict managed account and API access to explicitly allowed organisations for operator verification. Missing or invalid configuration denies access before account storage or customer usage; existing identity, subscription and quota checks still apply. Managed access remains disabled, and this release does not activate billing or public signup. RapidAPI, demo, monitoring and signed webhook handling are unchanged.

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
