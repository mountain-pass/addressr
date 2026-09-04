// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// The dependency-freshness check must be TIME-BOUNDED at both sites that run
// it. This is not belt-and-braces against a slow network; it is the difference
// between a signal nobody reads and a pipeline nobody can push to.
//
// Both existing mitigations act on an EXIT STATUS. The pre-push hook writes
// `npm run check-deps || echo …`, and the release job sets
// `continue-on-error: true`. Neither can act on a check that has not FINISHED,
// so an unbounded slow run walks straight through both and blocks anyway.
//
// The fault is VARIANCE, and CI has it both ways: five runs were measured to
// conclusion, and one earlier run was watched for 35 minutes and never observed
// to answer — the same span recorded below — and it is not among the five. Led
// with, rather than corrected into, because a reader who stops early should not
// leave with the cleaner claim. Across the five the step took 35s, 40s, 22m,
// 52m and 65m, concluding every time, so it does answer and what it lacks is a
// predictable time to answer. Note the
// SHAPE: two of the five finished inside a minute and the other three ran past
// twenty-two minutes, so the long tail is the common case rather than the rare
// one. Locally it ran past 35 minutes without answering, which is what made
// "hang" the obvious first reading, and why the case for a bound rests on the
// variance rather than on which word is right. A check whose time to answer
// ranges over two orders of magnitude cannot sit unbounded on a path that
// blocks pushes, and the bound is a deliberate trade rather than a pure win: on a slow
// run the vulnerability signal is lost. P133 records that nobody reads it.
//
// Observed 2026-09-04 (P133 Phase 2). Locally the process ran past 35 minutes
// with no output and had to be killed by hand; the push never reached the
// changeset guard, which is the only load-bearing statement in that hook. The
// same job then ran on in CI for the same span while every other job in the run
// had gone green, which held the run `in_progress` — and the push gate refuses
// a push while the latest master run is in flight, with no override. So one
// slow advisory blocks a push twice, by two independent routes, on a run that
// cannot settle because of the same job.
//
// A bound converts the overrun into the failure both designs already survive.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// Seconds of the job's budget that must remain for checkout, node setup and the
// dependency install before the bounded step even starts. Observed at 100s on
// run 33869609486; this is three times that, because a cold install is slower.
const SETUP_ALLOWANCE = 300;

const HOOK_PATH = '.husky/pre-push';
const WORKFLOW_PATH = '.github/workflows/release.yml';
const TOOL = 'dry-aged-deps';

const hook = readFileSync(HOOK_PATH, 'utf8');
const workflowRaw = readFileSync(WORKFLOW_PATH, 'utf8');
const workflow = load(workflowRaw);

/** The hook line that runs the check, whatever it is wrapped in. */
const hookInvocation = hook
  .split('\n')
  .find((line) => !line.trimStart().startsWith('#') && /check-deps|dry-aged-deps/.test(line));

const jobs = workflow?.jobs ?? {};
const checkDepsJobs = Object.entries(jobs).filter(([, job]) =>
  (job?.steps ?? []).some((step) => typeof step?.run === 'string' && step.run.includes(TOOL)),
);

