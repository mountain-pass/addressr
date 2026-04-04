# Problem 002: Waycharter v2 Migration Pending

**Status**: Open
**Reported**: 2026-04-04
**Priority**: 6 (Medium) — Impact: Minor (2) x Likelihood: Possible (3)

## Description

addressr still uses waycharter v1 API in `src/waycharterServer.js`. The waycharter library has been updated to v2 with a new `EndPoint.create()` / `EndPoint.createCollection()` API. The current code works but is pinned to a legacy API that may not receive fixes.

## Symptoms

- `waycharterServer.js` uses the old waycharter v1 API patterns
- Cannot take advantage of waycharter v2 improvements
- Dependency on deprecated API surface

## Workaround

Current waycharter v1 API still works. No immediate breakage.

## Impact Assessment

- **Who is affected**: Developers maintaining the v2 API server
- **Frequency**: Whenever waycharter needs updating
- **Severity**: Low — functional but on deprecated API
- **Analytics**: N/A

## Root Cause Analysis

### Investigation Tasks

- [ ] Map current v1 API calls in waycharterServer.js to v2 equivalents
- [ ] Identify all endpoints that need migration (resource links, collections, health)
- [ ] Create reproduction test
- [ ] Create INVEST story for permanent fix

## Related

- waychaser v5 migration completed in v2.0.0
- waycharter source at `../waycharter/`
