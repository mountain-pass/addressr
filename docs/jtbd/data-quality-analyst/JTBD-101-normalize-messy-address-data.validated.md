---
status: validated
job-id: normalize-messy-address-data
persona: data-quality-analyst
date-created: 2026-04-15
screens:
  - /addresses
---

# JTBD-101: Normalize messy address data

## Job Statement

When I have addresses in mixed formats, I want to search and match them to get structured output (street, locality, state, postcode), so my database is consistent.

## Desired Outcomes

- Search results return both single-line and structured address formats
- Multi-line address format available for label printing
- Short-form addresses available (e.g., "1/25 SMITH ST" instead of "UNIT 1, 25 SMITH ST")

## Persona Constraints

- **Data Quality Analyst** (primary): batch ETL of address fields into a canonical shape.

## Current Solutions

- Regex/heuristic parsers that break on edge cases.
- Manual cleanup spreadsheets at scale.
