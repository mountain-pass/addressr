# Problem 037: Loader unnecessarily closes the addressr index every state load AND has no retry on snapshot_in_progress_exception

**Status**: Open
**Reported**: 2026-05-12
**Priority**: 8 (Medium) — Impact: Moderate (4) x Likelihood: Likely (2) (deferred — re-rate at next /wr-itil:review-problems)
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)

## Description

`client/elasticsearch.js:initIndex` at line 120-152 runs at the start of every state's ingest. When the addressr index already exists (i.e. for every state after ACT), the branch is:

```js
if (exists.body) {
  await esClient.indices.close({...});           // (1) ALWAYS closes
  await esClient.indices.putSettings({...});     // (2) updates analyzers/filters
  await esClient.indices.putMapping({...});      // (3) updates mappings
  await esClient.indices.open({...});            // (4) reopens
  await esClient.indices.refresh({...});         // (5) refresh
}
```

Two distinct concerns that share the same code site:

1. **Unnecessary close on every state load.** The index settings and mappings don't change between states — only docs are added. So step (1)-(4) are doing redundant work on every state-load after ACT. A `_settings` diff check at the top of `initIndex` would let the loader fast-path past the close-update-open dance when the desired config already matches what's deployed.

2. **No retry on `snapshot_in_progress_exception`.** Even when the close IS necessary, AWS-managed OpenSearch domains run automated snapshots hourly; closing an index that's mid-snapshot returns HTTP 400 with `snapshot_in_progress_exception`. The loader propagates the exception → the GHA job fails → operator has to re-trigger. Discovered when populate-search-domain run 25731879773 had QLD and WA fail with this exact error (see I001 — QLD log `Transport.js:426:23`).

Either fix solves the I001 class of failure. Concern (1) is the better forward fix — eliminates the race entirely by not doing the close in the first place. Concern (2) is a cheaper patch that still works around the inefficiency; pair both for belt-and-braces.

## Symptoms

(deferred to investigation)

## Workaround

Re-trigger the failed populate state via `gh workflow run "Populate Search Domain" -f target=v2 -f states=<STATE>` and hope it lands in a snapshot-quiet window. Snapshots last ~30-60s and run hourly, so a single retry typically succeeds. Tracked in I001 mitigation attempt 1.

## Impact Assessment

- **Who is affected**: (deferred to investigation)
- **Frequency**: (deferred to investigation)
- **Severity**: (deferred to investigation)
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

The loader's `initIndex` was written assuming a fresh-domain bootstrap path where the close-update-open dance protects mapping/settings changes across versions. Pattern is correct for the first-ever load against a new domain. Wrong for subsequent state loads where nothing about the index config actually changed — the close becomes pure overhead and pure failure surface (AWS automated snapshots).

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [ ] Fix (1): add a `_settings` + mapping diff at the top of `initIndex` — only run close/putSettings/open if the deployed config differs from the desired one
- [ ] Fix (2): wrap `indices.close` in a retry-on-`snapshot_in_progress_exception` loop with backoff (e.g. 3 attempts at 30s intervals)
- [ ] Regression test: simulate a `snapshot_in_progress_exception` response in the OpenSearch test fixture; assert loader retries (for fix 2) and assert loader skips close on no-diff (for fix 1)
- [ ] Verify the fix against `populate (QLD) / update` and `populate (WA) / update` cleanly even when snapshots overlap

## Dependencies

- **Blocks**: ADR 029 step 7 cutover until I001 is restored and a clean 9-of-9 populate has run
- **Blocked by**: (none)
- **Composes with**: P028 (drives ADR 029); P036 (rotation event that necessitated the rebuilt v2 populate which surfaced this); I001 (the active incident this problem will close)

## Related

- **I001** — v2 OpenSearch populate QLD and WA job failures; this problem is the root cause I001 captured
- **ADR 029** — two-phase blue/green; populate-search-domain is Phase 1 step 5
- **client/elasticsearch.js:120-152** — the change site
- Discovered via populate run 25731879773 (failed) → log inspected via I001 mitigation
