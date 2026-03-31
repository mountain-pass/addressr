---
status: accepted
date: 2020-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 017: RapidAPI as the Primary API Distribution Channel

## Context and Problem Statement

Addressr needs a distribution channel for the hosted API service that handles API key management, rate limiting, billing, and developer discovery.

## Decision Drivers

- API marketplace for developer discovery
- Built-in billing and subscription management
- API key management and rate limiting
- Minimal infrastructure to manage

## Considered Options

1. **RapidAPI** -- API marketplace with built-in monetization
2. **Self-managed API gateway** -- AWS API Gateway or Kong
3. **Direct access** -- expose the EB endpoint directly with custom auth

## Decision Outcome

**Option 1: RapidAPI.** The API is listed publicly on the RapidAPI Hub (category: Data). RapidAPI handles authentication, rate limiting, billing, and developer onboarding.

Gateway configuration:
- Two backend URLs: `https://backend.addressr.io` and `https://backend2.addressr.io`
- Round-robin load balancing across backends
- Version v1 (current)
- Pricing tiers: PRO (per-use) and ULTRA ($49/monthly)

### Consequences

- Good: Zero infrastructure for auth, billing, rate limiting
- Good: Developer discovery via the RapidAPI marketplace
- Good: Built-in analytics and usage tracking
- Good: Round-robin across two backends provides redundancy
- Bad: Revenue share with RapidAPI
- Bad: Dependent on RapidAPI platform availability
- Bad: API consumers are RapidAPI's customers first, addressr's second
- Bad: Limited control over the developer experience

### Confirmation

- RapidAPI Studio shows active listing with public visibility
- Two backend URLs configured with round-robin
- Pricing tiers active with paid subscribers

### Reassessment Criteria

- RapidAPI pricing or terms changes
- Need for custom API gateway features (WebSockets, streaming)
- Desire for direct customer relationships
- Revenue share becoming significant
