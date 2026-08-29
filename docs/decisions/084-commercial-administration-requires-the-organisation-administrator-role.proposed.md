---
status: 'proposed'
date: 2026-08-29
human-oversight: confirmed
oversight-date: 2026-08-29
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent]
informed: []
reassessment-date: 2026-11-29
---

# Commercial administration requires the organisation administrator role

## Context and Problem Statement

ADR-067 makes the organisation the commercial ownership boundary but deliberately leaves role policy undecided. Addressr must decide which Clerk organisation roles may administer membership, Stripe billing and API keys before the managed channel can open.

## Decision Drivers

- Apply least privilege to customer billing and credentials.
- Reuse Clerk's default organisation roles.
- Keep one consistent authorization rule across commercial mutations.
- Avoid a custom permission system without demonstrated need.

## Considered Options

1. **Administrator-only commercial management.** Organisation administrators manage membership, Checkout, the Customer Portal and API keys; members can view and use authorised organisation resources.
2. **Split administration.** Administrators manage membership and billing while members may create and revoke API keys.
3. **Granular permissions.** Custom roles or permissions separately control membership, billing and API-key management.

## Decision Outcome

Chosen option: **"Administrator-only commercial management."** `org:admin` alone may mutate membership, billing and API keys. `org:member` may view and use authorised resources but may not change the organisation's commercial state. This is the least-privilege option, matches the existing implementation and uses Clerk's two default roles.

## Consequences

### Good

- One role boundary protects every commercial mutation.
- The implementation needs no custom role or permission system.
- Members cannot create credentials or alter billing without administrator authority.

### Neutral

- Every customer must retain at least one organisation administrator.

### Bad

- Teams cannot delegate API-key management without also granting broader administrator authority.
- Administrator recovery becomes operationally important.

## Confirmation

1. `org:member` receives HTTP 403 from Addressr Checkout, Customer Portal, API-key creation and API-key revocation operations.
2. `org:admin` can complete those same Addressr operations for its active organisation.
3. Clerk configuration readback and a browser journey prove members cannot invite or remove members while administrators can.
4. Both roles fail to access another organisation's commercial resources.
5. Removing a member preserves the organisation's Stripe customer and subscription, entitlement, API keys and usage.

## Pros and Cons of the Options

### Administrator-only commercial management

- Good, because it is least privilege and matches Clerk's default roles.
- Bad, because API-key delegation requires full administrator authority.

### Split administration

- Good, because developers could manage keys without billing or membership authority.
- Bad, because members could mint production credentials and the role boundary would differ by operation.

### Granular permissions

- Good, because each responsibility could be delegated independently.
- Bad, because it adds custom permission design and support before a customer need is proven.

## Reassessment Criteria

Reassess when customer evidence shows that API-key administration must be delegated without membership or billing authority, or when Clerk's default roles cannot support required recovery and audit behaviour.

## Related

- [ADR-066 — Clerk as the application identity provider](066-clerk-as-the-application-identity-provider.proposed.md)
- [ADR-067 — Organisations as the commercial ownership boundary](067-organisations-as-the-commercial-ownership-boundary.proposed.md)
- [ADR-068 — Stripe-hosted billing interactions](068-stripe-hosted-billing-interactions.proposed.md)
- [ADR-070 — Organisation-scoped one-time-visible hashed API keys](070-organisation-scoped-one-time-visible-hashed-api-keys.proposed.md)
- [JTBD-005 — Create and access a managed hosted API account](../jtbd/web-app-developer/JTBD-005-create-and-access-managed-hosted-api-account.proposed.md)
