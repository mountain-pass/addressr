// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
//
// Behavioural cover for the range-alias attachment and the document assembly,
// replacing source-inspection regexes over `service/address-service.js` (P033).
//
// These execute the code. The assertions they replace matched the service file
// as TEXT — including one that greps for `rval.sla_range_expanded =
// expandRangeAliases(`, which matches correct code while the field never
// reaches the index (P091). Attachment and assembly are different sites, and
// the regex was watching the one that worked.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachRangeAliases,
  buildIndexedDocument,
} from '../../../src/build-indexed-document.js';

/** A mapped address shaped as `mapAddressDetails` returns it. */
const mapped = ({ last, ...overrides } = {}) => ({
  pid: 'GAOT_717319770',
  sla: '96-108 GAZE RD, CHRISTMAS ISLAND OT 6798',
  ssla: '96-108 GAZE RD, CHRISTMAS ISLAND OT 6798',
  structured: {
    confidence: 2,
    number: {
      number: 96,
      ...(last !== undefined && { last: { number: last } }),
    },
    street: { name: 'GAZE', type: { name: 'RD' } },
    locality: { name: 'CHRISTMAS ISLAND' },
    state: { abbreviation: 'OT' },
    postcode: '6798',
  },
  ...overrides,
});

describe('attachRangeAliases (ADR 026 / ADR 028) — executed, not grepped', () => {
  it('attaches exactly the two endpoint aliases for a range address', () => {
    const r = attachRangeAliases(mapped({ last: 108 }));
    assert.deepStrictEqual(r.sla_range_expanded, [
      '96 GAZE RD, CHRISTMAS ISLAND OT 6798',
      '108 GAZE RD, CHRISTMAS ISLAND OT 6798',
    ]);
  });

  it('does not interpolate mid-range numbers (ADR 028 endpoint-only)', () => {
    const r = attachRangeAliases(mapped({ last: 108 }));
    const mid = r.sla_range_expanded.filter((a) =>
      /^(9[7-9]|10[0-7]) /.test(a),
    );
    assert.deepStrictEqual(
      mid,
      [],
      'a mid-range number in the alias list is the false-positive class ADR 026 was superseded for',
    );
  });

  it('leaves the field ABSENT on a non-range address, not empty', () => {
    const r = attachRangeAliases(mapped());
    assert.ok(
      !('sla_range_expanded' in r),
      'asymmetric population is load-bearing: an absent field contributes nothing, an empty array is a different document shape',
    );
  });

  it('gates on structured.number.last, which is the condition the old regex tried to prove', () => {
    assert.ok(!('sla_range_expanded' in attachRangeAliases(mapped())));
    assert.ok(
      'sla_range_expanded' in attachRangeAliases(mapped({ last: 108 })),
    );
  });

  it('composes the alias from street type and suffix, not just the street name', () => {
    const r = attachRangeAliases(
      mapped({
        last: 108,
        structured: { ...mapped({ last: 108 }).structured },
      }),
    );
    assert.ok(
      r.sla_range_expanded.every((a) => a.includes('GAZE RD,')),
      'the street type must be part of the alias or it cannot match a typed address',
    );
  });
});

