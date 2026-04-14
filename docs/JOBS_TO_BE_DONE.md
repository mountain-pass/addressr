# Jobs To Be Done

> This document is read by the wr-jtbd:agent to review UI changes against user jobs.

**Last reviewed:** 2026-04-14

---

## Personas

### 1. Web/App Developer

Builds customer-facing web or mobile applications that need Australian address input. Wants a fast, accurate autocomplete that drops into existing forms with minimal integration effort. Cares about latency, result quality, and simple API contracts. Frustrated by inaccurate results, complex SDKs, and expensive pricing tiers.

### 2. Data Quality Analyst

Works with datasets containing Australian addresses that need validation, normalization, or enrichment. May process batches of thousands of records. Cares about accuracy against the authoritative G-NAF source and structured output for downstream systems. Frustrated by inconsistent address formats and lack of confidence scoring.

### 3. Self-Hosted Operator

Runs addressr on their own infrastructure for data sovereignty, privacy, or cost reasons. Manages OpenSearch and the G-NAF loading pipeline. Cares about operational simplicity, clear documentation, and predictable resource requirements. Frustrated by heavy infrastructure dependencies (OpenSearch RAM) and complex setup.

### 4. AI Assistant User

Uses addressr through MCP integration in Claude, Cursor, VS Code Copilot, or similar AI tools. Needs address lookup grounded in authoritative data during AI-assisted workflows. Cares about natural language queries working and getting structured, reliable results. Frustrated by AI hallucinating addresses that don't exist.

---

## Jobs

### J1: Search and autocomplete addresses from partial input

- **Type:** Functional
- **Priority:** Must-have
- **Persona:** Web/App Developer, AI Assistant User
- **Job statement:** Help developers provide real-time address autocomplete so their users can find and select valid Australian addresses quickly.

**Job stories:**

- When a user starts typing an address into a form, I want instant suggestions from authoritative data, so I can reduce errors and speed up data entry.
- When a user types a partial street name, I want fuzzy matching to handle typos and abbreviations, so they still find the right address.

**Desired outcomes:**

- Results appear within 200ms of input
- Correct address appears in the first page of results for reasonable queries
- Typos and abbreviations (e.g., "ST" vs "STREET") still match

### J2: Look up localities, postcodes, and states

- **Type:** Functional
- **Priority:** Important
- **Persona:** Web/App Developer, AI Assistant User
- **Job statement:** Help developers offer suburb/postcode/state pickers and area-level search, not just full address autocomplete.

**Job stories:**

- When building a suburb picker for a delivery form, I want to search localities by name, so users can select their suburb without entering a full address.
- When a user enters a postcode, I want to see which suburbs it covers, so I can validate or auto-fill the locality field.

**Desired outcomes:**

- Searching "lilydale" returns LILYDALE, VIC 3140 as a locality result
- Searching postcode "3140" returns associated localities
- State search supports both abbreviation ("NSW") and name ("New South Wales")

### J3: Validate addresses against G-NAF

- **Type:** Functional
- **Priority:** Must-have
- **Persona:** Data Quality Analyst, Web/App Developer
- **Job statement:** Help teams confirm that an address exists in the authoritative Australian address database so they can trust their data.

**Job stories:**

- When I receive a customer address, I want to validate it against G-NAF, so I know it's a real, deliverable location.
- When cleaning a dataset of addresses, I want confidence scores, so I can prioritize which records need manual review.

**Desired outcomes:**

- Every result includes a confidence score
- Structured address output matches G-NAF format
- Invalid addresses return empty results (not false positives)

### J4: Geocode addresses to coordinates

- **Type:** Functional
- **Priority:** Important
- **Persona:** Web/App Developer, Data Quality Analyst
- **Job statement:** Help developers get latitude/longitude for addresses so they can plot locations on maps or calculate distances.

**Job stories:**

- When I have a validated address, I want its coordinates, so I can display it on a map in my application.

**Desired outcomes:**

- Geocoding data includes reliability indicator
- Coordinates are accurate to property level where available

### J5: Normalize messy address data

- **Type:** Functional
- **Priority:** Important
- **Persona:** Data Quality Analyst
- **Job statement:** Help data teams convert free-text or inconsistent address strings into structured, standardized format aligned with G-NAF.

**Job stories:**

- When I have addresses in mixed formats, I want to search and match them to get structured output (street, locality, state, postcode), so my database is consistent.

**Desired outcomes:**

- Search results return both single-line and structured address formats
- Multi-line address format available for label printing
- Short-form addresses available (e.g., "1/25 SMITH ST" instead of "UNIT 1, 25 SMITH ST")

---

## Current Solutions / Alternatives

| Alternative              | Strengths                   | Weaknesses vs Addressr                                        |
| ------------------------ | --------------------------- | ------------------------------------------------------------- |
| Google Maps Autocomplete | Global coverage, well-known | Expensive at scale, not AU-authoritative, no G-NAF PIDs       |
| Australia Post PAF       | Official postal data        | Expensive licensing, no free tier, limited API                |
| Manual data entry        | No integration needed       | Error-prone, slow, no validation                              |
| Self-maintained G-NAF    | Full control                | Complex setup, quarterly update burden, search quality varies |
