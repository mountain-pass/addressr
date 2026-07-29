# Problem 070: utils/stream-down.js promotes failed and partial downloads into the persistent G-NAF cache

**Status**: Open
**Reported**: 2026-07-29
**Priority**: 8 (Medium) — Impact: Significant (4) × Likelihood: Unlikely (2) — derived at capture per Step 4a. Impact 4 per RISK-POLICY § Impact: blocks fresh install and quarterly refresh for self-hosted operators, and the poisoned state is not self-recoverable by re-running. Likelihood 2 (honest field risk per ADR-076, not a rank lever): nothing is provoking it today — the ZIP hop returns 200 to a bare `https.get` as verified 2026-07-29 — but the CKAN hop on the same host acquired a WAF rule unannounced in April, which is exactly the trigger, so this is a latent defect with a demonstrated precedent rather than a theoretical one.
**Origin**: internal — carried out of P068 as a residual at close.
**Effort**: S — one file, four small changes plus a clean-ESM conversion for testability — cf. P068's own fix (741fd21), which was the same shape one hop over.
**WSJF**: 8.0 — (8 × 1.0) / 1
**JTBD**: JTBD-203
**Persona**: self-hosted-operator

## Description

`utils/stream-down.js` does no HTTP status-code check (grep for `statusCode` in the file returns zero hits) and no redirect handling. `utils/stream-down.js:14` goes straight from `http.get` to piping the response body to a file. A non-200 response therefore streams the error body to disk, fires `end`, and **resolves as success**; `service/address-service.js:146` then renames that garbage to the real destination.

Because `service/address-service.js:128-136` short-circuits on _"it does exist, so don't bother trying to download it again"_, a self-hosted operator with a persistent `target/gnaf/` volume gets a permanently poisoned cache that re-running never clears, and the surfaced error points at unzip rather than the download. On ephemeral CI runners it merely fails confusingly once per run.

Architecture review found three further routes into the same poisoned-cache state, all in the same function:

1. `resolve(response)` fires from the response `end` handler immediately after `file.end()`, **not** from the write stream's `finish`/`close`. A process death during the flush window makes a truncated ZIP permanent via the same `fs.access` short-circuit.
2. No `error` handler on the write stream. `.on('error', reject)` is attached to the response only, so an `ENOSPC` or `EACCES` on the file emits an unhandled `error` and takes the process down instead of rejecting.
3. No byte-count verification, though `dataResource.size` is already threaded in as the `size` parameter and `content-length` is already read at line 15. A truncated-but-200 download is promoted silently.
4. Redirects are neither followed nor rejected, so a future 3xx from data.gov.au writes the redirect body and succeeds.

## Symptoms

Loader run appears to succeed at the download step, then fails at unzip with a message naming the archive rather than the HTTP fault. On a persistent volume, every subsequent run fails identically without re-attempting the download.

## Workaround

Manually delete `target/gnaf/` to clear the poisoned artefact and force a re-download. This is presently undocumented and discoverable only by reading `fetchGnafFile`.

## Impact Assessment

- **Who is affected**: self-hosted operators running the loader against a persistent `target/` volume — per the `self-hosted-operator` persona, quarterly G-NAF refreshes are routine, so this is the normal mode rather than an edge case. Ephemeral CI runners see only a confusing one-off failure.
- **Frequency**: zero occurrences observed to date; gated entirely on upstream returning a non-200 or a 3xx on the ZIP hop.
- **Severity**: Significant — unrecoverable-by-retry, and misattributed to the wrong subsystem.

## Root Cause Analysis

### Confirmed Root Cause

`streamDown` treats "bytes arrived" as "download succeeded". It never inspects `response.statusCode`, so every HTTP outcome that carries a body is indistinguishable from success. The promotion step in `fetchGnafFile` then trusts that resolution, and the existence short-circuit makes the resulting bad artefact sticky.

### Investigation Tasks

- [x] Confirm no status-code check exists — grep for `statusCode` in `utils/stream-down.js` returns zero hits.
- [x] Confirm the ZIP hop's current behaviour — bare `https.get` with no headers returns `200 application/zip`, no redirect (verified 2026-07-29).
- [x] Verify the truncation check's trusted input against the live hop, so the new reject paths are not resting entirely on mocks. A plain GET (no `Range`, exactly as `streamDown` issues it) against the selected GDA94 resource on 2026-07-29 returned `200` with `content-length: 1703076498`, matching the CKAN-declared `size` of `1703076498` exactly. So `content-length` is present on the real response, the primary branch of the check is the one that runs, the CKAN-`size` fallback is not load-bearing today, and the two sources agree — a healthy download cannot false-reject on a byte-count mismatch.
- [ ] Write a failing behavioural test asserting a non-200 response rejects rather than resolving.
- [ ] Reject on non-success status, naming status code and URL.
- [ ] Resolve on the write stream's `finish`, not the response's `end`.
- [ ] Attach an `error` handler to the write stream.
- [ ] Verify received bytes against `content-length` / `size`.
- [ ] Decide redirects explicitly — reject on 3xx with the `location` value in the error message.
- [ ] Send a User-Agent consistent with `LOADER_USER_AGENT`.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

- **P068** (closed) — the inbound CloudFront 403 report this was carried out of. Subsumes P068 residual gap 1 (no User-Agent on the ZIP hop) and largely discharges residual gap 2 (the never-implemented download-URL smoke check) if byte verification lands.
- **P033** (open) — source-inspection tests anti-pattern. Its "replace opportunistically when touching the relevant implementation" cadence is the trigger for the clean-ESM conversion this fix requires; `service/gnaf-package-fetch.js` and `src/read-shadow.js` are the two existing instances of the target shape.
- **ADR-005** — Babel transpilation. Converting the module's `require`/`import`/`module.exports` hybrid to clean ESM increases conformance; do not add `"type": "module"`, which is the one move ADR-005 forecloses.
- **ADR-006** — G-NAF as the authoritative data source; governs this download path, and its reassessment criteria already anticipate data.gov.au API changes.
- **ADR-034** — quarterly refresh on GHA; puts this hop on an unattended run, where silent corruption is strictly worse than in the interactive case the current code was written for.
- **JTBD-203** — authored alongside this ticket because the JTBD review found the loader's entire G-NAF acquisition path mapped to no job.

Captured via `/wr-itil:capture-problem`. Duplicate grep on `stream-down` / `download` / `gnaf-cache` returned no title matches.
