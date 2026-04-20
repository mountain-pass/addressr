import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandRangeAliases } from '../../../service/range-expansion.js';

// ADR 028 (supersedes ADR 026): endpoint-only expansion. For a G-NAF range
// address like `103-107 GAZE RD` (where NUMBER_FIRST=103 and NUMBER_LAST=107),
// only the two endpoints are actual addresses of the property — interpolating
// (emitting 104/105/106) produces false positives because those numbers
// either live on the opposite side of the street or are separate properties
// we can't prove belong to this record. See ADR 028 and #367 2022-06-24 +
// 2022-07-10 comments from reporter `hirani89`.
describe('service/range-expansion.js — expandRangeAliases (ADR 028, endpoint-only)', () => {
  it('produces exactly two aliases for a typical range (first and last only)', () => {
    const aliases = expandRangeAliases(
      103,
      107,
      'GAZE RD',
      'CHRISTMAS ISLAND OT 6798',
    );
    assert.deepEqual(aliases, [
      '103 GAZE RD, CHRISTMAS ISLAND OT 6798',
      '107 GAZE RD, CHRISTMAS ISLAND OT 6798',
    ]);
  });

  it('does NOT interpolate mid-range numbers (prevents ADR 026 false positives)', () => {
    const aliases = expandRangeAliases(
      103,
      107,
      'GAZE RD',
      'CHRISTMAS ISLAND OT 6798',
    );
    assert.equal(aliases.length, 2, 'expected exactly 2 aliases, got more');
    // Explicitly assert mid-range numbers are absent — regression guard
    // against re-introducing interpolation.
    for (const midRange of ['104', '105', '106']) {
      const hit = aliases.find((a) => a.startsWith(`${midRange} `));
      assert.equal(
        hit,
        undefined,
        `mid-range ${midRange} must NOT appear in aliases — see ADR 028`,
      );
    }
  });

  it('produces two endpoint aliases regardless of range span (no SPAN_CAP needed)', () => {
    // Under ADR 026 a 100-span range produced 101 aliases and hit the
    // SPAN_CAP=20 guard. Under ADR 028 only endpoints matter so span is
    // irrelevant — a 1000-span range still produces exactly 2 aliases.
    const bigRange = expandRangeAliases(
      1,
      1000,
      'LARGE RD',
      'SOMEWHERE STATE 1000',
    );
    assert.equal(bigRange.length, 2);
    assert.equal(bigRange[0], '1 LARGE RD, SOMEWHERE STATE 1000');
    assert.equal(bigRange[1], '1000 LARGE RD, SOMEWHERE STATE 1000');
  });

  it('handles data-quality outliers (span > 10000) without storage inflation', () => {
    // Previously SPAN_CAP=20 excluded outliers. Now every range — including
    // the measured NSW span 111,014 outlier — produces 2 aliases cleanly.
    const outlier = expandRangeAliases(
      1,
      111_015,
      'PATHOLOGICAL RD',
      'SOMEWHERE NSW 2000',
    );
    assert.equal(outlier.length, 2);
    assert.equal(outlier[0], '1 PATHOLOGICAL RD, SOMEWHERE NSW 2000');
    assert.equal(outlier[1], '111015 PATHOLOGICAL RD, SOMEWHERE NSW 2000');
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

  it('rejects non-integer first/last (G-NAF NUMBER_FIRST is always integer)', () => {
    assert.deepEqual(
      expandRangeAliases(1.5, 5, 'X ST', 'Y'),
      [],
      'non-integer number must not drive expansion',
    );
    assert.deepEqual(expandRangeAliases(1, 5.5, 'X ST', 'Y'), []);
  });

  it('preserves street and locality tokens verbatim in both endpoints', () => {
    const aliases = expandRangeAliases(
      5,
      7,
      'st geoRGES tce',
      'perth WA 6000',
    );
    assert.equal(aliases[0], '5 st geoRGES tce, perth WA 6000');
    assert.equal(aliases[1], '7 st geoRGES tce, perth WA 6000');
  });
});
