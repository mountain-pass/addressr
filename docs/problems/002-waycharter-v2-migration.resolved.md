# Problem 002: Waycharter v2 Migration Pending

**Status**: Resolved
**Reported**: 2026-04-04
**Resolved**: 2026-04-05
**Priority**: 6 (Medium) — Impact: Minor (2) x Likelihood: Possible (3)

## Description

addressr still uses waycharter v1 API in `src/waycharterServer.js`. The waycharter library has been updated to v2 with a new `EndPoint.create()` / `EndPoint.createCollection()` API. The current code works but is pinned to a legacy API that may not receive fixes.

## Resolution

Instead of rewriting `waycharterServer.js` to use v2's verbose static factory API, a `WayCharter` convenience class was added to waycharter v2 (v2.0.25–v2.0.30) that matches the v1 API signatures exactly:

- `registerResourceType({ path, loader })`
- `registerCollection({ itemPath, itemLoader, collectionPath, collectionLoader, filters })`
- `registerStaticResource({ path, body, links, headers })`

addressr upgraded from `@mountainpass/waycharter ^1.0.76` to `^2.0.30` with **zero source code changes** to `waycharterServer.js`. All 6 rest2 and 6 cli2 scenarios pass in CI. This eliminates the 43 stale dependencies from the waycharter v1 branch.

## Related

- waychaser v5 migration completed in v2.0.0
- waycharter source at `../waycharter/`
- waycharter convenience class: `src/waycharter-convenience.ts`
