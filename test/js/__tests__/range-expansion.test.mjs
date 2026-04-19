import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandRangeAliases,
  SPAN_CAP,
} from '../../../service/range-expansion.js';

// ADR 026: range-number address expansion via multi-valued text alias field.
// `expandRangeAliases(first, last, streetPart, localityPart)` returns one
// fully-expanded address string per in-range number up to `SPAN_CAP`, or an
// empty array when the span exceeds the cap / inputs are invalid. Pure
// function, no I/O, no OpenSearch dependency — invoked from `mapToMla`.
describe('service/range-expansion.js — expandRangeAliases (ADR 026)', () => {
  it('exposes SPAN_CAP = 20 per ADR 026 Decision Outcome', () => {
    assert.equal(SPAN_CAP, 20, 'SPAN_CAP must be 20 per ADR 026');
  });

  it('produces one alias per in-range number for a typical range', () => {
    const aliases = expandRangeAliases(
      103,
      107,
      'GAZE RD',
      'CHRISTMAS ISLAND OT 6798',
    );
    assert.deepEqual(aliases, [
      '103 GAZE RD, CHRISTMAS ISLAND OT 6798',
      '104 GAZE RD, CHRISTMAS ISLAND OT 6798',
      '105 GAZE RD, CHRISTMAS ISLAND OT 6798',
      '106 GAZE RD, CHRISTMAS ISLAND OT 6798',
      '107 GAZE RD, CHRISTMAS ISLAND OT 6798',
    ]);
  });

  it('returns aliases at the exact span cap (first=1, last=21 → span=20, 21 aliases)', () => {
    const aliases = expandRangeAliases(1, 21, 'X ST', 'Y LOC STATE 1234');
    assert.equal(
      aliases.length,
      21,
      'span == SPAN_CAP must produce (span+1) aliases, not be cap-rejected',
    );
    assert.equal(aliases[0], '1 X ST, Y LOC STATE 1234');
    assert.equal(aliases[20], '21 X ST, Y LOC STATE 1234');
  });

  it('returns empty array when span exceeds cap (first=1, last=22 → span=21)', () => {
    const aliases = expandRangeAliases(1, 22, 'X ST', 'Y LOC STATE 1234');
    assert.deepEqual(
      aliases,
      [],
      'span > SPAN_CAP must return empty — the hyphenated canonical form remains findable',
    );
  });

  it('returns empty array for the NSW 111,014-span data-quality outlier', () => {
    const aliases = expandRangeAliases(
      1,
      111_015,
      'PATHOLOGICAL RD',
      'SOMEWHERE NSW 2000',
    );
    assert.deepEqual(
      aliases,
      [],
      'extreme G-NAF outliers must not trigger unbounded expansion',
    );
  });

  it('returns empty array for reversed ranges (first > last, G-NAF data error)', () => {
    const aliases = expandRangeAliases(107, 103, 'GAZE RD', 'X OT 6798');
    assert.deepEqual(aliases, []);
  });

  it('returns empty array when first === last (no range present)', () => {
    const aliases = expandRangeAliases(104, 104, 'GAZE RD', 'X OT 6798');
    assert.deepEqual(
      aliases,
      [],
      'non-range inputs are handled by the caller, not by expansion',
    );
  });

  it('returns empty array for non-positive numbers (G-NAF absent/invalid)', () => {
    assert.deepEqual(expandRangeAliases(0, 5, 'X ST', 'Y'), []);
    assert.deepEqual(expandRangeAliases(-1, 5, 'X ST', 'Y'), []);
    assert.deepEqual(expandRangeAliases(1, 0, 'X ST', 'Y'), []);
  });

  it('preserves street and locality tokens verbatim — no re-casing, no trimming', () => {
    const aliases = expandRangeAliases(
      5,
      7,
      'st geoRGES tce',
      'perth WA 6000',
    );
    assert.equal(aliases[0], '5 st geoRGES tce, perth WA 6000');
    assert.equal(aliases[2], '7 st geoRGES tce, perth WA 6000');
  });

  it('rejects non-integer first/last (G-NAF NUMBER_FIRST is always integer)', () => {
    assert.deepEqual(
      expandRangeAliases(1.5, 5, 'X ST', 'Y'),
      [],
      'non-integer number must not drive expansion',
    );
    assert.deepEqual(expandRangeAliases(1, 5.5, 'X ST', 'Y'), []);
  });
});
