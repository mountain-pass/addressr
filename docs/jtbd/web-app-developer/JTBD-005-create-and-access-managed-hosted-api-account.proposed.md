---
status: proposed
job-id: create-and-access-managed-hosted-api-account
persona: web-app-developer
date-created: 2026-08-29
human-oversight: confirmed
oversight-date: 2026-08-29
screens:
  - 'apps/website/src/pages/account.jsx — sign-in, organisation selection, billing and API-key management'
  - 'apps/addressr-deployment/cloudflare-worker/managed-account.mjs — session, role and organisation authorization'
  - 'apps/addressr-deployment/cloudflare-worker/stripe-channel.mjs — Checkout, Portal and webhook projection'
  - 'apps/addressr-deployment/cloudflare-worker/migrations/0001-managed-channel.sql — organisation-owned commercial state'
  - 'apps/addressr-deployment/main.tf — Clerk production DNS and managed-channel deployment configuration'
---

# JTBD-005: Create and access a managed hosted API account

## Job Statement

When I have selected Addressr's managed hosted API, I want to create and access an organisation-owned account, subscribe and obtain an API key, so I can make authenticated production calls without involving support.

## Desired Outcomes

- Email and Google sign-in, verification, recovery and session expiry are accessible at `app.addressr.io`.
- A customer selects or creates an active organisation before billing or API-key actions.
- One organisation owns its membership, Stripe customer and subscription, entitlement, API keys and usage.
- `org:admin` alone manages membership, Checkout, the Customer Portal and API keys; `org:member` can view and use authorised organisation resources without mutating commercial state.
- Checkout returns to the same organisation and remains pending until a verified Stripe webhook projects entitlement.
- After entitlement exists, an authorised administrator can create an API key whose plaintext is shown once.
- Session expiry, recovery and member removal do not delete organisation-owned commercial resources.

## Persona Constraints

- The Web/App Developer has already evaluated Addressr and selected a tier; account setup must lead to usable credentials without a support hand-off.
- Integration cost matters, so identity, billing and key status must be explicit and recoverable.
- A developer may belong to multiple organisations without leaking keys, usage or billing state between them.

## Current Solutions

- Subscribe through RapidAPI, which remains an independent supported channel.
- Contact Addressr for manually provisioned access.
- Self-host Addressr and operate a separate identity, billing and gateway stack.

## Confirmation

1. Keyboard and screen-reader browser journeys cover sign-in, verification, recovery, organisation selection, Checkout return and API-key creation.
2. An active organisation is required before any commercial action.
3. Members receive HTTP 403 for membership, billing and API-key mutations; administrators can complete them for their organisation.
4. Checkout completion alone grants no access before a valid signed webhook projects entitlement.
5. API-key plaintext appears in exactly one successful creation response and only its hash persists.
6. Cross-organisation membership, billing, key and usage access fails for both roles.
7. Removing a member or expiring a session preserves organisation-owned resources.

## Reassessment Criteria

- Customers need delegated API-key administration without billing or membership authority.
- A procurement actor who never integrates becomes a distinct primary buyer.
- Clerk cannot meet the required accessibility, recovery, organisation or portability outcomes.
