// The mutation helper is itself a verification instrument, so it is verified.
//
// WHY. Every failure this helper exists to catch was a check that could not
// fail — and the helper is a check. Trusting it because it printed CAUGHT would
// repeat the exact mistake: on 2026-08-19 a hand-rolled mutation loop reported
// all three of its mutations "caught" while the sed had matched nothing, so the
// loop was testing an unmutated file and proving nothing. That is why NO-OP is
// a distinct exit code here rather than a warning, and why it is asserted.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE = fileURLToPath(new URL('../../../scripts/mutate.sh', import.meta.url));

const CAUGHT = 0;
const BLIND = 1;
const NOOP = 2;

/**
 * Run mutate.sh against a throwaway file.
 *
 * The stand-in "test" must be a REAL predicate over the file, not a constant.
 * `false` cannot be used to mean "the guard caught it" any more: the helper now
 * runs the command on the UNMUTATED file first and refuses if it is already
 * red, so a constant-false stand-in reports ERROR rather than CAUGHT. That
 * refusal is the point — on a red tree every mutation would otherwise report
 * CAUGHT and the run would "prove" every guard works.
 */
const run = (contents, expr, cmd) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mutate-'));
  const target = path.join(dir, 'subject.txt');
  writeFileSync(target, contents);
  const r = spawnSync('bash', [MUTATE, target, expr, ...cmd(target)], { encoding: 'utf8' });
  const after = readFileSync(target, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, after };
};

// Green on the original, red once "keep" is mutated away — a guard that works.
const WATCHES = (target) => ['grep', '-q', 'keep', target];
// Green regardless of the file — a guard that does not watch anything.
const BLIND_CMD = () => ['true'];
// Green on the original file, and only returns `status` once the mutation has
// landed — the way to reach the classification on the MUTATED run, which the
// baseline run cannot vet.
const failsWith = (status) => (target) =>
  ['bash', '-c', `grep -q keep "$1" || exit ${status}`, '_', target];

