// @jtbd JTBD-400 (Ship releases reliably from trunk)
//
// P097: the cucumber tiers wait on a TCP port and then start querying. The port
// accepts connections before the index is queryable, so a leg can run its first
// scenario against an index that is present but not yet searchable — three
// observed instances on 2026-08-08/09, across both engine versions and both
// tiers, each one an `expected [] not to be empty` at 0.1 s.
//
// This covers the readiness gate that closes that window. What it pins is not
// "it waits" — a sleep would satisfy that — but that it DISCRIMINATES, because
// the three failure modes want three different responses from whoever reads the
// log:
//
//   index absent      -> the load did not run, or ran against another name
//   count 0           -> the load ran and wrote nothing (a loader defect, and
//                        R012 records a silent-miscount branch that produces
//                        exactly this while reporting success)
//   count > 0, hits 0 -> the documents exist but are not yet visible to search;
//                        the refresh has not landed. THIS is the readiness race,
//                        and it is the only one of the three worth retrying.
//
// The distinction is the whole point. The current symptom — an assertion deep in
// a step definition saying a list was empty — is consistent with all three, which
// is why three instances produced no diagnosis between them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { awaitIndexReady } from '../index-ready.js';

/**
 * A client stub that plays back a scripted sequence of poll outcomes.
 *
 * Each entry is what the NEXT poll should do, so a test states the timeline it
 * wants rather than the internals that produce it. `calls` is asserted on so a
 * gate that stops polling early, or never polls at all, cannot pass.
 */
const scriptedClient = (script) => {
  const calls = [];
  return {
    calls,
    async count({ index }) {
      calls.push({ op: 'count', index });
      const step = script[Math.min(calls.length - 1, script.length - 1)];
      if (step.missing) {
        const error = new Error('index_not_found_exception');
        error.meta = { statusCode: 404 };
        throw error;
      }
      return { body: { count: step.count } };
    },
    async search({ index }) {
      calls.push({ op: 'search', index });
      const step = script[Math.min(calls.length - 1, script.length - 1)];
      return { body: { hits: { total: { value: step.hits ?? 0 } } } };
    },
  };
};

