// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// The dependency-freshness check must be TIME-BOUNDED at both sites that run
// it. This is not belt-and-braces against a slow network; it is the difference
// between a signal nobody reads and a pipeline nobody can push to.
//
// Both existing mitigations act on an EXIT STATUS. The pre-push hook writes
// `npm run check-deps || echo …`, and the release job sets
// `continue-on-error: true`. A hang produces no exit status, so it walks
// straight through both and blocks anyway.
//
// Observed 2026-09-04 (P133 Phase 2). Locally the process ran past 35 minutes
// with no output and had to be killed by hand; the push never reached the
// changeset guard, which is the only load-bearing statement in that hook. The
// same job then hung in CI for the same span while every other job in the run
// had gone green, which held the run `in_progress` — and the push gate refuses
// a push while the latest master run is in flight, with no override. So one
// hung advisory blocks a push twice, by two independent routes, on a run that
// cannot settle because of the same job.
//
// A bound converts the hang into the failure both designs already survive.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

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

  it('bounds the pre-push invocation, since `|| echo` cannot survive a hang', () => {
    // `|| echo` acts on an exit status. A hang has none. The bound is what
    // gives the hook's own non-blocking design something to act on.
    const bounded = /\b(timeout|gtimeout)\b|alarm\s+\d+/.test(hookInvocation);
    assert.ok(
      bounded,
      `${HOOK_PATH} runs the dependency check unbounded:\n  ${hookInvocation.trim()}\n` +
        `A hang here blocks the push outright and never reaches the changeset guard below it.`,
    );
  });

  it('bounds the release job, since `continue-on-error` cannot survive a hang either', () => {
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
        `answered within 15 has hung; a bound that generous does not unblock the run it is protecting.`,
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
    // The bound must convert a hang into a SURVIVABLE failure, not a blocking
    // one. If a future edit drops `|| echo` or `continue-on-error`, a timeout
    // starts failing pushes and releases on an advisory check — worse than the
    // hang, because it would look deliberate.
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
