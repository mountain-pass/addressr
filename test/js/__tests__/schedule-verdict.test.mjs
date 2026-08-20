// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// The three-state verdict, and the freshness window the reporter reads it with.
//
// WHY THIS EXISTS. Before 2026-08-20 the staleness CLI had two outcomes and
// both of them lied in one direction. Verified against the tree that day, not
// reasoned about:
//
//   - with `gh` absent it printed NO `STALE` line at all — the unreadable
//     branch writes to stderr and `continue`s — so stdout carried only
//     "10 stale of 10". Anything grepping stdout for findings printed nothing,
//     and a wrapper that failed soft on that would have reported all-clear over
//     a check that read nothing.
//   - over an empty `.github/workflows` it printed "0 stale of 0" and exited
//     0. A clean bill of health over an empty corpus, which is the shape P106
//     and P103 already name.
//
// So `verdict()` exists to make "I could not determine this" a first-class
// outcome rather than a silence, and the floor exists so a collapsed corpus is
// LOUDER than a stale workflow rather than quieter.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verdict,
  WORKFLOW_FLOOR,
  MAX_AGE_DAYS,
  VERIFICATION_WINDOW_DAYS,
} from '../../../scripts/scheduled-workflow-staleness.mjs';

describe('scheduled-workflow verdict (P101 / ADR-051)', () => {
  it('reports clean only when the corpus is believable AND everything was read', () => {
    assert.equal(verdict({ total: 10, stale: 0, unverifiable: 0 }).code, 0);
  });

  it('reports stale when something was determined stale', () => {
    assert.equal(verdict({ total: 10, stale: 3, unverifiable: 0 }).code, 1);
  });

  it('reports unverifiable when any workflow could not be read', () => {
    // One unread workflow of ten. Conservative on purpose: never report
    // clean-ish when part of the corpus was not read at all.
    assert.equal(verdict({ total: 10, stale: 0, unverifiable: 1 }).code, 2);
  });

  it('ranks an unbelievable corpus ABOVE a stale workflow, not below it', () => {
    // A zero-length corpus is the failure that makes every other finding
    // meaningless, so it must not be reported as "0 stale, all good".
    assert.equal(verdict({ total: 0, stale: 0, unverifiable: 0 }).code, 2);
    // And the floor outranks a stale finding when both are true.
    assert.equal(verdict({ total: 2, stale: 2, unverifiable: 0 }).code, 2);
  });

  it('pins the floor BOUNDARY, because a floor stated in prose is off by one', () => {
    // "Floor 5" is ambiguous between >=5 and >5, and this repo has already been
    // bitten by exactly that ambiguity (the risk appetite "5 inclusive" vs a
    // scorer that said ">4"). The sibling guards disagree with each other —
    // scheduled-workflow-staleness.test.mjs uses `>= 5`, workflow-npm-scripts-
    // resolve.test.mjs uses `> 5`. So the boundary is asserted, not described.
    assert.equal(WORKFLOW_FLOOR, 5);
    assert.equal(verdict({ total: 5, stale: 0, unverifiable: 0 }).code, 0, '5 is believable');
    assert.equal(verdict({ total: 4, stale: 0, unverifiable: 0 }).code, 2, '4 is not');
  });

  it('says why, in words a reader can act on rather than a bare code', () => {
    assert.match(verdict({ total: 0, stale: 0, unverifiable: 0 }).why, /floor/i);
    assert.match(verdict({ total: 10, stale: 0, unverifiable: 2 }).why, /could not be read/i);
    assert.match(verdict({ total: 10, stale: 1, unverifiable: 0 }).why, /stale/i);
  });

  it('derives the verification window from the tightest cadence bound it defends', () => {
    // A free-standing 7 beside a 3-day bound silently doubles that bound: the
    // reporter prints from a stamp that may itself be N days old, so a daily
    // workflow could be stale for `daily + N` days before anything is said.
    // Deriving it means the additive latency can never exceed 2x the tightest
    // bound, and moving MAX_AGE_DAYS moves this with it.
    assert.equal(VERIFICATION_WINDOW_DAYS, Math.min(...Object.values(MAX_AGE_DAYS)));
    assert.equal(VERIFICATION_WINDOW_DAYS, 3);
  });
});