describe('buildIndexedDocument — what actually reaches the index (P033 / P091)', () => {
  it('keeps sla and ssla at the top level', () => {
    const document = buildIndexedDocument({
      item: mapped(),
      localityPid: 'loc-1',
    });
    assert.equal(document.sla, '96-108 GAZE RD, CHRISTMAS ISLAND OT 6798');
    assert.equal(document.ssla, '96-108 GAZE RD, CHRISTMAS ISLAND OT 6798');
  });

  it('nests the remaining mapped fields under structured and lifts confidence', () => {
    const document = buildIndexedDocument({
      item: mapped(),
      localityPid: 'loc-1',
    });
    assert.equal(document.confidence, 2);
    assert.equal(document.structured.pid, 'GAOT_717319770');
  });

  it('omits confidence rather than defaulting it when the G-NAF row has none', () => {
    const item = mapped();
    delete item.structured.confidence;
    const document = buildIndexedDocument({ item, localityPid: 'loc-1' });
    assert.equal(
      document.confidence,
      undefined,
      'a default here would be a document-shape change smuggled through a refactor',
    );
  });

  it('carries locality_pid from the source row, not from the mapped item', () => {
    const document = buildIndexedDocument({
      item: mapped(),
      localityPid: 'loc-42',
    });
    assert.equal(document.locality_pid, 'loc-42');
  });

  // CHARACTERISATION, not a target. This pins TODAY's shape so that whichever
  // way P091 resolves, it resolves visibly. It deliberately does NOT assert
  // where the field SHOULD live: P091's leading option is to remove it
  // altogether (measured — the alias adds nothing to recall and makes range
  // docs compete with the real address at that number), and its fallback option
  // is to map the path the data already occupies rather than hoist it. Both
  // leave a top-level assertion wrong. Naming an answer here would pre-empt a
  // decision that ticket is holding open on measurement.
  it('currently assembles sla_range_expanded into structured, where nothing is indexed', () => {
    const document = buildIndexedDocument({
      item: attachRangeAliases(mapped({ last: 108 })),
      localityPid: 'loc-1',
    });
    assert.equal(
      document.sla_range_expanded,
      undefined,
      'top-level placement would be a change P091 has not decided on',
    );
    assert.ok(
      Array.isArray(document.structured.sla_range_expanded),
      'this is where the field lands today. The index mapping declares it top-level, and `structured` is `{ type: object, enabled: false }` — nothing under it is indexed — so the field is unreachable by any query. See P091; this assertion exists to make its resolution loud.',
    );
  });

  it('no searchable field is assembled under the index-disabled structured container', async () => {
    // The general form of the P091 defect, so the NEXT field added is covered
    // without anyone remembering. Grounded on the mechanism rather than on a
    // hand-copied list: `structured` is mapped `enabled: false`, so anything
    // nested under it is not indexed at all.
    //
    // VACUOUS ON TODAY'S CODE, deliberately, and worth knowing before trusting
    // it: of the declared top-level properties, `confidence` and `locality_pid`
    // are never keys of `item`, and `sla_range_expanded` is excluded below
    // pending P091. That leaves `sla` and `ssla`, which the destructure hoists
    // by construction. Its value is prospective.
    const { buildAddressIndexBody } =
      await import('../../../src/init-index-config.js');
    const properties = buildAddressIndexBody([]).mappings.properties;
    assert.equal(
      properties.structured.enabled,
      false,
      'this assertion rests on structured being index-disabled; if that changes, the reasoning below needs revisiting',
    );
    // The container itself, and the one field whose placement P091 owns.
    const EXCLUDED = new Set(['structured', 'sla_range_expanded']);
    const item = attachRangeAliases(mapped({ last: 108 }));
    const document = buildIndexedDocument({ item, localityPid: 'loc-1' });
    const misplaced = Object.keys(properties).filter(
      (f) =>
        !EXCLUDED.has(f) &&
        Object.hasOwn(item, f) &&
        !Object.hasOwn(document, f) &&
        Object.hasOwn(document.structured, f),
    );
    assert.deepStrictEqual(
      misplaced,
      [],
      `declared top-level in the mapping but assembled under the index-disabled structured container, so unreachable by any query: ${misplaced.join(', ')}`,
    );
  });

  it('PRESERVES the key order of whatever item it is given (it does not decide that order)', () => {
    // `getAddress` returns `{ ..._source.structured, sla }` and hashes it with
    // md5 to produce the ETag. `JSON.stringify` is key-insertion-order
    // sensitive, so the order of this bucket is an observable API contract, not
    // an implementation detail. Nothing asserted it before this line.
    //
    // SCOPE, stated because over-claiming in a test NAME is exactly the failure
    // this ticket is about. Order here is inherited from the rest-destructure,
    // so it follows `item`'s own key order — which `mapAddressDetails` decides,
    // one module upstream, still babel-only and still without behavioural
    // cover. So this pins PRESERVATION by this function, not the production
    // order: the fixture emits `pid, sla, ssla, structured` and production
    // emits `structured, precedence?, pid, mla, smla?, sla_range_expanded`.
    // The ETag contract is only as pinned as the upstream module, which is not.
    const document = buildIndexedDocument({
      item: attachRangeAliases(mapped({ last: 108 })),
      localityPid: 'loc-1',
    });
    assert.deepStrictEqual(Object.keys(document.structured), [
      'pid',
      'structured',
      'sla_range_expanded',
    ]);
  });
});