describe('awaitIndexReady (P097 readiness gate)', () => {
  it(
    'bounds a stalled probe even when its remaining budget is already zero',
    { timeout: 1000 },
    async () => {
      let clockReads = 0;
      const client = {
        count: () => new Promise(() => {}),
      };
      await assert.rejects(
        awaitIndexReady({
          client,
          index: 'expired',
          timeoutMs: 20,
          now: () => (clockReads++ === 0 ? 0 : 20),
        }),
        /did not answer within 20ms/,
      );
    },
  );

  it('returns as soon as the index is populated AND searchable', async () => {
    const client = scriptedClient([{ count: 42, hits: 42 }]);
    const result = await awaitIndexReady({
      client,
      index: 'test-geo',
      timeoutMs: 1000,
      intervalMs: 1,
    });
    assert.equal(result.count, 42);
    assert.ok(
      client.calls.length >= 2,
      'must both count and search — a count alone does not prove searchability',
    );
  });

  it('RETRIES the refresh window: documents present, search not yet seeing them', async () => {
    // The readiness race itself. count is immediately non-zero; search returns
    // nothing until the refresh lands. A gate that only counted would pass here
    // and hand cucumber an index that still answers queries with [].
    const client = scriptedClient([
      { count: 7, hits: 0 },
      { count: 7, hits: 0 },
      { count: 7, hits: 7 },
    ]);
    const result = await awaitIndexReady({
      client,
      index: 'test-geo',
      timeoutMs: 2000,
      intervalMs: 1,
    });
    assert.equal(result.count, 7);
    assert.ok(
      client.calls.filter((c) => c.op === 'search').length > 1,
      'must keep polling while search is blind to documents that exist',
    );
  });

  it('names a MISSING index as missing, not as empty', async () => {
    const client = scriptedClient([{ missing: true }]);
    await assert.rejects(
      awaitIndexReady({
        client,
        index: 'test-geo',
        timeoutMs: 50,
        intervalMs: 1,
      }),
      (error) => {
        assert.match(error.message, /does not exist/);
        assert.match(error.message, /test-geo/);
        assert.doesNotMatch(
          error.message,
          /not yet searchable/,
          'a missing index is a load that did not run, not a refresh that is late',
        );
        return true;
      },
    );
  });

  it('names an EMPTY index as empty, and points at the loader rather than the race', async () => {
    const client = scriptedClient([{ count: 0, hits: 0 }]);
    await assert.rejects(
      awaitIndexReady({
        client,
        index: 'test-geo',
        timeoutMs: 50,
        intervalMs: 1,
      }),
      (error) => {
        assert.match(error.message, /0 documents/);
        assert.match(
          error.message,
          /loader/i,
          'count 0 after the timeout is a load that wrote nothing — say so',
        );
        return true;
      },
    );
  });

  it('a probe that never settles still yields a diagnostic, not a hang', async () => {
    // The deadline is only tested between probes, so without a per-probe race a
    // stalled connection would sail past it and burn the 240s BeforeAll budget —
    // trading all three messages above for a generic cucumber hook timeout,
    // which is the diagnosis-free outcome P097 already has.
    const client = {
      async count() {
        return new Promise(() => {}); // never settles
      },
      async search() {
        return new Promise(() => {});
      },
    };
    await assert.rejects(
      awaitIndexReady({
        client,
        index: 'test-geo',
        timeoutMs: 30,
        intervalMs: 1,
      }),
      (error) => {
        assert.match(error.message, /P097 readiness gate/);
        assert.doesNotMatch(
          error.message,
          /probe exceeded/,
          'the internal race marker is how we stopped looking, not what we found',
        );
        // A stalled probe is a FOURTH state, and must not be reported as one of
        // the three. Without this the message would read "the index does not
        // exist ... the load did not run" — confident, specific and wrong, which
        // is the conflation this module exists to remove.
        assert.match(error.message, /did not answer/);
        assert.doesNotMatch(error.message, /does not exist/);
        assert.doesNotMatch(error.message, /wrote nothing/);
        return true;
      },
    );
  });

  it('a real answer on the LAST poll is not lost to a zero-budget race', async () => {
    // Found against a real OpenSearch, not against this stub — pointing the gate
    // at a missing index reported "did not answer within 60s" instead of "does
    // not exist". The client threw a clean 404 every poll, but on the last one
    // the remaining budget was 0, so `rejectAfter(0)` fired before the response
    // landed and a legitimate answer lost a race it should never have entered.
    // The stub could not have caught it: it encodes the same assumption it tests.
    // The stub answers 404 on the first poll and then hangs, which is the
    // deterministic form of what the live client did: many real answers, then
    // one lost race at the deadline. A stall verdict here would discard every
    // answer already in hand.
    let polls = 0;
    let clockReads = 0;
    const client = {
      async count() {
        polls += 1;
        if (polls > 1) return new Promise(() => {});
        const error = new Error('index_not_found_exception');
        error.meta = { statusCode: 404 };
        throw error;
      },
      async search() {
        return { body: { hits: { total: { value: 0 } } } };
      },
    };
    await assert.rejects(
      awaitIndexReady({
        client,
        index: 'no-such-index',
        timeoutMs: 20,
        intervalMs: 1,
        now: () => clockReads++ < 3 ? 0 : 20,
      }),
      (error) => {
        assert.match(error.message, /does not exist/);
        assert.doesNotMatch(
          error.message,
          /did not answer/,
          'the client answered every time; only the clock ran out',
        );
        return true;
      },
    );
    assert.ok(polls > 1, 'must actually poll more than once before giving up');
  });

  it('does NOT call it a stall when the count already answered', async () => {
    // Count resolves with documents; search starts with an expired budget.
    // Its timeout must preserve the count rather than inventing a total stall.
    let clockReads = 0;
    const client = {
      async count() {
        return { body: { count: 5 } };
      },
      async search() {
        return new Promise(() => {}); // never settles
      },
    };
    await assert.rejects(
      awaitIndexReady({
        client,
        index: 'test-geo',
        timeoutMs: 20,
        intervalMs: 1,
        now: () => (clockReads++ < 2 ? 0 : 20),
      }),
      (error) => {
        assert.match(error.message, /not yet searchable/);
        assert.match(error.message, /5 documents/);
        assert.doesNotMatch(
          error.message,
          /did not answer/,
          'a count that answered is evidence; do not throw it away',
        );
        return true;
      },
    );
  });

  it('names the REFRESH case distinctly, and reports the count it can see', async () => {
    const client = scriptedClient([{ count: 12, hits: 0 }]);
    await assert.rejects(
      awaitIndexReady({
        client,
        index: 'test-geo',
        timeoutMs: 50,
        intervalMs: 1,
      }),
      (error) => {
        assert.match(error.message, /not yet searchable/);
        assert.match(
          error.message,
          /12 documents/,
          'the count is the evidence that separates this from an empty index',
        );
        return true;
      },
    );
  });
});
