// P032: pin the exit-code discrimination in .github/workflows/perf-regression.yml.
//
// @jtbd JTBD-400 (Ship Releases Reliably From Trunk) — primary. This is that
//   job's own remedy pattern: a silent-coverage-erosion class guarded by a
//   regression test so it cannot come back unnoticed.
// @jtbd JTBD-001 (Search and Autocomplete) — the probe being pinned defends
//   that job's "results within 200 ms" outcome.
//
// The rationale here is NOT the one in release-workflow-deploy-only.test.mjs.
// That file pins an exact `if:` string because GitHub's expression evaluator
// reads that exact string and silently coerces operand types. This file pins a
// bash `run:` body, which has many semantically equivalent spellings — so it
// asserts on the STABLE TOKENS of the three-way branch, never on whole lines.
//
// Why it earns its keep: the failure mode is a silent regression of posture.
// The step shipped 2026-07-25 tolerating EVERY nonzero k6 exit at the step
// level, which made the job green even when the probe timed a 400 error path
// and measured nothing. A later "simplify the wrapper" that restores blanket
// tolerance looks harmless in review and silently re-disarms the nightly perf
// signal. These assertions fail if it does.
//
// Coverage caveat (accepted): `test:js` runs from the pre-commit hook, not from
// any workflow, so a `--no-verify` commit bypasses this pin.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = readFileSync(
  fileURLToPath(
    new URL('../../../.github/workflows/perf-regression.yml', import.meta.url),
  ),
  'utf8',
);

// The k6 probe step only: from its `- name:` to the start of the next step.
const k6Step = (() => {
  const start = raw.indexOf('      - name: Run perf regression probe');
  assert.notEqual(start, -1, 'could not locate the k6 probe step');
  const next = raw.indexOf('\n      - name: ', start + 1);
  return raw.slice(start, next === -1 ? undefined : next);
})();

// Hoisted so a DELETED arm fails on the index, not on a slice that silently
// counts backwards from the end (`slice(-1)` returns the last character, which
// is non-empty and would pass an emptiness check).
const advisoryIdx = k6Step.search(/^ *99\)/m);
const brokenIdx = k6Step.search(/^ *\*\)/m);

describe('perf-regression.yml — P032 k6 exit-code discrimination', () => {
  it('does not blanket-tolerate failure on the k6 step', () => {
    // Matched as a YAML key so the explanatory comments may name the setting.
    assert.doesNotMatch(k6Step, /^ *continue-on-error *:/m);
  });

  it('captures k6 exit status past the tee pipeline', () => {
    // GitHub runs `shell: bash` as `bash -eo pipefail`; a bare pipeline would
    // abort the script on 99 before any branch is reached.
    assert.match(k6Step, /^ *shell: bash$/m);
    assert.match(k6Step, /set \+e/);
    assert.match(k6Step, /rc=\$\{PIPESTATUS\[0\]\}/);
  });

  it('publishes the exit code before any branch can exit', () => {
    const published = k6Step.indexOf('k6_exit=$rc');
    const exits = k6Step.indexOf('exit 1');
    assert.notEqual(published, -1, 'k6_exit is never published to GITHUB_OUTPUT');
    assert.notEqual(exits, -1, 'no failing exit found — the loud branch is gone');
    assert.ok(
      published < exits,
      'k6_exit must be written to GITHUB_OUTPUT before `exit 1`, or the ' +
        'always() reporting step loses the diagnostic on a broken probe',
    );
  });

  it('orders the arms so the catch-all cannot swallow 99', () => {
    assert.notEqual(advisoryIdx, -1, 'no 99 (advisory) case arm found');
    assert.notEqual(brokenIdx, -1, 'no catch-all (broken probe) case arm found');
    assert.ok(advisoryIdx < brokenIdx, 'the catch-all arm must follow the 99 arm');
  });

  it('treats a threshold breach (99) as advisory — warns, does not fail', () => {
    const advisoryArm = k6Step.slice(advisoryIdx, brokenIdx);
    assert.match(advisoryArm, /::warning::/);
    assert.doesNotMatch(advisoryArm, /exit 1/);
  });

  it('fails loudly on any other nonzero exit — a broken probe', () => {
    const brokenArm = k6Step.slice(brokenIdx);
    assert.match(brokenArm, /::error::/);
    assert.match(brokenArm, /exit 1/);
  });

  it('keys the reporting step on the published exit code, not the step result', () => {
    // Under discrimination the step result is `success` for both a clean run
    // and an advisory breach, so it can no longer carry the signal.
    assert.match(raw, /steps\.k6\.outputs\.k6_exit/);
    assert.doesNotMatch(raw, /steps\.k6\.outcome/);
  });
});
