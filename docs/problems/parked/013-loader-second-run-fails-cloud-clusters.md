# Problem 013: Loader second run fails on cloud-managed clusters

**Status**: Parked
**Reported**: 2026-04-16
**Priority**: 12 (High) — Impact: Significant (4) x Likelihood: Possible (3)

## Description

When running the loader against a cloud-managed OpenSearch/Elasticsearch cluster (e.g., elastic.co), the first run succeeds but every subsequent run fails with:

```
ResponseError: parse_exception: [parse_exception] Reason: mix of settings map and top-level properties
```

The user must drop the index and re-sync from scratch to recover, which is disruptive and time-consuming.

Reported in GitHub issue [#388](https://github.com/mountain-pass/addressr/issues/388).

## Symptoms

- First-run loader succeeds and indexes addresses correctly.
- Second and all subsequent runs throw `parse_exception: mix of settings map and top-level properties` from OpenSearch/Elasticsearch.
- Affects only cloud-managed clusters (elastic.co confirmed); self-hosted clusters may behave differently due to version differences.
- Recovery requires dropping the index and re-running the full load.

## Workaround

Drop the index and re-run the full loader. This restores function but requires full re-indexing.

## Impact Assessment

- **Who is affected**: Self-hosted users deploying against elastic.co specifically. AWS OpenSearch (the supported managed config) is confirmed unaffected — CI pipelines run repeated loader invocations against AWS OpenSearch without error. RapidAPI consumers unaffected (server-side only).
- **Frequency**: Every loader re-run after the initial load. Affects anyone who updates G-NAF data or recovers from an incomplete load.
- **Severity**: Significant — loader is completely unusable for re-indexing without a full index drop.
- **Analytics**: N/A

## Root Cause Analysis

### Preliminary Hypothesis

`client/elasticsearch.js:117-120` calls `putSettings` passing the full `indexBody` object:

```js
const indexPutSettingsResult = await esClient.indices.putSettings({
  index: ES_INDEX_NAME,
  body: indexBody, // ← full body: { settings: {...}, mappings: {...} }
});
```

The OpenSearch `putSettings` API expects only the `settings` portion of the body. Passing a top-level object that also contains `mappings` causes the `mix of settings map and top-level properties` parse exception.

On first run the `else` branch executes (`indices.create` with the full body, which is correct). On subsequent runs the `if (exists.body)` branch executes and calls `putSettings(indexBody)` — this is the bug.

The fix is likely:

```js
const indexPutSettingsResult = await esClient.indices.putSettings({
  index: ES_INDEX_NAME,
  body: indexBody.settings, // ← only the settings portion
});
```

The same pattern likely exists for the locality index at `client/elasticsearch.js:235-240`.

### Investigation Tasks

- [ ] Confirm `body: indexBody` vs `body: indexBody.settings` is the root cause by reading the OpenSearch putSettings API spec
- [ ] Check whether the locality index (`initLocalityIndex`) has the same bug at lines 235-240
- [ ] Create a failing integration test that runs the loader twice against a test cluster and asserts no error on 2nd run
- [ ] Implement the fix
- [ ] Verify fix against elastic.co if possible (or document that it was validated locally)

## Parked

**Reason**: Cannot reproduce on our supported managed configuration. AWS OpenSearch is confirmed unaffected (CI runs the loader repeatedly against it without error). The issue is elastic.co-specific and we have no elastic.co account to reproduce, debug, or verify a fix against.

**Un-park trigger**: Reporter confirms the issue reproduces on AWS OpenSearch, OR provides the elastic.co Elasticsearch version and a way to reproduce in a CI-accessible environment, OR we obtain an elastic.co account.

**Date parked**: 2026-04-17

## Related

- GitHub issue [#388](https://github.com/mountain-pass/addressr/issues/388) — original report
- [`client/elasticsearch.js:111-143`](../../client/elasticsearch.js) — `initAddressIndex`, the update branch with the bug
- [`client/elasticsearch.js:230-260`](../../client/elasticsearch.js) — `initLocalityIndex`, likely same issue
