// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// EVERY job reachable from the release workflow declares `timeout-minutes`. Not
// just the ones that have hung — the failure mode is a property of being
// unbounded rather than of any particular job's code.
//
// The mechanism, demonstrated twice on 2026-09-04. A job that hangs holds the
// whole RUN `in_progress`. The push gate then refuses the next push while the
// latest run on the default branch is in flight, with no override. So a single
// hung job blocks every subsequent push, on a run that cannot settle because of
// that job, whether or not the job gates anything. The advisory dependency
// check did it first; the release job did it on runs 33856486690 and
// 33862883579, sitting past an hour on its publish step AFTER it had already
// created the release pull request. Neither could fail; both could hang; both
// blocked the same thing. Unbounded, a hang runs to GitHub's 360-minute
// default: six hours of blocked pushes per incident.
//
// THREE properties, and the second and third exist because the first version of
// this file had both defects.
//
//   1. Every job carries a bound.
//   2. A job that calls a REUSABLE WORKFLOW must NOT carry one, and its callee
//      must. GitHub allows a caller job only name/uses/with/secrets/needs/if/
//      permissions/strategy/concurrency; `timeout-minutes` there is rejected at
//      parse. The first version added it to `docker-publish`, which would have
//      red the whole workflow, and this file went green because `js-yaml` reads
//      the key whether or not GitHub honours it. A bound that parses as YAML and
//      enforces nothing is worse than none — it reads as coverage.
//   3. The bound sits inside a per-job WINDOW. A single global ceiling was the
//      first version's other defect: its lower guard was `> 0`, so
//      `timeout-minutes: 1` on the release job passed while redding every
//      healthy run. Too low is as bad as too high, in the direction that trains
//      people to delete the bound.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

const ROOT = '.github/workflows/release.yml';

// [floor, ceiling] per job, in minutes. The FLOOR sits above the observed
// maximum for that job across the successful runs of 2026-09-03/04, so a bound
// that would red a healthy run cannot be committed. The CEILING is generous
// against the same figure, so a bound firing means something is wrong rather
// than something is slow. Observed maxima: build-and-test 12, engine-floor 8,
// workspace-packages 7, website-build 6, release 4 on a NON-publishing release.
// `release` gets the widest window because a publishing release also deploys,
// waits for the environment to stabilise and smoke-tests production, none of
// which appear in that figure.
const WINDOW = {
  // Deliberately the same 10 on both sides. `check-deps-is-time-bounded.test.mjs`
  // already binds this job from two directions — it requires the job bound at or
  // under 15, and requires the step's own `alarm` to fire strictly first — so a
  // looser window here would let a value pass this file and red that one. Two
  // files disagreeing about one number is how the looser one gets edited.
  'check-deps': [10, 10],
  'engine-floor': [15, 40],
  'website-build': [15, 40],
  'build-and-test': [25, 60],
  'workspace-packages': [15, 40],
  release: [30, 90],
  'build-and-smoke': [15, 60],
};

/** Every job reachable from `path`, following `uses:` into local workflows. */
function reachableJobs(path, seen = new Set()) {
  if (seen.has(path)) return [];
  seen.add(path);
  const workflow = load(readFileSync(path, 'utf8'));
  const out = [];
  for (const [name, job] of Object.entries(workflow?.jobs ?? {})) {
    const uses = typeof job?.uses === 'string' ? job.uses : null;
    out.push({ name, job, file: path, uses });
    if (uses?.startsWith('./')) out.push(...reachableJobs(uses.slice(2), seen));
  }
  return out;
}

const jobs = reachableJobs(ROOT);

describe('every job reachable from the release workflow is time-bounded', () => {
  it('finds jobs and follows at least one reusable workflow', () => {
    // Without the second assertion this file passes having never left
    // release.yml, which is exactly how the callee stayed unbounded.
    assert.ok(jobs.length >= 6, `expected at least 6 reachable jobs, found ${jobs.length}`);
    assert.ok(
      jobs.some((j) => j.file !== ROOT),
      'followed no `uses:` into a local workflow — has the reusable call moved?',
    );
  });

  for (const { name, job, file, uses } of jobs) {
    it(`${name} (${file}) is bounded in the right place`, () => {
      if (uses) {
        assert.equal(
          job['timeout-minutes'],
          undefined,
          `job \`${name}\` calls a reusable workflow and declares \`timeout-minutes\`. ` +
            `GitHub rejects that key on a caller job at parse, so this would red the whole ` +
            `workflow. Put the bound on the called workflow's own job instead.`,
        );
        return;
      }
      const bound = job['timeout-minutes'];
      assert.ok(
        Number.isInteger(bound),
        `job \`${name}\` in ${file} declares no \`timeout-minutes\`, so it inherits the ` +
          `360-minute default. A hang there holds the run in flight, and the push gate ` +
          `refuses to push over a run in flight.`,
      );
      const window = WINDOW[name];
      assert.ok(window, `job \`${name}\` has no declared window — add one to WINDOW with its observed maximum`);
      const [floor, ceiling] = window;
      assert.ok(
        bound >= floor,
        `job \`${name}\` allows only ${bound} minutes, below the ${floor} floor. ` +
          `A bound that fires on a healthy run is the kind people delete.`,
      );
      assert.ok(
        bound <= ceiling,
        `job \`${name}\` allows ${bound} minutes, over the ${ceiling} ceiling. ` +
          `That is the 360-minute default wearing a number.`,
      );
    });
  }
});
