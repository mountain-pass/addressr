// The perf probe's validity check, fed fixtures.
//
// WHY. k6 exits 99 both when the probe got slower and when it measured
// nothing, so the exit code cannot route them — and the second case is the
// dangerous one, because a latency threshold PASSES on an empty sample set.
// p(95) of zero requests is 0s, which satisfies p(95)<1000. That is exactly
// how this probe's retrieve leg printed a tick for its whole life while
// throwing on every iteration: 21,860 measured iterations, 0 retrieve
// requests, 1 tick.
//
// The shapes below are k6 --summary-export output.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, REQUIRED_LEGS } from '../../../scripts/perf-validity.mjs';

const SCRIPT = fileURLToPath(new URL('../../../scripts/perf-validity.mjs', import.meta.url));

const summary = (search, retrieve) => ({
  metrics: {
    ...(search === undefined
      ? {}
      : { 'http_reqs{phase:main,name:search}': { count: search } }),
    ...(retrieve === undefined
      ? {}
      : { 'http_reqs{phase:main,name:retrieve}': { count: retrieve } }),
  },
});

/** Run the script over a throwaway summary file and return its exit code. */
const run = (contents) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'perfval-'));
  const file = path.join(dir, 'summary.json');
  writeFileSync(file, contents);
  const r = spawnSync('node', [SCRIPT, file], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('perf probe validity (P104)', () => {
  it('accepts a run that measured every leg', () => {
    const { code, out } = run(JSON.stringify(summary(21_860, 21_860)));
    assert.equal(code, 0);
    assert.match(out, /validity OK/);
  });

  it('rejects the P104 shape — searches measured, retrieves zero', () => {
    // The exact historical failure: the search leg ran, the retrieve leg threw
    // before issuing a request, and k6 still reported a pass.
    const { code, out } = run(JSON.stringify(summary(21_860, 0)));
    assert.equal(code, 1);
    assert.match(out, /measured NOTHING on: retrieve/);
  });

  it('rejects a leg that is ABSENT, not merely zero', () => {
    // A metric that never appears is how an empty sample set actually shows up
    // in the summary — k6 does not emit a zero-count series for a request it
    // never made. Treating absent as 0 is the whole point.
    const { code, out } = run(JSON.stringify(summary(21_860, undefined)));
    assert.equal(code, 1);
    assert.match(out, /retrieve/);
  });

  it('rejects an unreadable summary rather than assuming the probe was fine', () => {
    const { code, out } = run('not json at all');
    assert.equal(code, 1);
    assert.match(out, /could not be read/);
  });

  it('names every leg that measured nothing, not just the first', () => {
    const { empty, valid } = validate(summary(0, 0));
    assert.equal(valid, false);
    assert.deepEqual(empty, ['search', 'retrieve']);
  });

  it('checks both legs the probe claims to measure', () => {
    // A floor on the check itself: if REQUIRED_LEGS were emptied, validate()
    // would return valid for any input at all — a guard that cannot fail.
    assert.ok(REQUIRED_LEGS.length >= 2, 'both probe legs must be checked');
    assert.equal(validate({ metrics: {} }, []).valid, true, 'documents the empty-legs hazard');
  });
});
