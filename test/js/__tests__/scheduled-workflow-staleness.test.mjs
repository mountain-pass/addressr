// The staleness check for scheduled workflows (P101).
//
// WHY IT EXISTS AT ALL. A failure notification cannot fire for a workflow that
// never runs, and nine of eleven scheduled workflows here run quarterly — so
// "stopped firing" has a blind window of months, and GitHub disables scheduled
// workflows after 60 days of repo inactivity, which a quiet quarter produces.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  cadenceOf,
  assess,
  scheduledWorkflows,
  lastScheduledRunFrom,
  MAX_AGE_DAYS,
} from '../../../scripts/scheduled-workflow-staleness.mjs';

const NOW = new Date('2026-08-19T12:00:00Z');

const dailyStaleAfter = (days) =>
  assess({
    workflow: 'd.yml',
    cron: '0 1 * * *',
    lastScheduledRun: new Date(NOW - days * 86_400_000).toISOString(),
    now: NOW,
  }).stale;

describe('scheduled-workflow staleness (P101)', () => {
  it('classifies the cadences this repo actually uses', () => {
    assert.equal(cadenceOf('23 01 21,28 2,5,8,11 *'), 'quarterly'); // update-*
    assert.equal(cadenceOf('30 14 * * *'), 'daily'); // perf-regression
    assert.equal(cadenceOf('15 02 * * *'), 'daily'); // gnaf-source-smoke
    assert.equal(cadenceOf('0 3 1 * *'), 'monthly');
    // Day-of-week must be READ, not discarded. An earlier version limited the
    // field split to four and dropped it, so this fell through to daily and
    // took the 3-day bound against a 7-day cadence — STALE four days out of
    // every seven, forever. gnaf-source-smoke.yml records weekly being weighed
    // and rejected, so it is a shape this repo could adopt tomorrow.
    assert.equal(cadenceOf('0 3 * * 1'), 'weekly');
    assert.equal(cadenceOf('0 3 * * MON'), 'weekly');
  });

  it('passes a quarterly workflow that is merely between runs', () => {
    // The live case on 2026-08-19: every update-* last fired 2026-05-28 and the
    // next is 2026-08-21. Healthy. A naive "older than 30 days" check would
    // have called all nine of them broken.
    const r = assess({
      workflow: 'update-ot.yml',
      cron: '23 01 21,28 2,5,8,11 *',
      lastScheduledRun: '2026-05-28T02:07:30Z',
      now: NOW,
    });
    assert.equal(r.stale, false, r.reason);
    assert.equal(r.cadence, 'quarterly');
  });

  it('flags a daily workflow that has missed several days', () => {
    const r = assess({
      workflow: 'gnaf-source-smoke.yml',
      cron: '15 02 * * *',
      lastScheduledRun: '2026-08-10T02:15:00Z',
      now: NOW,
    });
    assert.equal(r.stale, true);
    assert.match(r.reason, /over the 3d bound/);
  });

  it('flags a workflow that has NEVER had a scheduled run', () => {
    // Distinct from "ran and failed": a workflow whose schedule never fired at
    // all produces no failure to notify anyone about.
    const r = assess({
      workflow: 'never-fired.yml',
      cron: '0 4 * * *',
      lastScheduledRun: undefined,
      now: NOW,
    });
    assert.equal(r.stale, true);
    assert.match(r.reason, /never/i);
  });

  it('tolerates one missed firing and catches two', () => {
    // The bound is deliberately two intervals: one miss is a hiccup, two is a
    // pattern. A tighter bound flaps and a flapping alarm is how the real one
    // gets ignored — which is P101's own subject.
    assert.equal(dailyStaleAfter(2), false, 'one missed day must not alarm');
    assert.equal(dailyStaleAfter(5), true, 'several missed days must alarm');
  });

  it('fails CLOSED on an unreadable timestamp', () => {
    // `NaN > limit` is false, so without an explicit guard this reported
    // "within the bound" — a silent green, the one direction a staleness check
    // must never fail in.
    const r = assess({
      workflow: 'x.yml',
      cron: '0 1 * * *',
      lastScheduledRun: 'not-a-date',
      now: NOW,
    });
    assert.equal(r.stale, true);
    assert.match(r.reason, /unreadable/);
  });

  it('bounds each cadence to roughly two missed firings', () => {
    // The quarterly bound is derived from the ACTUAL firing pattern, not from
    // the quarter: `21,28 2,5,8,11` fires twice per quarter a week apart, so
    // the largest healthy gap is ~85 days and two misses is ~92. An earlier
    // value of 200 was flap-safe but encoded FOUR missed firings, ninety days
    // past the 60-day inactivity auto-disable it exists to catch.
    assert.ok(MAX_AGE_DAYS.quarterly > 85, 'must not flap on the healthy 85-day gap');
    // Stricter than 'not four': the third miss falls at age 177 in the worst
    // phase, so < 150 actually enforces alarming before the THIRD.
    assert.ok(MAX_AGE_DAYS.quarterly < 150, 'must alarm before the third missed firing');
    assert.ok(MAX_AGE_DAYS.daily > 1 && MAX_AGE_DAYS.daily < 7);
    assert.ok(MAX_AGE_DAYS.weekly > 7 && MAX_AGE_DAYS.weekly < 35);
  });

  it('finds every scheduled workflow in the real repo, cron included', () => {
    // A floor: an empty result would make every assertion above vacuous, which
    // is the failure mode this repo keeps finding in its own guards.
    const found = scheduledWorkflows('.github/workflows');
    assert.ok(found.length >= 5, `expected several scheduled workflows, found ${found.length}`);
    for (const w of found) {
      assert.ok(w.cron, `${w.workflow} declares schedule: but no cron was parsed`);
      // NOT `assert.ok(MAX_AGE_DAYS[cadenceOf(cron)])` — cadenceOf is total
      // over exactly MAX_AGE_DAYS's keys, so that can only ever detect a crash,
      // never a misclassification. Assert the classification against the cron's
      // own shape instead, which is an independent reading of the same input.
      const cadence = cadenceOf(w.cron);
      const fields = w.cron.trim().split(/\s+/, 5);
      const [dom, month, dow] = [fields[2], fields[3], fields[4]];
      let expected = 'daily';
      if (month !== '*') expected = 'quarterly';
      else if (dom !== '*') expected = 'monthly';
      else if (dow === undefined || dow === '*') expected = 'daily';
      else expected = 'weekly';
      assert.equal(cadence, expected, `${w.workflow}: ${w.cron} classified ${cadence}`);
    }
  });

  it('parses a cron separated from `schedule:` by comment lines', () => {
    // gnaf-source-smoke.yml puts four comment lines between the two. A scan
    // reading only the next line or two finds no cron and silently skips the
    // workflow — which is what my first shell pass over this did.
    const dir = mkdtempSync(path.join(tmpdir(), 'wf-'));
    mkdirSync(path.join(dir, 'workflows'), { recursive: true });
    const wf = path.join(dir, 'workflows');
    writeFileSync(
      path.join(wf, 'commented.yml'),
      ['on:', '  schedule:', '    # a comment', '    # and another', "    - cron: '15 02 * * *'"].join('\n'),
    );
    const found = scheduledWorkflows(wf);
    rmSync(dir, { recursive: true, force: true });
    assert.equal(found.length, 1);
    assert.equal(found[0].cron, '15 02 * * *');
  });

  it('ignores a manual dispatch newer than the last scheduled run', () => {
    // THE LIVE CASE, and the reason this filter is not left to the caller.
    // On 2026-08-19 update-ot's two newest runs were workflow_dispatch, over a
    // scheduled run 83 days older. Taking the newest run of any kind reports it
    // healthy while establishing nothing about whether the schedule still fires.
    const runs = [
      { event: 'workflow_dispatch', createdAt: '2026-08-19T06:13:29Z' },
      { event: 'workflow_dispatch', createdAt: '2026-07-11T05:38:08Z' },
      { event: 'schedule', createdAt: '2026-05-28T02:07:30Z' },
      { event: 'schedule', createdAt: '2026-05-21T02:07:53Z' },
    ];
    assert.equal(lastScheduledRunFrom(runs), '2026-05-28T02:07:30Z');
  });

  it('reports no scheduled run when every run was manual', () => {
    // A workflow dispatched by hand forever, whose schedule never fired, must
    // read as never-scheduled rather than as freshly run.
    assert.equal(
      lastScheduledRunFrom([{ event: 'workflow_dispatch', createdAt: '2026-08-19T06:13:29Z' }]),
      undefined,
    );
    assert.equal(lastScheduledRunFrom([]), undefined);
    assert.equal(lastScheduledRunFrom(), undefined);
  });

  it('ignores files with no schedule trigger', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wf-'));
    writeFileSync(path.join(dir, 'push-only.yml'), 'on:\n  push:\n    branches: [master]\n');
    const found = scheduledWorkflows(dir);
    rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(found, []);
  });
});
