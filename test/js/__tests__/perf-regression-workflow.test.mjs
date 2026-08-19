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
// Coverage note: `test:js` runs from the pre-commit hook AND, since 2026-08-02,
// as the "Workflow and unit pins" step in release.yml's build-and-test job. The
// caveat this block previously recorded — hook-only, so `--no-verify` bypasses
// it — no longer holds.

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
const advisoryIndex = k6Step.search(/^ *99\)/m);
const brokenIndex = k6Step.search(/^ *\*\)/m);

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
    assert.notEqual(
      published,
      -1,
      'k6_exit is never published to GITHUB_OUTPUT',
    );
    assert.notEqual(
      exits,
      -1,
      'no failing exit found — the loud branch is gone',
    );
    assert.ok(
      published < exits,
      'k6_exit must be written to GITHUB_OUTPUT before `exit 1`, or the ' +
        'always() reporting step loses the diagnostic on a broken probe',
    );
  });

  it('orders the arms so the catch-all cannot swallow 99', () => {
    assert.notEqual(advisoryIndex, -1, 'no 99 (advisory) case arm found');
    assert.notEqual(
      brokenIndex,
      -1,
      'no catch-all (broken probe) case arm found',
    );
    assert.ok(
      advisoryIndex < brokenIndex,
      'the catch-all arm must follow the 99 arm',
    );
  });

  it('treats a threshold breach (99) as advisory ONLY when the probe measured something', () => {
    // The contract sharpened on 2026-08-19, closing P032's named residual that
    // "content-based routing of the wrong-measurement class" was unresolved.
    //
    // k6 exits 99 both for "got slower" and for "measured nothing", so the
    // exit code alone cannot route them — and conflating them is not a
    // rounding error. A latency threshold PASSES on an empty sample set: p(95)
    // of zero requests is 0s, which satisfies p(95)<1000. So the second case
    // is a broken instrument reporting a tick against a metric it never
    // gathered, and it must be as loud as a probe that failed to start.
    //
    // The arm is therefore allowed to exit 1 — but only behind the validity
    // check, never unconditionally.
    const advisoryArm = k6Step.slice(advisoryIndex, brokenIndex);
    assert.match(advisoryArm, /::warning::/, 'a valid breach must still warn');
    assert.match(
      advisoryArm,
      /perf-validity\.mjs/,
      'the breach arm must consult the validity check before choosing a verdict',
    );
    // The warning must not be reachable without the check having passed.
    const warnIndex = advisoryArm.indexOf('::warning::');
    const checkIndex = advisoryArm.indexOf('perf-validity.mjs');
    assert.ok(
      checkIndex < warnIndex,
      'the validity check must run BEFORE the advisory warning is emitted',
    );
  });

  it('checks validity on the clean path too, so "passed every threshold" is earned', () => {
    // Today a zero-sample leg cannot reach exit 0, because a count threshold
    // catches it first. That makes this branch's safety a property of a
    // threshold in another file — and "passed every threshold" is the most
    // believed line the probe emits, so it is the one that most needs earning.
    const cleanArm = k6Step.slice(k6Step.indexOf('            0)'), advisoryIndex);
    assert.match(cleanArm, /perf-validity\.mjs/);
    assert.match(cleanArm, /exit 1/, 'a clean run that measured nothing must fail');
  });

  it('fails loudly on any other nonzero exit — a broken probe', () => {
    const brokenArm = k6Step.slice(brokenIndex);
    assert.match(brokenArm, /::error::/);
    assert.match(brokenArm, /exit 1/);
  });

  it('pins the k6 version, so an unpin is loud rather than silent', () => {
    // The probe exports its summary with the deprecated --summary-export. An
    // unpinned action installs latest, so the release that drops the flag
    // would red the nightly unannounced — and per P101 a red scheduled run
    // reaches no reader. Without this assertion a later "unpin to pick up
    // fixes" reverts that protection with a green suite.
    assert.match(raw, /k6-version:\s*'[^']+'/, 'the setup-k6 step must pin a version');
  });

  it('keys the reporting step on the published exit code, not the step result', () => {
    // Under discrimination the step result is `success` for both a clean run
    // and an advisory breach, so it can no longer carry the signal.
    assert.match(raw, /steps\.k6\.outputs\.k6_exit/);
    assert.doesNotMatch(raw, /steps\.k6\.outcome/);
  });
});
