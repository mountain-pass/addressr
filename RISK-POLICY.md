# Risk Policy

*Per ISO 31000 — Risk Management*

**Last reviewed:** 2026-03-30

## Business Context

Addressr is an Australian Address Validation, Search and Autocomplete service published by Mountain Pass as the npm package `@mountainpass/addressr` and Docker image `mountainpass/addressr`. It validates addresses against the Geocoded National Address File (G-NAF), Australia's authoritative address file.

**Distribution channels:**
- **RapidAPI** (primary) — hosted API service accessed by consumers via RapidAPI gateway
- **npm package** — self-hosted installations via `npm install -g @mountainpass/addressr`
- **Docker image** — self-hosted container deployments

**Live service (AWS):**
- Deployed to AWS via Terraform with OpenSearch backend
- Serves the RapidAPI-listed API (v1, current)

This is a revenue-generating production service with paid and free-tier consumers relying on address validation for their own applications.

## Confidential Information

Business metrics — including but not limited to user counts, subscriber numbers, revenue figures, pricing tier details, and traffic volumes — are confidential and **must not** appear in any file committed to this repository. This repository is public; committing such data constitutes an information disclosure incident.

When writing governance documents, risk reports, or any committed file, use generic descriptions (e.g., "paid and free-tier consumers", "revenue-generating service") rather than specific numbers. Confidential metrics may be discussed in conversation but must never be persisted in the repository.

## Risk Appetite

**Threshold: 5 (Medium)**

Pipeline actions (commit, push, release) with a residual risk score of 5 or above require remediation or explicit acceptance before proceeding. This threshold reflects the product's status as a revenue-generating service with paying customers and active API consumers.

## Impact Levels

| Level | Label | Description |
|-------|-------|-------------|
| 1 | Negligible | No user impact whatsoever. Changes to comments, documentation, formatting, or developer tooling configuration that do not affect the build, publish, or runtime paths. |
| 2 | Minor | No end-user impact; only developer experience or build tooling affected. Examples: ESLint or prettier config changes, CI workflow adjustments, dev dependency updates. The npm package, Docker image, and live AWS service continue functioning normally. |
| 3 | Moderate | npm publish pipeline, Docker image build, or AWS deployment pipeline disrupted — new versions cannot be released or deployed, but existing npm installations, running Docker containers, and the live RapidAPI service continue operating on their current version. Alternatively, confidential business metrics (revenue, user counts, pricing, traffic volumes) committed to the public repository — an information disclosure that requires immediate remediation (force-push or history rewrite) but does not affect service availability. |
| 4 | Significant | Address search, autocomplete, or API responses degraded for end users — RapidAPI consumers receive incorrect results, missing addresses, elevated error rates, or timeouts. Alternatively, the npm package or Docker image installs or starts but produces incorrect address data or fails for a subset of operations. Paid and free-tier consumers are affected. |
| 5 | Severe | Complete service outage of the live RapidAPI API, G-NAF index corruption or OpenSearch data loss requiring re-indexing, security vulnerability exposed in the public npm package or Docker image, or loss of revenue-generating capability affecting paid subscribers. |

## Likelihood Levels

| Level | Label | Description |
|-------|-------|-------------|
| 1 | Rare | Change is trivial, isolated, and well-understood. Very low chance of introducing a defect. |
| 2 | Unlikely | Change is straightforward with a clear scope. Low chance of unintended side effects. |
| 3 | Possible | Change has moderate complexity or touches multiple concerns. Reasonable chance of introducing an issue. |
| 4 | Likely | Change is complex, spans multiple modules, or alters behaviour in ways that are hard to predict. |
| 5 | Almost certain | Change is high-complexity, touches critical paths, or modifies behaviour with wide-reaching dependencies. |

## Risk Matrix

Residual risk = Impact x Likelihood (after controls are applied).

| Impact \ Likelihood | 1 Rare | 2 Unlikely | 3 Possible | 4 Likely | 5 Almost certain |
|---|---|---|---|---|---|
| 1 Negligible | 1 | 2 | 3 | 4 | 5 |
| 2 Minor | 2 | 4 | 6 | 8 | 10 |
| 3 Moderate | 3 | 6 | 9 | 12 | 15 |
| 4 Significant | 4 | 8 | 12 | 16 | 20 |
| 5 Severe | 5 | 10 | 15 | 20 | 25 |

### Label Bands

| Score Range | Label |
|-------------|-------|
| 1-2 | Very Low |
| 3-4 | Low |
| 5-9 | Medium |
| 10-16 | High |
| 17-25 | Very High |

This risk matrix is referenced by both the **risk-scorer agent** (pipeline risk assessment) and the **problem management process** (problem severity classification via the `/problem` skill).