describe('the dependency-freshness check is time-bounded at every site that runs it', () => {
  it('finds both sites, so a zero-match pass is impossible', () => {
    // Without this the file exits 0 over an empty corpus if the hook is
    // rewritten or the job is renamed — green over no coverage, which is the
    // same silent class the bound itself exists to remove.
    assert.ok(
      hookInvocation,
      `${HOOK_PATH} runs no dependency check at all — has it moved, or is the bound now unnecessary?`,
    );
    assert.equal(
      checkDepsJobs.length,
      1,
      `expected exactly one job in ${WORKFLOW_PATH} running ${TOOL}, found ${checkDepsJobs.length}`,
    );
  });

  it('bounds the pre-push invocation, since `|| echo` needs an exit status', () => {
    // `|| echo` acts on an exit status. An unfinished run has none. The bound is what
    // gives the hook's own non-blocking design something to act on.
    const bounded = /\b(timeout|gtimeout)\b|alarm\s+\d+/.test(hookInvocation);
    assert.ok(
      bounded,
      `${HOOK_PATH} runs the dependency check unbounded:\n  ${hookInvocation.trim()}\n` +
        `An unbounded run here blocks the push outright and never reaches the changeset guard below it.`,
    );
  });

  it('bounds the release job, since `continue-on-error` needs an exit status too', () => {
    const [name, job] = checkDepsJobs[0];
    assert.ok(
      Number.isInteger(job['timeout-minutes']),
      `job \`${name}\` in ${WORKFLOW_PATH} declares no integer \`timeout-minutes\`. ` +
        `Without one it inherits the 360-minute default, and an advisory job that cannot ` +
        `finish holds the whole run in flight — which the push gate then refuses to push over.`,
    );
    assert.ok(
      job['timeout-minutes'] <= 15,
      `job \`${name}\` allows ${job['timeout-minutes']} minutes. A freshness check that has not ` +
        `answered within 15 is in its long tail; a bound that generous does not unblock the run it is protecting.`,
    );
  });

  it('bounds the CI step itself, so the job times out into a failure and not a cancellation', () => {
    // `timeout-minutes` alone is the wrong instrument here, and the reason is
    // the conclusion it produces. A job killed by `timeout-minutes` reports
    // `cancelled`, and `push-and-watch.sh` reds on any run conclusion that is
    // not `success` — so a bound that only ever cancels could turn every run
    // amber and block the next push, which is worse than the overrun it replaces.
    //
    // A job that FAILS under `continue-on-error: true` is proven safe here:
    // P133 records 45 consecutive runs where this job concluded `failure` and
    // the release proceeded. So the inner bound must fire FIRST and exit
    // non-zero, leaving `timeout-minutes` as a backstop for the case where the
    // inner one does not fire at all.
    const [name, job] = checkDepsJobs[0];
    const step = job.steps.find((s) => typeof s?.run === 'string' && s.run.includes(TOOL));
    assert.match(
      step.run,
      /alarm\s+(\d+)|\b(timeout|gtimeout)\s+\d+/,
      `the ${TOOL} step in job \`${name}\` carries no inner bound:\n  ${step.run.trim()}`,
    );
    // The MARGIN, not just the ordering. `timeout-minutes` counts from JOB
    // start and includes checkout, node setup and `npm ci`; the step's alarm
    // counts from STEP start. So `inner < bound` looks ordered and is not: on
    // run 33869609486 a 9-minute alarm under a 10-minute job bound lost, because
    // setup took 100 seconds and the job timeout fired 27 seconds first. The job
    // concluded `cancelled`, which is the conclusion this whole arrangement
    // exists to avoid. Measured, not reasoned — the first version of this
    // assertion reasoned, and shipped.
    const inner = Number(/alarm\s+(\d+)/.exec(step.run)?.[1] ?? 0);
    const bound = job['timeout-minutes'] * 60;
    assert.ok(inner > 0, `no inner bound found in the ${TOOL} step`);
    assert.ok(
      bound - inner >= SETUP_ALLOWANCE,
      `the inner bound (${inner}s) leaves only ${bound - inner}s of the job's ${bound}s for setup, ` +
        `under the ${SETUP_ALLOWANCE}s allowance. The job timeout counts setup and the alarm does not, ` +
        `so too small a margin means the job cancels instead of failing — measured at 100s of setup, ` +
        `and a cold dependency install is slower.`,
    );
  });

  it('runs exactly what the package script declares, so the direct call cannot drift', () => {
    // The hook execs the binary rather than `npm run check-deps`, because
    // through npm the alarm reaches only npm and its `sh -c` grandchild is
    // reparented to init and keeps running. Measured 2026-09-04: an orphan was
    // still burning CPU 11 minutes after its bound fired, and every push would
    // leave another. Exec'd directly the alarm's target IS the node process.
    //
    // The cost of bypassing npm is drift: `package.json` could change the
    // script and the hook would go on running the old command, silently. This
    // is what stops that.
    const declared = pkg.scripts?.['check-deps'];
    assert.ok(declared, 'package.json declares no check-deps script — has it been renamed?');
    assert.ok(
      hookInvocation.includes(declared) ||
        hookInvocation.includes(declared.replace(TOOL, `node_modules/.bin/${TOOL}`)),
      `the hook runs a different command from the one package.json declares.\n` +
        `  package.json: ${declared}\n  hook: ${hookInvocation.trim()}`,
    );
  });

  it('keeps the failure survivable at both sites once bounded', () => {
    // The bound must convert an overrun into a SURVIVABLE failure, not a
    // blocking one. If a future edit drops `|| echo` or `continue-on-error`, a
    // timeout starts failing pushes and releases on an advisory check — worse
    // than the overrun, because it would look deliberate.
    assert.match(
      hookInvocation,
      /\|\|/,
      `${HOOK_PATH} must keep the check non-blocking: ${hookInvocation.trim()}`,
    );
    const [name, job] = checkDepsJobs[0];
    assert.equal(
      job['continue-on-error'],
      true,
      `job \`${name}\` must stay \`continue-on-error: true\`; a bound on a gating job would red the release.`,
    );
  });
});
