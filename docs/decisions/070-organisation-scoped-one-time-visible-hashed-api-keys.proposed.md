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

# Organisation-scoped one-time-visible hashed API keys

## Context and Problem Statement

Direct-channel API clients need non-interactive credentials. Addressr must choose their ownership, storage and revocation model without storing reusable plaintext secrets.

## Decision Drivers

- Keep credentials within one organisation boundary.
- Avoid recoverable plaintext in databases and logs.
- Support independent naming, rotation and revocation.
- Keep request authentication simple for API consumers.

## Considered Options

1. **Opaque one-time-visible keys stored as hashes (chosen).**
2. **Long-lived signed bearer tokens.**
3. **Recoverable plaintext API keys.**

## Decision Outcome

Chosen option: **"Opaque one-time-visible keys stored as hashes."** Each key belongs to one organisation, has a customer-visible name, is displayed once at creation, stored only as a secure hash, and can be revoked independently.

## Consequences

### Good

- A database read does not reveal reusable API credentials.
- Organisations can rotate one integration without disrupting others.
- Key ownership and revocation are explicit.

### Neutral

- Lost key plaintext cannot be recovered; customers create a replacement.

### Bad

- Prefix lookup, hashing cost and constant-time comparison require careful implementation.
- Support must explain one-time visibility clearly.

## Confirmation

1. Key plaintext appears only in the successful creation response and never in subsequent reads.
2. Database records and logs contain no full key plaintext.
3. Every key references exactly one organisation and has a unique customer-visible name within it.
4. Revoking one key leaves sibling keys usable while organisation entitlement remains active.
5. Authentication uses a slow-enough secure hash and constant-time verification appropriate to the key format.

## Pros and Cons of the Options

### Opaque hashed keys

- Good, because they are familiar to API consumers and non-recoverable at rest.
- Bad, because the creation moment is the only display opportunity.

### Signed bearer tokens

- Good, because some claims can be verified without a database lookup.
- Bad, because revocation and entitlement freshness become harder.

### Recoverable plaintext

- Good, because support can show an existing key again.
- Bad, because database compromise exposes reusable credentials.

## Reassessment Criteria

Reassess if customers require short-lived machine identity, delegated scopes, or standards-based workload federation.

## Related

- [ADR-064 — Commercial request state stored in Cloudflare D1](064-commercial-request-state-stored-in-cloudflare-d1.proposed.md)
- [ADR-067 — Organisations as the commercial ownership boundary](067-organisations-as-the-commercial-ownership-boundary.proposed.md)
