// Behavioural tests (NOT source-inspection — see P033) for the loader's
// COVERED_STATES filter (P034). A lowercase or mixed-case COVERED_STATES
// value (e.g. `ot`, `Nsw`) matched none of G-NAF's uppercase file prefixes
// (OT_ADDRESS_DETAIL_psv.psv), so the loader silently indexed zero docs.
// The parser must normalise entries to uppercase so membership checks
// against filename-derived state codes match regardless of env-var casing.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  getCoveredStates,
  detailFileState,
  matchesCoveredStatePrefix,
  hasNoCoveredDetailMatch,
} = await import('../../../service/covered-states.js');

describe('service/address-service.js — COVERED_STATES case-insensitivity (P034)', () => {
  it('uppercases lowercase entries so `ot` covers OT_ADDRESS_DETAIL_psv.psv', () => {
    process.env.COVERED_STATES = 'ot';
    const covered = getCoveredStates();
    assert.deepEqual(covered, ['OT']);
    const state = detailFileState(
      'G-NAF/G-NAF AUGUST 2021/Standard/OT_ADDRESS_DETAIL_psv.psv',
    );
    assert.equal(state, 'OT');
    assert.ok(covered.includes(state.toUpperCase()));
  });

  it('trims and uppercases mixed-case comma-separated entries', () => {
    process.env.COVERED_STATES = ' Nsw, vic ';
    assert.deepEqual(getCoveredStates(), ['NSW', 'VIC']);
  });

  it('returns [] (no filtering) for empty or whitespace-only values', () => {
    process.env.COVERED_STATES = '';
    assert.deepEqual(getCoveredStates(), []);
    process.env.COVERED_STATES = ' ';
    assert.deepEqual(getCoveredStates(), []);
  });

  it('derives the state code verbatim from a detail file path', () => {
    assert.equal(
      detailFileState('foo/Standard/NSW_ADDRESS_DETAIL_psv.psv'),
      'NSW',
    );
  });

  describe('matchesCoveredStatePrefix (file-prefix filter)', () => {
    it('matches a file whose prefix is a covered state, case-insensitively', () => {
      // covered states come pre-uppercased from getCoveredStates()
      assert.ok(
        matchesCoveredStatePrefix(
          'G-NAF/Standard/OT_ADDRESS_DETAIL_psv.psv',
          ['OT'],
        ),
      );
      assert.ok(
        matchesCoveredStatePrefix('foo/NSW_STREET_LOCALITY_psv.psv', [
          'NSW',
          'VIC',
        ]),
      );
    });

    it('does not match a file for an uncovered state', () => {
      assert.equal(
        matchesCoveredStatePrefix('foo/VIC_ADDRESS_DETAIL_psv.psv', ['OT']),
        false,
      );
    });

    it('never matches when no states are covered', () => {
      assert.equal(
        matchesCoveredStatePrefix('foo/NSW_ADDRESS_DETAIL_psv.psv', []),
        false,
      );
    });
  });

  describe('hasNoCoveredDetailMatch (fail-loud throw signal, P034)', () => {
    const otFiles = ['G-NAF/Standard/OT_ADDRESS_DETAIL_psv.psv'];

    it('is false (no throw) when a covered state matches a detail file, even mis-cased', () => {
      // 'ot' is lowercase but the file is OT_ — the pre-uppercased covered
      // list makes the membership check succeed, so no throw.
      assert.equal(hasNoCoveredDetailMatch(otFiles, getCoveredStatesFor('ot')), false);
    });

    it('is true (throw) when a covered state matches zero detail files (typo/absent)', () => {
      assert.equal(
        hasNoCoveredDetailMatch(otFiles, getCoveredStatesFor('zz')),
        true,
      );
    });

    it('is false when COVERED_STATES is empty (full load, never throws)', () => {
      assert.equal(hasNoCoveredDetailMatch(otFiles, []), false);
    });

    it('is false when there are no detail files at all (nothing to load)', () => {
      assert.equal(hasNoCoveredDetailMatch([], getCoveredStatesFor('ot')), false);
    });
  });
});

// Helper: derive an uppercased covered-states list the way the loader does,
// so the throw-signal tests exercise the real getCoveredStates() normalisation.
function getCoveredStatesFor(value) {
  process.env.COVERED_STATES = value;
  return getCoveredStates();
}
