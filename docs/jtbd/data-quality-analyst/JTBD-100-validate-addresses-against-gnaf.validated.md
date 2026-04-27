---
status: validated
job-id: validate-addresses-against-gnaf
persona: data-quality-analyst
date-created: 2026-04-15
secondary-personas:
  - web-app-developer
screens:
  - /addresses
  - /addresses/{id}
---

# JTBD-100: Validate addresses against G-NAF

## Job Statement

When I receive a customer address, I want to validate it against G-NAF, so I know it's a real, deliverable location.

When cleaning a dataset of addresses, I want confidence scores, so I can prioritize which records need manual review.

## Desired Outcomes

- Every result includes a confidence score
- Structured address output matches G-NAF format
- Invalid addresses return empty results (not false positives)

## Persona Constraints

- **Data Quality Analyst** (primary): batch validation against authoritative data with audit trail.
- **Web/App Developer** (secondary): inline validation at form-submit time.

## Current Solutions

- Australia Post Address Verification — official but expensive licensing.
- Self-maintained G-NAF + custom matcher — high operational cost, search quality varies.
