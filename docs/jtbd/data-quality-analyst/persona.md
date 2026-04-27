---
name: data-quality-analyst
description: Validates, normalizes, and enriches Australian address datasets against the authoritative G-NAF source.
---

# Data Quality Analyst

## Who

Works with datasets containing Australian addresses that need validation, normalization, or enrichment. May process batches of thousands of records.

## Context Constraints

- Cares about accuracy against the authoritative G-NAF source
- Needs structured output for downstream systems
- Operates in batch mode rather than per-keystroke
- Confidence scoring informs manual-review workflows

## Pain Points

- Inconsistent address formats across input sources
- Lack of confidence scoring (everything looks "valid" or "not")
- Geocoding services that disagree with the authoritative dataset
