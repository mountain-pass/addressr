---
status: proposed
rfc-id: loader-covered-states-case-insensitive
reported: 2026-07-16
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P034]
adrs: []
jtbd: []
stories: []
---

# RFC-001: Make loader COVERED_STATES filter case-insensitive and fail loud on zero match

**Status**: proposed
**Reported**: 2026-07-16
**Problems**: P034
**ADRs**: (none)
**JTBD**: (none)

## Summary

Make the addressr-loader's `COVERED_STATES` env-var filter case-insensitive and make the loader fail loud instead of silently indexing zero documents when the filter matches no G-NAF address detail files.

## Driving problem trace

- P034 (addressr-loader's COVERED_STATES filter is case-sensitive) — a lowercase or mixed-case `COVERED_STATES` value (e.g. `ot`, `Nsw`) matches none of G-NAF's uppercase file prefixes, so the loader skips the address-indexing pass entirely and completes "successfully" with zero documents. Silent data loss surfaced by the ADR 029 Phase 1 v2 populate run (25033129925).

## Scope

Fix in `service/address-service.js` (published in the npm package via the Babel `lib/` build):

1. Normalise entries at parse time in `getCoveredStates()`: `covered.split(',').map((s) => s.trim().toUpperCase())`. Empty `COVERED_STATES` still returns `[]` (no filtering — behaviour preserved).
2. Uppercase the other side at the three comparison sites (file-prefix match ~line 1349; `COVERED_STATES.includes(state)` membership checks ~lines 1382 and 1445) so the filter is fully case-insensitive regardless of dataset filename casing.
3. Fail loud: when `COVERED_STATES` is non-empty and matches zero of the discovered `ADDRESS_DETAIL` files, throw (`COVERED_STATES matched zero G-NAF address detail files; check spelling/case`) instead of completing with zero docs. A noisy failure is strictly less damaging than silent success (P034 impact assessment).
4. Behavioural unit tests (node --test, `test/js/__tests__/`) per P033 — exercise the parser and state-prefix derivation by importing and calling them, not by inspecting source.

Single atomic commit (failing test first per TDD, then fix), plus a patch changeset. No story decomposition — the fix is one commit; `stories:` stays empty at capture and is ratified or back-filled at the `manage-rfc accepted` transition per ADR-089.

## Commits

(rendered from `git log --grep "Refs: RFC-001"` at manage-rfc time; none at capture.)

## Related

- docs/problems/open/034-loader-covered-states-case-sensitive.md (driver — transitions to Verification Pending with the fix commit)
- P033 (behavioural tests, not source-inspection)
