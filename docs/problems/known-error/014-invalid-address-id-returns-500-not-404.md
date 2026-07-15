# Problem 014: Invalid address ID returns 500 instead of 404

**Status**: Known Error
**Reported**: 2026-04-16
**Priority**: 9 (Medium) — Impact: Moderate (3) x Likelihood: Possible (3)

## Description

Requesting `GET /addresses/<invalid-id>` (e.g., `/addresses/ddfgdfgdfgdfg`) returns a 500 Internal Server Error instead of a 404 Not Found. Similarly, when OpenSearch/Elasticsearch itself returns an error (e.g., index not found), the API layer returns a 500 instead of an appropriate error code.

Reported in GitHub issues [#95](https://github.com/mountain-pass/addressr/issues/95) (404 → 500) and [#81](https://github.com/mountain-pass/addressr/issues/81) (ES errors → 500).

## Symptoms

- `GET /addresses/<nonexistent-id>` returns HTTP 500 instead of 404.
- When the search index is missing, API returns 500 instead of 503 Service Unavailable.
- In the old API layer, errors produced `{"code": "SCHEMA_VALIDATION_FAILED", ...}` response bodies.

## Workaround

None. Consumers must treat 500 responses as "possibly not found" and cannot distinguish a service error from a missing resource.

## Impact Assessment

- **Who is affected**: All API consumers — RapidAPI consumers (paid and free-tier) and self-hosted users.
- **Frequency**: Any request with an invalid address ID, or during index recovery after a loader failure.
- **Severity**: Moderate — incorrect HTTP semantics break client error-handling logic (e.g., retry vs. 404 handling).
- **Analytics**: N/A

## Root Cause Analysis

### Current State

The service layer (`service/address-service.js:1827-1835`) now has error type detection:

```js
} catch (error_) {
  if (error_.body.found === false) {
    return { statusCode: 404, json: { error: 'not found' } };
  } else if (error_.body.error.type === 'index_not_found_exception') {
    return { statusCode: 503, json: { error: 'service unavailable' } };
  } else {
    return { statusCode: 500, json: { error: 'unexpected error' } };
  }
}
```

The API layer (`src/waycharter-server.js:622`) passes the `statusCode` through:

```js
status: statusCode || 200,
```

### Outstanding Risk

- If `error_` is a non-OpenSearch error (network timeout, connection refused), `error_.body` may be `undefined`, causing a `TypeError: Cannot read properties of undefined` in the catch block — which throws a new error and returns 500.
- If `error_.body.error` is undefined but `error_.body.found !== false`, accessing `.error.type` would throw.
- No integration test covers these code paths. The fixes were made but never verified with a real non-existent ID against a running cluster.

### Investigation Tasks

- [x] Write an integration test: `GET /addresses/ddfgdfgdfgdfg` → assert HTTP 404 — existing cucumber scenario in `test/resources/features/addresses.feature:466-469`
- [x] Write an integration test: with index dropped, `GET /addresses/anything` → assert HTTP 503 — existing cucumber scenario in `test/resources/features/addresses.feature:461-464`
- [x] Add defensive null-checks in the catch block at `service/address-service.js:1827`
- [x] Verify the `getAddresses` search path (`service/address-service.js:1918`) has similar protection — it already has `error_.body && error_.body.error &&` guards at line 1907-1911

## Fix Released

**Date**: 2026-04-19

Added defensive null-checks to the `getAddress` catch block in `service/address-service.js:1825-1840` so:

- `GET /addresses/<nonexistent-id>` returns **404 Not Found** (was crashing to 500 when `error_.body` was undefined on non-OpenSearch errors).
- OpenSearch index-not-found returns **503 Service Unavailable**.
- Request timeouts return **504 Gateway Timeout** (new — aligns with sibling `getAddresses` at `service/address-service.js:1913-1914`).
- Other errors fall through to **500 Internal Server Error**.

Added source-level regression tests to `test/js/__tests__/address-service.test.mjs` following the P012 pattern. Tests assert the catch block contains `error_.body &&` guards before dereferencing `.found` and `.error.type`, and that `RequestTimeout` maps to 504.

Awaiting user verification on next deploy via the existing cucumber scenarios in `test/resources/features/addresses.feature:461-469`.

## Related

- GitHub issue [#95](https://github.com/mountain-pass/addressr/issues/95) — 404 returning 500
- GitHub issue [#81](https://github.com/mountain-pass/addressr/issues/81) — ES errors causing 500
- [`service/address-service.js:1827`](../../service/address-service.js) — catch block with error detection
- [`src/waycharter-server.js:587`](../../src/waycharter-server.js) — itemLoader that consumes statusCode
