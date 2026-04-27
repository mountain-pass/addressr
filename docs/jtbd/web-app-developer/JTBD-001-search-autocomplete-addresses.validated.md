---
status: validated
job-id: search-autocomplete-addresses
persona: web-app-developer
date-created: 2026-04-15
secondary-personas:
  - ai-assistant-user
screens:
  - /addresses
  - MCP search-addresses
---

# JTBD-001: Search and autocomplete addresses from partial input

## Job Statement

When a user starts typing an address into a form, I want instant suggestions from authoritative data, so I can reduce errors and speed up data entry.

When a user types a partial street name, I want fuzzy matching to handle typos and abbreviations, so they still find the right address.

## Desired Outcomes

- Results appear within 200 ms of input
- Correct address appears in the first page of results for reasonable queries
- Typos and abbreviations (e.g., "ST" vs "STREET") still match

## Persona Constraints

- **Web/App Developer** (primary): integrates via HTTP/REST in a customer-facing form. Latency-sensitive, expects Google-Maps-grade UX.
- **AI Assistant User** (secondary): same surface via MCP. Natural-language queries should produce structured results.

## Current Solutions

- Google Maps Autocomplete — global coverage but expensive at scale, no G-NAF PIDs.
- Australia Post PAF — official but expensive licensing, no free tier.
- Manual entry — error-prone and slow.
