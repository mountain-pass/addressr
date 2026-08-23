---
human-oversight: unconfirmed
oversight-date: 2026-07-18
name: web-app-developer
description: Builds customer-facing web/mobile apps that need fast, accurate Australian address autocomplete with simple API contracts.
---

# Web/App Developer

## Who

Builds customer-facing web or mobile applications that need Australian address input. Wants a fast, accurate autocomplete that drops into existing forms with minimal integration effort.

## Context Constraints

- Cares about latency, result quality, and simple API contracts
- Integrates via HTTP/REST or MCP from a customer-facing surface
- Address input is one feature among many; integration cost matters
- Autocomplete UX expectations are set by Google Maps and similar tools
- **Arrives evaluating before integrating.** The same person reaches the marketing site first, tries the live Search demo, reads the quick-start, and chooses a tier before writing any integration code. AMENDED 2026-08-23, user-directed, on the `apps/website` import (ADR-053): the site brought eight user-facing surfaces into scope and the pricing page addresses someone selecting and paying for a tier, which no persona covered. Modelled as a stage of THIS persona rather than a separate buyer, because it is one journey and splitting it would fork it across two files. If a procurement actor who never integrates turns out to be real for Addressr, that is a genuine second persona and this constraint is the wrong home for them.
- **The enterprise path leaves the product surface at the first click.** ADR-053 deletes the in-product quote form and repoints the Enterprise call-to-action at email, so nothing in-product serves a buyer past that point. That is what keeps the amendment above sufficient.

## Pain Points

- Inaccurate results that surface non-existent or wrong addresses
- Complex SDKs that take hours to wire in
- Expensive pricing tiers at the volumes consumer apps see
- Cannot tell from a landing page whether the data or the latency is good enough without wiring something up first
