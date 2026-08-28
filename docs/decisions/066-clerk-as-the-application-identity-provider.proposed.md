---
status: 'proposed'
date: 2026-08-28
human-oversight: confirmed
oversight-date: 2026-08-28
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-28
---

# Clerk as the application identity provider

## Context and Problem Statement

The Addressr-managed channel needs sign-in, sessions, invitations and membership administration. Stripe Customer records do not provide application identity, and building authentication would add security-sensitive work unrelated to address search.

## Decision Drivers

- Use a managed, security-maintained identity service.
- Support organisation membership and invitations.
- Keep payment data and application identity separate.
- Avoid custom password, recovery and session code.

## Considered Options

1. **Clerk (chosen).**
2. **Build identity in Addressr.**
3. **Use Stripe Customer records as identity.**

## Decision Outcome

Chosen option: **"Clerk."** Clerk is authoritative for user identity, authenticated sessions, invitations and membership. It does not decide subscriptions, entitlements, API keys or billable usage.

## Consequences

### Good

- Addressr avoids owning password and session infrastructure.
- Invitations and membership use a managed product.
- Identity and payment responsibilities remain distinct.

### Neutral

- Clerk identifiers must be mapped to Addressr's commercial ownership records.

### Bad

- Account access depends on a third-party identity provider.
- Addressr must test Clerk-hosted journeys for accessibility and recovery behaviour.

## Confirmation

1. Sign-in, sign-out, session expiry, recovery and invitation journeys use Clerk-supported flows.
2. No Addressr database stores passwords or password-reset secrets.
3. Clerk outage does not cause an already authenticated API request to call Clerk synchronously.
4. Clerk claims alone cannot create or extend a paid entitlement.
5. Keyboard and screen-reader tests cover the integrated account journeys before launch.

## Pros and Cons of the Options

### Clerk

- Good, because it supplies the required identity capabilities without custom auth code.
- Bad, because it creates provider dependency and integration work.

### Build identity

- Good, because Addressr would control every identity record and screen.
- Bad, because it adds high-risk security work with no demonstrated advantage.

### Stripe as identity

- Good, because it avoids another provider.
- Bad, because Stripe Customers are not application sessions or membership records.

## Reassessment Criteria

Reassess if Clerk cannot satisfy required organisation, recovery, accessibility, residency or portability needs.

## Related

- [ADR-067 — Organisations as the commercial ownership boundary](067-organisations-as-the-commercial-ownership-boundary.proposed.md)
