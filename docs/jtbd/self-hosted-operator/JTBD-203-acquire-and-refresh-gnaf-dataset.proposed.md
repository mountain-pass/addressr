---
human-oversight: confirmed
oversight-date: 2026-07-29
status: proposed
job-id: acquire-and-refresh-gnaf-dataset
persona: self-hosted-operator
date-created: 2026-07-29
screens:
  - utils/stream-down.js
  - service/gnaf-package-fetch.js
  - service/address-service.js (fetchGnafFile / unzipFile / loadGnafData)
  - README.md (loader section)
  - scripts/check-gnaf-source.mjs
  - .github/workflows/gnaf-source-smoke.yml
---

# JTBD-203: Acquire and refresh the G-NAF dataset on a self-hosted install

## Job Statement

When I stand up a fresh self-hosted install, I want the loader to obtain the current G-NAF archive from data.gov.au unattended, so I can index without hand-sourcing a multi-gigabyte dataset.

When the quarterly G-NAF release lands, I want to re-run the loader against my persistent `target/` volume and actually receive the new dataset, so refreshes stay routine.

When the upstream fetch fails, I want the loader to abort loudly naming the failing hop, URL, and status code, so I fix the real problem instead of chasing a bogus unzip error.

When a fetch fails, I want nothing partial promoted into my persistent cache, so re-running retries cleanly rather than repeating a poisoned state.

## Desired Outcomes

- Both outbound hops (CKAN `package_show`, ZIP download) identify themselves with a stable, documented User-Agent.
- A non-success status on either hop aborts the run naming the status code, URL, and hop; no response body is ever promoted to the cache.
- Only a fully-verified download is promoted from the `incomplete/` staging directory to `target/gnaf/`.
- The cache-reuse contract is stated, including the operator-facing procedure for forcing a re-download at quarterly refresh.
- A smoke check confirms the download URL responds 200, guarding against silent upstream re-breakage.

## Persona Constraints

- **Self-Hosted Operator** (primary): owns the loader cadence, and quarterly G-NAF refreshes are routine rather than exceptional. Runs against a persistent `target/` volume, so any corrupt artefact promoted into the cache survives across runs and re-running never clears it.
- Values operational simplicity and clear documentation: an error attributed to the wrong subsystem costs this persona more than the failure itself.
- Already named pain point: silent misconfiguration that surfaces later, wrongly attributed. Fail-loud is the documented preference.

## Current Solutions

- Point the loader at a previously-downloaded copy of the G-NAF archive — the workaround communicated on issue #458 when the CKAN hop was returning 403.
- Manually delete `target/gnaf/` to force a re-download, which is presently undocumented and discoverable only by reading `fetchGnafFile`.

## Related

- ADR 006 (G-NAF as the authoritative address data source) — defines the download-and-cache path this job covers; its reassessment criteria already anticipate data.gov.au API changes.
- ADR 034 (Re-automate the quarterly G-NAF refresh on GHA via an OIDC-scoped IAM role) — puts this same download hop on an unattended quarterly CI run.
- ADR 044 (Native ESM without a build step) — retired the build step, so the files this job screens ARE the artifacts the operator runs, shipped at their source paths rather than transpiled into `lib/`. Two operator-visible consequences follow: the tarball layout moved, and a consumer on a Node older than `engines` declares now fails at import rather than running transpiled output — which matches this persona's fail-loud preference but was previously recorded in no job. Re-pointed and reframed 2026-08-09 from ADR 005 (Babel transpilation for ES module support), which ADR 044 superseded on 2026-08-08. The old line said ADR 005 "governs the module format of the files this job screens" — that framing described an internal build concern under a regime where the screened paths were build inputs the operator never executed. The relationship did not just change ADR number; it got stronger and more operator-facing, and module format is now the smallest part of it.
- P068 (G-NAF loader fails with CloudFront 403 from data.gov.au) — closed; the inbound report that surfaced this job's absence. Its two residual gaps map onto the first and fifth desired outcomes.
- P070 (stream-down promotes failed and partial downloads into the persistent G-NAF cache) — the ticket this job's first delivery discharges, covering both hops.
- P071 (loader is pinned to the legacy GDA94 datum) — the deliberate datum switch. The selection is now explicit and order-independent; changing it is consumer-visible and tracked separately.
- P033 (Source-inspection tests are an anti-pattern) — governs how this job's screens are tested.

## Notes

This job was authored because a JTBD review of the `utils/stream-down.js` status-code fix found the loader's entire G-NAF acquisition path mapped to no job. P068 had been anchored to JTBD-202, which is scoped to registry and image identity and does not reach the loader.

Two corpus corrections identified during the same review are deliberately left for a separate pass rather than folded in here: `service/gnaf-package-fetch.js:1` is annotated `@jtbd JTBD-400` (release determinism) when its subject is loader runtime, and P069's JTBD-202 anchor is likewise questionable for a query-side concern.

The smoke check behind desired outcome 5 is maintainer-side CI: `scripts/check-gnaf-source.mjs` is not in the package `files:` array, so a self-hosted operator cannot run it as a pre-flight diagnostic. That is a deliberate call, not an omission — upstream breakage is global, so detecting it once for everyone and shipping a fix serves this persona better than shipping them a probe. Revisit if operators ask for a local diagnostic.
