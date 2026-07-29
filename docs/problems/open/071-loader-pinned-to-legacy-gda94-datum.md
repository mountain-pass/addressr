# Problem 071: Loader is pinned to the legacy GDA94 datum, so served coordinates are ~1.8m out

**Status**: Open
**Reported**: 2026-07-29
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Likely (4) — derived at capture. Impact 3: every geocoded coordinate addressr serves is expressed in a superseded datum, roughly 1.8m from where consumers working in WGS84 expect it. Wrong-but-plausible output rather than an outage, and 1.8m is below the tolerance of many address-autocomplete uses while being well above it for mapping, dispatch, and asset work. Likelihood 4: this is not a risk, it is the current shipped behaviour on every request that returns coordinates.
**Origin**: internal — surfaced 2026-07-29 while fixing P070, when the resource selector was made explicit and the selected resource turned out to be GDA94.
**Effort**: M — the code change is one env var default, but it requires a full re-index of every state and a consumer-facing notice, and the coordinates in every downstream cache shift.
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-203, JTBD-003
**Persona**: self-hosted-operator

## Description

data.gov.au publishes two active `application/zip` G-NAF distributions per release, GDA94 and GDA2020. Until P070 the loader selected one with `.find()` over active zips, taking whichever CKAN listed first — index 0, GDA94. No code, config, or decision record named a datum; the choice was incidental.

GDA94 is frozen to Australia's position in 1994. The continent moves roughly 7cm/year northeast, so GDA94 and GDA2020 now differ by about 1.8m. Consumers overwhelmingly work in WGS84, which GDA2020 aligns to and GDA94 no longer does, so coordinates addressr returns today are systematically offset against the frame callers assume.

`TODO.md:8` already carries an unticked `Switch to GDA2020` with the ICSM link, so the intent predates this ticket; nothing tracked it beyond that line.

P070 pinned the selection rather than changing it: `selectGnafResource` in `service/gnaf-package-fetch.js` now selects by datum, defaulting to `gda94` via `GNAF_DATUM`, so behaviour is unchanged but no longer order-dependent. This ticket is the deliberate switch.

## Symptoms

No error. Every coordinate returned by the geocoding path is offset by approximately 1.8m from its GDA2020 / WGS84 position. Silent and systematic.

## Workaround

Set `GNAF_DATUM=gda2020` and re-index. Untested end to end, and it changes served coordinates, so it is a deliberate migration rather than a workaround.

## Impact Assessment

- **Who is affected**: every consumer of the geocoding path — the `self-hosted-operator` who indexes the data and the `web-app-developer` who consumes the coordinates. Address-autocomplete uses are largely tolerant of 1.8m; mapping, dispatch, and asset-location uses are not.
- **Frequency**: every request returning coordinates.
- **Severity**: Moderate — plausible-looking wrong output, which is harder to notice than an error.

## Root Cause Analysis

### Confirmed Root Cause

The datum was never chosen. Both distributions satisfy the `state === 'active' && mimetype === 'application/zip'` predicate, so the datum followed upstream array ordering. Confirmed 2026-07-29 against the live CKAN response: index 0 is `MAY 2026 - Geoscape G-NAF - GDA94`, index 1 is the GDA2020 distribution, and the previously loaded archive recorded on P015 was `g-naf_feb26_allstates_gda94_psv_1022`.

### Investigation Tasks

- [x] Establish which datum is in use — GDA94, by array position.
- [x] Remove the order-dependence so the datum cannot flip silently (shipped with P070).
- [ ] Confirm the GDA2020 distribution has the same PSV schema and file layout as GDA94, so the loader needs no parsing change.
- [ ] Decide and document whether the switch is a major version bump for API consumers.
- [ ] Re-index every state from the GDA2020 distribution in a non-production domain and diff a sample of coordinates against current production to confirm the shift is the expected magnitude.
- [ ] Decide the rollout: blue/green per ADR-029 zero-outage expectations, given a full reindex is involved.
- [ ] Notify API consumers before coordinates move.
- [ ] Flip the `GNAF_DATUM` default and tick `TODO.md:8`.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P070 — the datum pinning shipped there is the prerequisite that makes this a one-line default change.

## Related

- **P070** — made the selection explicit and order-independent; this ticket is the deliberate switch it deferred.
- **JTBD-003** (Geocode addresses to coordinates) — the job whose output accuracy this concerns.
- **ADR-006** — G-NAF as the authoritative data source; does not name a datum.
- **ADR-029** — zero-outage search upgrades; a full reindex should follow the blue/green path.
- `TODO.md:8` — the pre-existing unticked intent, with the ICSM transition reference.
