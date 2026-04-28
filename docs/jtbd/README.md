# Jobs To Be Done (JTBD) Index

> Migrated from `docs/JOBS_TO_BE_DONE.md` on 2026-04-28 per ADR-008 Option 3.
> The wr-jtbd:agent and the JTBD edit-gate hooks read from this directory only.

## Web/App Developer

Builds customer-facing web/mobile apps that need fast, accurate Australian address autocomplete with simple API contracts.

[Persona definition](web-app-developer/persona.md)

### Validated

| ID       | Job                                          | File                                                                                 |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| JTBD-001 | Search and autocomplete addresses from input | [JTBD-001](web-app-developer/JTBD-001-search-autocomplete-addresses.validated.md)    |
| JTBD-002 | Look up localities, postcodes, and states    | [JTBD-002](web-app-developer/JTBD-002-lookup-locality-postcode-state.validated.md)   |
| JTBD-003 | Geocode addresses to coordinates             | [JTBD-003](web-app-developer/JTBD-003-geocode-addresses-to-coordinates.validated.md) |

## Data Quality Analyst

Validates, normalizes, and enriches Australian address datasets against the authoritative G-NAF source.

[Persona definition](data-quality-analyst/persona.md)

### Validated

| ID       | Job                              | File                                                                                   |
| -------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| JTBD-100 | Validate addresses against G-NAF | [JTBD-100](data-quality-analyst/JTBD-100-validate-addresses-against-gnaf.validated.md) |
| JTBD-101 | Normalize messy address data     | [JTBD-101](data-quality-analyst/JTBD-101-normalize-messy-address-data.validated.md)    |

## Self-Hosted Operator

Runs addressr on their own infrastructure for sovereignty, privacy, or cost reasons; may front it with their own API gateway.

[Persona definition](self-hosted-operator/persona.md)

### Validated

| ID       | Job                                 | File                                                                            |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| JTBD-200 | Protect the chosen gateway boundary | [JTBD-200](self-hosted-operator/JTBD-200-protect-gateway-boundary.validated.md) |

### Proposed

| ID       | Job                                                                            | File                                                                                         |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| JTBD-201 | Validate a new search backend with realistic production traffic before cutover | [JTBD-201](self-hosted-operator/JTBD-201-validate-search-backend-before-cutover.proposed.md) |

## AI Assistant User

Uses addressr through MCP integration in Claude, Cursor, VS Code Copilot, or similar AI tools.

[Persona definition](ai-assistant-user/persona.md)

This persona is a secondary participant on **JTBD-001** and **JTBD-002**. No persona-exclusive jobs are documented today.

## Addressr Contributor/Maintainer

Lands code to the Addressr repo under a trunk-based workflow with automated changeset-driven releases to npm, Docker, and AWS.

[Persona definition](addressr-maintainer/persona.md)

### Validated

| ID       | Job                               | File                                                                                    |
| -------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| JTBD-400 | Ship releases reliably from trunk | [JTBD-400](addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md) |

## Current Solutions / Alternatives

| Alternative              | Strengths                   | Weaknesses vs Addressr                                        |
| ------------------------ | --------------------------- | ------------------------------------------------------------- |
| Google Maps Autocomplete | Global coverage, well-known | Expensive at scale, not AU-authoritative, no G-NAF PIDs       |
| Australia Post PAF       | Official postal data        | Expensive licensing, no free tier, limited API                |
| Manual data entry        | No integration needed       | Error-prone, slow, no validation                              |
| Self-maintained G-NAF    | Full control                | Complex setup, quarterly update burden, search quality varies |
