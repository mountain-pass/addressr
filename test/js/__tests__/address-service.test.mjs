import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import debug from 'debug';
import { createServer } from 'node:http';
import { buildAddressSearchBody } from '../../../packages/addressr/src/build-search-body.js';
import {
  searchForAddress,
  mapAddressDetails,
  getAddress,
} from '../../../packages/addressr/service/address-service.js';
import {
  _resetShadowCountersForTesting,
  _resetShadowClientForTesting,
} from '../../../packages/addressr/src/read-shadow.js';

// No source-inspection tests remain in this file. Every block below drives the
// subject and asserts on what comes back. The history — what was here, what
// each pin was blind to, and what replaced it — is in P033 and RFC-009 row 1,
// 5 and 6/7; per DECISION-MANAGEMENT a superseded claim is deleted in a code
// comment and retained in the decision record.
// WHAT THIS DOES NOT ESTABLISH — stated here rather than only in RFC-009,
// because the describe title is what a reader of this file sees:
//
//   - THE SEARCH LEG ONLY. `getAddress` contains no `mirrorRequest` call —
//     verified by reading, not assumed. ADR-031's Behaviour section and
//     `read-shadow.js`'s own header both claim `/addresses/{id}` is mirrored;
//     that leg has never existed. A title reading "read-shadow WIRING" would
//     otherwise transfer coverage over a mechanism half of which was not built.
//   - NOT the single build. The production comment calls it load-bearing:
//     "Calling buildAddressSearchBody twice would satisfy every existing
//     assertion while quietly voiding this." This compares the mirrored body to
//     the primary's, so a FAITHFUL rebuild is deep-equal and passes. Nothing
//     outside the module can prove one object is shared.
describe('service/address-service.js — read-shadow WIRING, search leg (ADR 031)', () => {
  let server;
  let received;
  let saved;

  beforeEach(async () => {
    received = [];
    server = createServer((request, response) => {
      const chunks = [];
      request.on('data', (c) => {
        chunks.push(c);
      });
      request.on('end', () => {
        received.push({
          method: request.method,
          url: request.url,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ took: 1, hits: { total: 0, hits: [] } }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address();
    saved = {
      host: process.env.ADDRESSR_SHADOW_HOST,
      port: process.env.ADDRESSR_SHADOW_PORT,
      protocol: process.env.ADDRESSR_SHADOW_PROTOCOL,
      client: globalThis.esClient,
    };
    // Three separate vars — HOST is a HOSTNAME. Putting a URL in it yields
    // `https://http://127.0.0.1:9:443`, which fails DNS on the hostname `http`
    // and never reaches the port. An earlier draft of this test did exactly
    // that and still passed, because the counter it asserted moves before
    // dispatch.
    process.env.ADDRESSR_SHADOW_HOST = '127.0.0.1';
    process.env.ADDRESSR_SHADOW_PORT = String(port);
    process.env.ADDRESSR_SHADOW_PROTOCOL = 'http';
    _resetShadowCountersForTesting();
    _resetShadowClientForTesting();
  });

  afterEach(async () => {
    for (const [key, value] of [
      ['ADDRESSR_SHADOW_HOST', saved.host],
      ['ADDRESSR_SHADOW_PORT', saved.port],
      ['ADDRESSR_SHADOW_PROTOCOL', saved.protocol],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.esClient = saved.client;
    _resetShadowCountersForTesting();
    _resetShadowClientForTesting();
    // closeAllConnections or the keepalive sockets hold the runner open.
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });

  // The shadow leg is fire-and-forget: searchForAddress returns without waiting
  // for it, so the assertion has to wait for the wire, not for the call.
  const awaitMirroredRequest = async (timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return received[0];
  };

  it('searchForAddress puts a SEARCH on the wire to the shadow target', async () => {
    globalThis.esClient = {
      search: async () => ({
        body: { hits: { total: { value: 0 }, hits: [] } },
      }),
    };

    await searchForAddress('657 The Entrance Road', 1);
    const mirrored = await awaitMirroredRequest();

    assert.ok(
      mirrored,
      'nothing reached the shadow target — the read-shadow mirror is wired in name only, whatever the source says',
    );
    // This does NOT pin single dispatch, and an earlier comment claimed it did.
    // `awaitMirroredRequest` returns the instant the first request lands, so a
    // second still in flight would not be counted yet. What it establishes is
    // narrower and still worth having: nothing arrived BEFORE the mirrored
    // search, so `received[0]` is the request the assertions below describe.
    assert.equal(
      received.length,
      1,
      `something reached the shadow target before the mirrored search; received ${received.length}`,
    );
    // POST + _search is what client.search() issues; client.get() would be a
    // GET to _doc/<id>. This is the method assertion the deleted pin made
    // against source text, made instead against the request that was sent.
    assert.equal(
      mirrored.method,
      'POST',
      `expected a search POST, got ${mirrored.method} ${mirrored.url}`,
    );
    assert.match(
      mirrored.url,
      /_search/,
      `expected the shadow request to hit _search, got ${mirrored.url}`,
    );
  });

  it('mirrors the same query the primary search ran, not a differently-built one', async () => {
    // Not shared-reference — nothing outside can prove that. But "the same
    // query" is assertable now the body is on the wire, and it is the property
    // ADR-031's cache-warming argument actually depends on.
    let primaryBody;
    globalThis.esClient = {
      search: async (parameters) => {
        primaryBody = parameters.body;
        return { body: { hits: { total: { value: 0 }, hits: [] } } };
      },
    };

    await searchForAddress('657 The Entrance Road', 1);
    const mirrored = await awaitMirroredRequest();

    assert.ok(mirrored, 'nothing reached the shadow target');
    assert.deepEqual(
      JSON.parse(mirrored.body),
      primaryBody,
      'the shadow leg sent a different query from the one the primary search ran — the warmed cache will not match production traffic',
    );
  });
});

// CONVERTED 2026-08-21 — RFC-009 row 5. The pin here read the file as TEXT and
// asserted `JSON.stringify(rval` was absent from mapAddressDetails. STORY-001
// measured it BLIND to the defect it protects against: stringify a DIFFERENT
// variable — `JSON.stringify(d, …)` — and the pinned string stays absent while
// the whole per-row cost comes back. A negative pin constrains one spelling and
// says nothing about behaviour, which makes it the weakest shape in the
// population, not a special one.
//
// P012's subject is the loader emitting ~60K JSON lines per state reindex and
// drowning out real errors (JTBD-203, self-hosted operator, fail-loud). So the
// property is about what the logger EMITS, and that is directly observable:
// `debug` exposes its output sink, so the progress line can be captured and
// measured instead of matched.
describe('service/address-service.js — progress logging emits no payload (P012)', () => {
  let captured;
  let savedLog;
  let savedEnabled;

  beforeEach(() => {
    captured = [];
    savedEnabled = debug.enabled('api');
    savedLog = debug.log;
    debug.enable('api');
    debug.log = (...arguments_) => captured.push(arguments_.join(' '));
  });

  afterEach(() => {
    debug.log = savedLog;
    if (!savedEnabled) debug.disable();
  });

  it('logs a bare percentage per row, never the record it just mapped', () => {
    const d = {
      ADDRESS_DETAIL_PID: 'GAOT_1',
      STREET_LOCALITY_PID: 'SL1',
      LOCALITY_PID: 'L1',
      POSTCODE: '2250',
      // The canary must survive INTO the mapped record, or it only catches a
      // dump of the input. FLAT_NUMBER does not: it reaches rval through
      // Number.parseInt and becomes NaN, so a stringify(rval) mutation would be
      // caught only by the length bound below. BUILDING_NAME is copied verbatim,
      // so this is live for a dump of either the input or the output.
      BUILDING_NAME: 'X'.repeat(500),
      FLAT_NUMBER: '1',
    };
    // Every authority-code table the mapper consults, empty. The lookups return
    // undefined and the mapper handles that; the test is about what gets LOGGED,
    // not about code resolution, which has its own coverage.
    const context = {
      streetLocalityIndexed: { SL1: {} },
      localityIndexed: { L1: {} },
      Authority_Code_FLAT_TYPE_AUT_psv: [],
      Authority_Code_GEOCODED_LEVEL_TYPE_AUT_psv: [],
      Authority_Code_GEOCODE_RELIABILITY_AUT_psv: [],
      Authority_Code_GEOCODE_TYPE_AUT_psv: [],
      Authority_Code_LEVEL_TYPE_AUT_psv: [],
      Authority_Code_LOCALITY_CLASS_AUT_psv: [],
      Authority_Code_STREET_CLASS_AUT_psv: [],
      Authority_Code_STREET_SUFFIX_AUT_psv: [],
      Authority_Code_STREET_TYPE_AUT_psv: [],
    };

    mapAddressDetails(d, context, 0, 100);

    assert.ok(
      captured.length > 0,
      'nothing was logged — the capture is not wired, so any assertion below would pass vacuously',
    );

    const progress = captured.join('\n');
    assert.ok(
      /\d+(\.\d+)?%/.test(progress),
      `expected a percentage progress line, got: ${progress.slice(0, 120)}`,
    );
    assert.ok(
      !progress.includes('X'.repeat(50)),
      'the mapped record was written into the progress log — P012 is back: a state reindex emits one payload per row and buries real errors',
    );
    assert.ok(
      progress.length < 200,
      `the progress line is ${progress.length} chars; it should be a percentage, not a record dump`,
    );
  });
});

// CONVERTED 2026-08-21 — RFC-009 rows 6/7. Two pins read the file as TEXT and
// asserted the shape of the catch block: that `error_.body` is guarded before
// `.found` and `.error.type` are read, and that RequestTimeout maps to 504.
// STORY-001 measured both BLIND: put an early return above the catch body and
// every pinned guard string is still present below it, unreachable, with the
// suite green.
//
// P014's actual defect was a CRASH — an error with no `body` threw while the
// handler was trying to classify it, so the caller got an unhandled rejection
// instead of a status. That is a behaviour, and `getAddress` is exported and
// reaches OpenSearch only through the stubbable `globalThis.esClient`, so each
// branch can simply be driven and its result asserted.
describe('service/address-service.js — getAddress error mapping (P014)', () => {
  let savedClient;

  const rejectWith = (error_) => {
    globalThis.esClient = {
      get: async () => {
        throw error_;
      },
    };
  };

  beforeEach(() => {
    savedClient = globalThis.esClient;
  });

  afterEach(() => {
    globalThis.esClient = savedClient;
  });

  // THE P014 REGRESSION ITSELF. An error carrying no `body` must be classified,
  // not crash the classifier. Before the guard, reading `.found` off undefined
  // threw inside the catch and the caller got an unhandled rejection.
  it('classifies an error with no body instead of throwing while classifying it', async () => {
    rejectWith(new Error('connection reset'));
    const result = await getAddress('GAOT_1');
    assert.equal(
      result.statusCode,
      500,
      'an error with no body must map to 500, not escape the handler',
    );
  });

  it('maps a not-found document to 404', async () => {
    rejectWith({ body: { found: false } });
    const result = await getAddress('GAOT_1');
    assert.equal(result.statusCode, 404);
  });

  it('maps a missing index to 503 — the backend is unavailable, not the address absent', async () => {
    rejectWith({ body: { error: { type: 'index_not_found_exception' } } });
    const result = await getAddress('GAOT_1');
    assert.equal(result.statusCode, 503);
  });

  // CHARACTERISATION, NOT A CONTRACT — this branch cannot currently fire.
  //
  // Production selects it with `error_.displayName === 'RequestTimeout'`.
  // Measured 2026-08-21: no `@opensearch-project/opensearch` error carries
  // `displayName` at all — the string appears nowhere in that package, and
  // exactly twice in this repo, both of them this predicate. It is a leftover
  // from `elasticsearch-js`, which named errors that way. A real timeout falls
  // through to the else and returns 500. Tracked as P117.
  //
  // So this case drives the branch with a HAND-MADE error carrying the field the
  // production code reads. That is deliberate and it is labelled, because it is
  // the trap: a behavioural test can reproduce a source pin's blindness exactly,
  // by fabricating the input the source implies rather than the input the caller
  // receives. The first version of this test did that WITHOUT noticing.
  //
  // It stays because the mapping is the intended contract and this pins it
  // against a further drift; it must not be read as evidence that a production
  // timeout returns 504. The test below pins the real client shape.
  it('maps a request timeout to 504 — characterising a branch P117 records as unreachable', async () => {
    // 504 not 500: a timeout is the upstream failing to answer in time, and the
    // sibling list endpoint already reports it that way. A client retrying on
    // 504 and not on 500 depends on the two agreeing.
    const timeout = new Error('timeout');
    timeout.displayName = 'RequestTimeout';
    rejectWith(timeout);
    const result = await getAddress('GAOT_1');
    assert.equal(result.statusCode, 504);
  });

  // CHAIN-ORDER DETECTOR, and labelled as one rather than as a bug guard.
  //
  // Every other case here satisfies exactly one branch, so the else-if chain can
  // be reordered freely and all of them still pass — measured BLIND against a
  // hoist of the timeout branch above the body branches. This input satisfies
  // TWO, so it pins which one wins.
  //
  // BE HONEST ABOUT THE STAKE: an OpenSearch RequestTimeout carries no `body`,
  // because there was no response to carry one. So no error the client can
  // actually produce satisfies both predicates, and the reorder this detects is
  // behaviour-preserving for every real input. An earlier version of this
  // comment claimed the reorder would report a missing address as a timeout
  // that clients retry — a consequence that cannot occur, and exactly the kind
  // of overstated stake this conversion exists to remove.
  //
  // The verdict pinned is still the right one, for a reason worth stating: a
  // `found: false` body means the server ANSWERED. An answer is not a gateway
  // timeout. Keeping the case is worthwhile because an unpinned else-if chain
  // invites reordering, not because a live defect is being held back.
  it('prefers not-found over timeout when an error satisfies both', async () => {
    rejectWith({ body: { found: false }, displayName: 'RequestTimeout' });
    const result = await getAddress('GAOT_1');
    assert.equal(
      result.statusCode,
      404,
      'the branch order changed: an error carrying a found:false body is no longer classified as not-found. The server answered, so it is not a gateway timeout',
    );
  });

  // The status alone does not pin the response: swap two payload strings and
  // every status assertion above still passes.
  it('carries the payload that matches the status', async () => {
    const cases = [
      [{ body: { found: false } }, 404, 'not found'],
      [
        { body: { error: { type: 'index_not_found_exception' } } },
        503,
        'service unavailable',
      ],
      [{ body: { error: { type: 'other' } } }, 500, 'unexpected error'],
      [
        // FABRICATED SHAPE — same caveat as the characterisation case above. No
        // client error carries `displayName`, so this row pins the intended
        // payload for a branch P117 records as unreachable, not a live contract.
        Object.assign(new Error('t'), { displayName: 'RequestTimeout' }),
        504,
        'gateway timeout',
      ],
    ];
    for (const [thrown, status, message] of cases) {
      rejectWith(thrown);
      const result = await getAddress('GAOT_1');
      assert.equal(result.statusCode, status);
      assert.equal(
        result.json.error,
        message,
        `status ${status} carried the wrong payload`,
      );
    }
  });

  // THE REAL SHAPE, and the one that fails today's behaviour honestly. A genuine
  // client timeout carries `name: 'TimeoutError'` and no `displayName`, so it
  // reaches the else. Asserting 500 records what production DOES; P117 carries
  // what it should do. When P117 lands this case flips to 504 and the
  // characterisation case above is deleted.
  it('a REAL client timeout currently returns 500, not 504 (P117)', async () => {
    const { errors } = await import('@opensearch-project/opensearch');
    const timeout = new errors.TimeoutError('timeout', {});
    assert.equal(
      timeout.displayName,
      undefined,
      'the client now sets displayName — P117 may be fixed upstream; re-check the predicate',
    );
    rejectWith(timeout);
    const result = await getAddress('GAOT_1');
    assert.equal(
      result.statusCode,
      500,
      'a real client timeout no longer returns 500 — if it returns 504, P117 is fixed and this case should be deleted',
    );
  });

  it('maps anything else to 500', async () => {
    rejectWith({ body: { error: { type: 'something_else' } } });
    const result = await getAddress('GAOT_1');
    assert.equal(result.statusCode, 500);
  });
});

// ADR 028 (query-side wiring for sla_range_expanded), ADR 027 (bool_prefix
// fuzziness) and ADR 043 (the keyword-prefix anchor). These were
// source-inspection regexes over service/address-service.js until 2026-08-07 —
// the P033 anti-pattern. The query body now lives in src/build-search-body.js
// (clean ESM), so they assert on the built object instead.
//
// ADR 028's pins have now been re-pointed TWICE, both times re-pointed rather
// than deleted, so its Reassessment Criterion 5 has never fired: first from
// source regex to built object, then from the phrase_prefix clause to ADR 043's
// dis_max. The one pin that could NOT move is the old
// `phrase_prefix fields includes sla_range_expanded` assertion, because ADR 043
// removes that field from the query entirely. Its successor is the POSITIVE
// assertion below that the anchor targets exactly sla.raw and ssla.raw — and
// deliberately NOT a blanket "sla_range_expanded must never reappear", which
// would pre-block ADR 043 Reassessment Criterion 4, the criterion that exists to
// re-open precisely that question.
const clausesFor = (q = '278 ROSS RIVER RD') =>
  buildAddressSearchBody({ searchString: q, page: 1, pageSize: 8 }).query.bool
    .should;
const byType = (type) =>
  clausesFor().find((c) => c.multi_match?.type === type)?.multi_match;
const anchorIn = (clauses) => clauses.find((c) => c.dis_max)?.dis_max;

describe('src/build-search-body.js — the keyword-prefix anchor (ADR 043)', () => {
  it('anchors on exactly sla.raw and ssla.raw, with the query uppercased', () => {
    const anchor = anchorIn(clausesFor('8 waters rd'));
    assert.ok(anchor, 'a dis_max anchor clause must exist');
    assert.deepStrictEqual(anchor.queries, [
      { prefix: { 'sla.raw': '8 WATERS RD' } },
      { prefix: { 'ssla.raw': '8 WATERS RD' } },
    ]);
  });

  it('the anchor declares no explicit tie_breaker (ADR 028 pin, re-pointed)', () => {
    // Max across fields, not a sum. NOTE the original rationale for this pin
    // does not survive the move: absent-field-contributes-0 mattered because
    // sla_range_expanded was absent on non-range docs, whereas sla.raw and
    // ssla.raw are populated on EVERY document, so nothing is absent and a
    // raised tie_breaker could not act as a malus. Do not restore the old
    // message — it would state a false reason.
    assert.ok(
      !('tie_breaker' in anchorIn(clausesFor())),
      'the dis_max anchor MUST NOT declare tie_breaker. It is load-bearing for ADR 025 Decision Driver 4 (no tuning parameters): any non-zero value is a magic number needing its own justification. See ADR 028 Reassessment Criterion 5 as amended by ADR 043.',
    );
  });

  it('omits the anchor until the query advances past the street number', () => {
    // Selectivity, not length. "1" measured 2651 ms against a 334 ms baseline;
    // "10" is two characters and still cost +191 ms; "A" was FASTER than
    // baseline. The predicate is a non-space followed by whitespace, which is
    // NOT the same as "contains whitespace" — they differ on a leading space.
    for (const q of ['1', '10', '278', 'A', '  ', ' 8']) {
      assert.equal(
        anchorIn(clausesFor(q)),
        undefined,
        `must not anchor on ${JSON.stringify(q)}`,
      );
    }
    // The trailing space is where the clause becomes cheap AND useful: it is
    // the first keystroke at which there is anything to discriminate.
    for (const q of ['8 ', '8 W', '8 WATERS RD']) {
      assert.ok(anchorIn(clausesFor(q)), `must anchor on ${q}`);
    }
    // Accepted no-op: gated ON, but a leading space prefixes nothing, so the
    // anchor contributes zero and bool_prefix carries the query. Recorded so a
    // future reader does not read it as a defect.
    const leading = anchorIn(clausesFor(' 8 WATERS RD'));
    assert.deepStrictEqual(leading.queries[0], {
      prefix: { 'sla.raw': ' 8 WATERS RD' },
    });
  });
});

describe('src/build-search-body.js — searchForAddress query clauses (ADR 027 / ADR 028)', () => {
  it('bool_prefix multi_match fields is exactly [sla, ssla] (protects ADR 025)', () => {
    const bool = byType('bool_prefix');
    assert.ok(bool, 'bool_prefix multi_match clause must exist');
    assert.deepStrictEqual(
      bool.fields,
      ['sla', 'ssla'],
      'bool_prefix multi_match MUST NOT reference sla_range_expanded — bool_prefix sums across fields and would reintroduce P007-shape asymmetry (see ADR 025 and ADR 028)',
    );
  });

  it('bool_prefix multi_match declares fuzziness: "AUTO:5,8"', () => {
    const bool = byType('bool_prefix');
    assert.equal(
      bool.fuzziness,
      'AUTO:5,8',
      'bool_prefix multi_match fuzziness MUST be "AUTO:5,8" per ADR 027. Do not revert to plain "AUTO" (numeric fuzz reintroduced) or tighten further to "AUTO:6,8" (loses 5-char typo tolerance — see baseline query 8).',
    );
  });

  it('omits the should clauses entirely when searchString is empty', () => {
    const body = buildAddressSearchBody({
      searchString: '',
      page: 1,
      pageSize: 8,
    });
    assert.ok(
      !('should' in body.query.bool),
      'empty query must not build clauses',
    );
  });

  it('page-undefined first call starts at from: 0', () => {
    // `(page - 1 || 0)` is load-bearing: NaN || 0 -> 0. A `(page ?? 1) - 1`
    // rewrite would yield NaN here and break the first-page call.
    const body = buildAddressSearchBody({
      searchString: 'x',
      page: undefined,
      pageSize: 8,
    });
    assert.equal(body.from, 0);
  });
});
