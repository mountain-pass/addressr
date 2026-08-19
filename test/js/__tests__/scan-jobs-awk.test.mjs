// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
// Fixture test for the watchers' default-deny job scan.
//
// WHY THIS EXISTS, and why it replaces source-inspection pins rather than
// joining them. P085 records five defects in `push:watch` reporting success on
// a red master, and then five more holes in the FIX — every one of them a hole
// about an exit code, and every one pinned only by an assertion that some text
// was written. The ticket names where that ends: an assertion matched the call
// `wait_for_completion || exit 1` while it was COMMENTED OUT, and passed. A pin
// proves a thing is written, not that it is reached or what it decides.
//
// P085's own conclusion: "each new assert.match closes one instance and is
// itself a new instance waiting to rot. Five defects in, that rate is the
// evidence." So the scan moved to `scripts/scan-jobs.awk`, where its whole
// contract is an exit code, and exit codes can be asserted against real input.
//
// This pins what the scan DECIDES, which is the part that was wrong five times.
// Whether the scripts LOAD it is still pinned as source text in
// release-workflow-deploy-only.test.mjs — and under the rule settled
// 2026-08-20 that pin stays in the illegitimate population rather than being
// discharged from it: pinning a connection is not an exemption, because the
// line can be present and never reached. Unconverted, not dead — a red there
// is a real signal, to be converted rather than deleted.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const SCAN = path.join(repoRoot, 'scripts', 'scan-jobs.awk');

/** Run the scan over a TSV fixture. Returns { code, named }. */
const scan = (rows) => {
  const input = rows.map(([conclusion, name]) => `${conclusion}\t${name}`).join('\n');
  const r = spawnSync('awk', ['-F\t', '-f', SCAN], { input: input ? `${input}\n` : '', encoding: 'utf8' });
  assert.equal(r.error, undefined, `awk failed to run: ${r.error?.message}`);
  return { code: r.status, named: r.stdout.trim() ? r.stdout.trim().split('\n') : [] };
};

const GREEN = 0;
const FAILED = 1;
const UNKNOWN = 2;

describe('scan-jobs.awk — the watchers\' default-deny verdict', () => {
  it('exists where both watchers load it from', () => {
    // A zero-match pass is impossible if the file is missing: awk would error
    // and every assertion below would fail. Asserted anyway so the reason is
    // legible rather than arriving as an awk usage message.
    assert.ok(existsSync(SCAN), `${SCAN} is missing — both watchers source their scan from it`);
  });

  it('passes a run whose jobs all succeeded or were skipped', () => {
    const { code, named } = scan([
      ['success', 'engine-floor'],
      ['success', 'build-and-test (2.19.5)'],
      ['success', 'build-and-test (3.5.0)'],
      ['success', 'release'],
      ['skipped', 'docker-publish'],
    ]);
    assert.equal(code, GREEN);
    assert.deepStrictEqual(named, []);
  });

  it('fails the real red run that started P085, and names both matrix legs', () => {
    // Run 30787856504: both legs failed, `push:watch` reported success. The
    // predecessor's selector was `name == "build-and-test"`, which matches
    // neither matrix-suffixed job, so it scanned nothing and said "successfully".
    const { code, named } = scan([
      ['failure', 'build-and-test (2.19.5)'],
      ['failure', 'build-and-test (3.5.0)'],
      ['skipped', 'release'],
      ['skipped', 'docker-publish'],
    ]);
    assert.equal(code, FAILED);
    assert.equal(named.length, 2);
    assert.ok(named.every((l) => l.includes('build-and-test')), named.join(' | '));
  });

  for (const conclusion of ['cancelled', 'timed_out', 'startup_failure', 'neutral', 'action_required']) {
    it(`fails a job that concluded ${conclusion}`, () => {
      // Every one of these reached the SUCCESS path under the predecessor,
      // which selected only `conclusion == "failure"`. `startup_failure` is not
      // hypothetical — release-pr-plan.yml concluded exactly that on 2026-08-19
      // and the run list rendered it as an ordinary failure.
      const { code, named } = scan([['success', 'engine-floor'], [conclusion, 'release']]);
      assert.equal(code, FAILED, `${conclusion} must not reach the success path`);
      assert.deepStrictEqual(named, [`${conclusion}\trelease`]);
    });
  }

  for (const pending of ['pending', 'queued', 'in_progress']) {
    it(`fails an unfinished job (${pending}) rather than passing it`, () => {
      // The direction matters and is deliberate. P085's fifth defect was a GREEN
      // run reported RED because the scan ran before the run finished. The fix
      // is a completion precondition in the callers — NOT softening this
      // predicate, which is the ticket's entire remediation. So an unfinished
      // job must still fail here; it is the caller's job never to ask yet.
      const { code } = scan([['success', 'engine-floor'], [pending, 'release']]);
      assert.equal(code, FAILED, `${pending} must not be treated as success`);
    });
  }

  it('ignores an advisory check-deps failure, by exact name', () => {
    // ADR-015 makes check-deps continue-on-error, so its conclusion carries no
    // verdict. It has failed on every run for weeks; treating it as a failure
    // would red every push and train the operator to ignore the watcher.
    const { code, named } = scan([['success', 'engine-floor'], ['failure', 'check-deps']]);
    assert.equal(code, GREEN);
    assert.deepStrictEqual(named, []);
  });

  it('does not extend the exemption to a job that merely contains "check-deps"', () => {
    // Exact-name, not substring: a future `check-deps-strict` must fail closed
    // rather than inheriting an exemption nobody granted it.
    const { code } = scan([['failure', 'check-deps-strict']]);
    assert.equal(code, FAILED);
  });

  it('reports UNKNOWN rather than success when it scanned nothing', () => {
    // The fourth defect, found by the risk scorer inside the fix: an empty jobs
    // array fed awk one blank line, matched no rule, and fell through to green.
    // A scan that learned nothing must not report success.
    const { code, named } = scan([]);
    assert.equal(code, UNKNOWN);
    assert.deepStrictEqual(named, []);
  });

  it('separates UNKNOWN from FAILED, so a caller can tell them apart', () => {
    // Distinct codes because the states are epistemically different: one is
    // "the run is bad", the other is "I could not find out". P085 requires the
    // timeout path to print UNKNOWN rather than a failure verdict.
    assert.notEqual(UNKNOWN, FAILED);
    assert.equal(scan([]).code, UNKNOWN);
    assert.equal(scan([['failure', 'release']]).code, FAILED);
  });
});