describe('mutate.sh — the guard on guards', () => {
  it('reports CAUGHT when the test fails under the mutation', () => {
    const { code, out } = run('keep me\n', 's/keep/changed/', WATCHES);
    assert.equal(code, CAUGHT);
    assert.match(out, /^CAUGHT/m);
  });

  it('reports BLIND when the test still passes under the mutation', () => {
    // The finding that matters: the guard does not watch what you assumed.
    const { code, out } = run('keep me\n', 's/keep/changed/', BLIND_CMD);
    assert.equal(code, BLIND);
    assert.match(out, /^BLIND/m);
  });

  it('reports NO-OP when the expression changes nothing, and does NOT run the test', () => {
    // A mutation that did not apply is not a passing test, it is no test — and
    // it must be louder than a blind guard, not quieter. Note `testPasses` is
    // true here: if the helper ran the test anyway it would report CAUGHT/BLIND
    // instead, which is exactly the false reassurance this exit code prevents.
    const { code, out } = run('keep me\n', 's/absent-string/x/', BLIND_CMD);
    assert.equal(code, NOOP);
    assert.match(out, /^NO-OP/m);
    assert.doesNotMatch(out, /^(CAUGHT|BLIND)/m);
  });

  it('restores the file on every path', () => {
    for (const [expr, cmd] of [
      ['s/keep/changed/', WATCHES],
      ['s/keep/changed/', BLIND_CMD],
      ['s/absent-string/x/', BLIND_CMD],
    ]) {
      const { after } = run('keep me\n', expr, cmd);
      assert.equal(after, 'keep me\n', `mutation "${expr}" left the file modified`);
    }
  });

  it('refuses a test command that was already red before the mutation', () => {
    // The mirror of dirty-tree-green. On an already-failing tree every mutation
    // reports CAUGHT, so the run would vouch for every guard at once. `false` is
    // red on the unmutated file, so the helper must refuse before mutating.
    const { code, out, after } = run('keep me\n', 's/keep/changed/', () => ['false']);
    assert.equal(code, NOOP);
    assert.match(out, /already fails/);
    assert.doesNotMatch(out, /^(CAUGHT|BLIND)/m);
    assert.equal(after, 'keep me\n', 'refused before mutating, so the file is untouched');
  });

  it('refuses a test command it could not run at all', () => {
    // Exit 127 is a typo in the command, not a guard doing its job. This is
    // caught at the BASELINE run, before anything is mutated.
    const { code, out, after } = run('keep me\n', 's/keep/changed/', () => ['no-such-command-xyzzy']);
    assert.equal(code, NOOP);
    assert.match(out, /could not be run \(exit 127\)/);
    assert.doesNotMatch(out, /^(CAUGHT|BLIND)/m);
    assert.equal(after, 'keep me\n');
  });

  // The two below reach the classification on the MUTATED run, which the
  // baseline cannot vet: the command is green on the original file and only
  // returns the non-verdict status once the mutation lands. Mutation-testing
  // this helper is what showed these arms were unreachable in an earlier
  // version — the bogus-command test above was passing off the baseline path
  // and the mutated arm was never exercised at all.
  it('does not call an unrunnable command CAUGHT after mutating', () => {
    const { code, out } = run('keep me\n', 's/keep/changed/', failsWith(127));
    assert.equal(code, NOOP);
    assert.match(out, /could not be run \(exit 127\)/);
    assert.doesNotMatch(out, /^CAUGHT/m);
  });

  // Both signal statuses, not just one: mutation testing showed that covering
  // 130 alone left 143 free to be deleted without any test noticing.
  for (const status of [130, 143]) {
    it(`does not call a run killed with exit ${status} CAUGHT`, () => {
      const { code, out } = run('keep me\n', 's/keep/changed/', failsWith(status));
      assert.equal(code, NOOP);
      assert.match(out, new RegExp(String.raw`interrupted \(exit ${status}\)`));
      assert.doesNotMatch(out, /^CAUGHT/m);
    });
  }

  it('refuses when it cannot write the mutation, rather than testing the original', () => {
    // A read-only target: the mutation never lands, so running the test would
    // grade an UNMUTATED file. Reachable without fault injection, which is why
    // this is covered rather than annotated.
    const dir = mkdtempSync(path.join(tmpdir(), 'mutate-ro-'));
    const target = path.join(dir, 'subject.txt');
    writeFileSync(target, 'keep me\n');
    // uid-dependent: root bypasses the permission bit, so under a root test
    // environment the write succeeds and this assertion fails. It fails LOUD
    // (false red), never silently green, which is the acceptable direction.
    chmodSync(target, 0o444);
    const r = spawnSync('bash', [MUTATE, target, 's/keep/changed/', ...WATCHES(target)], {
      encoding: 'utf8',
    });
    const after = readFileSync(target, 'utf8');
    chmodSync(target, 0o644);
    rmSync(dir, { recursive: true, force: true });
    assert.equal(r.status, NOOP);
    assert.doesNotMatch(`${r.stdout}${r.stderr}`, /^(CAUGHT|BLIND)/m);
    assert.equal(after, 'keep me\n');
  });

  it('names the backup path, so a SIGKILL leaves something recoverable', () => {
    // No trap catches SIGKILL. An unnamed copy in the temp dir is unrecoverable
    // for anyone with uncommitted edits to the target.
    const { out } = run('keep me\n', 's/keep/changed/', WATCHES);
    assert.match(out, /backup: \S+/);
  });

  it('refuses a missing file rather than reporting a result about nothing', () => {
    const r = spawnSync('bash', [MUTATE, '/nonexistent/subject.txt', 's/a/b/', 'true'], {
      encoding: 'utf8',
    });
    assert.equal(r.status, NOOP);
    assert.match(r.stderr, /no such file/);
  });

  it('restores the file when interrupted by a real signal', async () => {
    // The 130/143 cases above simulate the STATUS. Only a delivered signal
    // exercises the trap, which is what the header claims restores the file
    // "on every exit path, including interrupt" — a claim that was previously
    // asserted and untested.
    const dir = mkdtempSync(path.join(tmpdir(), 'mutate-sig-'));
    const target = path.join(dir, 'subject.txt');
    writeFileSync(target, 'keep me\n');
    // Instant on the original, slow only once mutated. A plain `sleep` would
    // stall the BASELINE run instead, so the signal would land before anything
    // had been written and the test would pass without exercising the trap at
    // all — which is how the first version of this test passed.
    const child = spawn(
      'bash',
      [MUTATE, target, 's/keep/changed/', 'bash', '-c', 'grep -q keep "$1" || sleep 10', '_', target],
      // Own process group, so the signal reaches the sleeping grandchild too.
      // Signalling only the script leaves `sleep` holding the pipes open and
      // the test waits out the full sleep for no added coverage.
      { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
    );
    let out = '';
    child.stdout.on('data', (c) => {
      out += c;
    });
    child.stderr.on('data', (c) => {
      out += c;
    });
    // Wait for the mutation to be on disk before interrupting, so the trap has
    // something real to undo.
    await new Promise((resolve) => setTimeout(resolve, 400));
    process.kill(-child.pid, 'SIGINT');
    await new Promise((resolve) => child.on('close', resolve));
    const after = readFileSync(target, 'utf8');
    rmSync(dir, { recursive: true, force: true });
    assert.equal(after, 'keep me\n', 'the trap must restore the file');
    assert.doesNotMatch(out, /RESTORE FAILED/, 'restore must not run twice');
    // An interrupted run must not print a verdict. Note where that property
    // actually lives: mutation testing says NOT in the exiting INT/TERM traps
    // — deleting them, or reverting to the returning-handler form, leaves this
    // assertion passing. The signal reaches the test command too, which returns
    // 130, and not_a_verdict refuses to call that a verdict. So this pins the
    // classification arm, which is the mechanism that holds the property.
    // Exit status cannot discriminate either: bash's default SIGINT disposition
    // also terminates and still runs the EXIT trap.
    assert.doesNotMatch(out, /^(CAUGHT|BLIND)/m, 'an interrupted run must not report a verdict');
  });

  it('refuses incomplete arguments', () => {
    const r = spawnSync('bash', [MUTATE, 'only-one-arg'], { encoding: 'utf8' });
    assert.equal(r.status, NOOP);
    assert.match(r.stderr, /usage/);
  });
});
