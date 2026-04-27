---
status: validated
job-id: lookup-locality-postcode-state
persona: web-app-developer
date-created: 2026-04-15
secondary-personas:
  - ai-assistant-user
screens:
  - /localities
  - /postcodes
  - /states
  - MCP search-localities, search-postcodes, search-states
---

# JTBD-002: Look up localities, postcodes, and states

## Job Statement

When building a suburb picker for a delivery form, I want to search localities by name, so users can select their suburb without entering a full address.

When a user enters a postcode, I want to see which suburbs it covers, so I can validate or auto-fill the locality field.

## Desired Outcomes

- Searching "lilydale" returns LILYDALE, VIC 3140 as a locality result
- Searching postcode "3140" returns associated localities
- State search supports both abbreviation ("NSW") and name ("New South Wales")

## Persona Constraints

- **Web/App Developer** (primary): area-level pickers in delivery, billing, or onboarding forms.
- **AI Assistant User** (secondary): grounding queries about Australian geography.

## Current Solutions

- Hard-coded postcode/suburb lists that go stale.
- Government open-data dumps that require local indexing and maintenance.
