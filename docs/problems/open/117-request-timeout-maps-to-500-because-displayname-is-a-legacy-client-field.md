# Problem 117: A search timeout returns 500, not 504, because `displayName` is a legacy Elasticsearch field the OpenSearch client never sets

**Status**: Open
**Reported**: 2026-08-21
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3). Impact 2, not higher: the request already failed, so this changes the STATUS a failing request reports, not whether it succeeds. **Deliberate deviation from the RISK-POLICY table, recorded rather than glossed**: Impact 2 there reads "no end-user impact; only developer experience or build tooling affected", and that clause is false here — the consumer receives a different status code. The next rung up is written for incorrect RESULTS and elevated error rates, which overstates it: the end user's experience is identical, a failed request either way. What differs is machine-readable retry metadata consumed by a client library, a surface the table does not model. Neither the Cloudflare Worker nor RapidAPI retries 5xx by default, so no intermediary rescues or amplifies it. Rated 2 on that reasoning. It is not 1 because the status is the contract a client retries on — 504 is a documented retry-worthy upstream failure and 500 is not, so a consumer implementing correct backoff gets no signal to back off on. Likelihood 3: it fires on every search or lookup that times out, which is exactly what happens when the OpenSearch cluster is degraded — the case the mapping exists for.
**Origin**: internal
**Effort**: S — a one-line predicate change in two places, plus a test that uses a real client error shape.
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-003, JTBD-100
**Persona**: addressr-maintainer

## Description

`getAddress` and `getAddresses` both classify a timeout with:

```js
} else if (error_.displayName === 'RequestTimeout') {
  return { statusCode: 504, json: { error: 'gateway timeout' } };
```

**`displayName` is never set.** Measured 2026-08-21 by constructing the client's own error types:

```
TimeoutError             displayName= undefined | body= undefined | name= TimeoutError
ConnectionError          displayName= undefined | body= undefined | name= ConnectionError
ResponseError            displayName= undefined | body= undefined | name= ResponseError
RequestAbortedError      displayName= undefined | body= undefined | name= RequestAbortedError
NoLivingConnectionsError displayName= undefined | body= undefined | name= NoLivingConnectionsError
```

`grep -rl displayName node_modules/@opensearch-project/opensearch/` returns **nothing**. The whole string
appears in this repository's production code exactly twice — the two lines above.

`displayName` was the **legacy `elasticsearch-js` convention**. The client is
`@opensearch-project/opensearch` (`packages/addressr/client/elasticsearch.js:4`), which names its errors via
`name`. The predicate survived the client migration; the behaviour it selects did not.

So both 504 branches are unreachable, and a timeout falls through to the `else` and returns **500**.

## How it was found, because that is the point

Converting RFC-009 rows 6/7 — replacing two source-inspection pins over this catch block with behavioural
tests. The pins asserted that the source **contains**
`/error_\.displayName\s*===\s*['"]RequestTimeout['"]/`. It does. They passed for four months.

**The first behavioural replacement passed too, and that is the sharper half.** It drove the branch with a
hand-made error carrying `displayName: 'RequestTimeout'` — a shape the client never produces. A behavioural
test can reproduce a source pin's blindness exactly, by fabricating the input the source implies rather than
the input the caller receives. The defect surfaced only when the premise "an OpenSearch `RequestTimeout`
carries no body" was **measured against the client** instead of asserted in a comment.

This is P033's thesis on a live defect: the source is present, correct-looking, and never reached.

## Symptoms

1. A search or address lookup that times out returns `500 {"error":"unexpected error"}` where the code says
   it returns `504 {"error":"gateway timeout"}`.
2. A consumer implementing retry-on-504 does not retry, and one treating 500 as a bug reports a bug.
3. The two branches read as covered: they are named in the code, and until 2026-08-21 they were pinned by a
   test asserting exactly that text.

## Workaround

None available to a consumer. Operator-side, a timeout is still visible in the logs — `error('error getting
record from elastic search', error_)` runs before the classification — so the diagnosis is not lost, only the
status code is wrong.

## Impact Assessment

- **Who is affected**: API consumers implementing status-based retry, and anyone reading the two `else if`
  branches as live behaviour.
- **Frequency**: every timed-out request. Zero when the cluster is healthy, which is why it has gone
  unnoticed.
- **Severity**: Minor. It misreports a failure that has already happened.
- **Analytics**: N/A — no per-status telemetry in this repo.

## Root Cause Analysis

**Root cause: a predicate written against `elasticsearch-js` survived the migration to
`@opensearch-project/opensearch`, which uses a different error-naming convention.** The two clients agree on
almost everything the calling code touches, so nothing else broke and nothing flagged it.

**Why no test caught it**: the only assertions over that branch were source-inspection pins, which assert the
predicate is _written_, not that it _matches_. A pin cannot distinguish a predicate from a predicate that is
never true — the defect class P033 exists for, and P091's shape exactly.

### Investigation Tasks

- [ ] Decide the replacement predicate. `error_.name === 'TimeoutError'` is the direct translation, but
      confirm against the client whether an aborted request (`RequestAbortedError`, which the read-shadow
      path already classifies separately) should also map to 504.
- [ ] Apply it at **both** sites — `getAddress` and `getAddresses`. They are separate lines and the sibling
      is the one a correction pass forgets.
- [ ] Test with a **real client error instance**, not a hand-made object with the field the production code
      happens to read. A fabricated shape reproduces the source pin's blindness in behavioural clothing.
- [ ] Check whether any other predicate reads a legacy `elasticsearch-js` field. `displayName` was found by
      measuring one; the migration may have left siblings.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P033

## Related

- **[P033](../known-error/033-source-inspection-tests-anti-pattern.md)** — the conversion that surfaced this.
  Its remaining-population row for `address-service.test.mjs` records rows 6/7 as converted; this ticket is
  what the conversion found underneath.
- **RFC-009** — the conversion plan. Its "what rows do NOT establish" list records that the 504 case
  characterises a branch that cannot currently fire.
- **P091** — the four-month-undetected defect that made P033 a Known Error. Same shape: source present,
  behaviour absent, a source pin green throughout.
