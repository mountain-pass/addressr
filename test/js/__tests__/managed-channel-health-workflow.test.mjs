// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// Pins the managed-channel health workflow's exit-code path. This file exists
// because the shape it guards was WRITTEN WRONG on 2026-09-04, caught in review
// rather than by any test, and then removed again when the publisher it fed was
// reversed. The guard outlives the pipe deliberately: the next thing that wants
// the report will reach for a pipe again, and this is what stops that being
// silent.
//
//   run: node scripts/managed-channel-health.mjs | tee "$RUNNER_TEMP/report.txt"
//
// GitHub Actions' default shell on Linux is `bash -e {0}`, WITHOUT pipefail.
// Naming `shell: bash` is what selects `bash --noprofile --norc -eo pipefail`.
// Without it a pipeline exits with its LAST command's status, `tee` always
// exits 0, and the health script's `process.exitCode = 1` on a fault is
// discarded. The step reads as success, every step gated on
// `steps.health.outcome == 'failure'` is skipped, and the job goes green on a
// real fault with nothing published — silently, forever, until someone runs the
// synthetic failure exercise.
//
// The unit tests over the notifier cannot see this: they exercise pure
// functions and stay green while the pipeline that would call them never fires.
// This is the only place the property can live.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

const PATH = '.github/workflows/managed-channel-health.yml';
const raw = readFileSync(PATH, 'utf8');
const wf = load(raw);
const steps = wf?.jobs?.observe?.steps ?? [];
const HEALTH_SCRIPT = 'managed-channel-health.mjs';

describe('managed-channel health workflow preserves the fault signal', () => {
  it('finds the job and its steps, so a zero-match pass is impossible', () => {
    // A rename of the job or the workflow would otherwise make every assertion
    // below vacuous, which is the same silent-green class this file guards.
    assert.ok(steps.length >= 3, `expected the observe job to have steps, found ${steps.length}`);
    assert.ok(
      steps.some((s) => typeof s.run === 'string' && s.run.includes(HEALTH_SCRIPT)),
      `no step runs ${HEALTH_SCRIPT} — has it moved?`,
    );
  });

  it('runs any pipeline carrying the health exit code under pipefail', () => {
    // The exact defect. A pipe without an explicit bash shell discards the
    // script's exit code into tee's.
    for (const step of steps) {
      if (typeof step.run !== 'string' || !step.run.includes(HEALTH_SCRIPT)) continue;
      if (!step.run.includes('|')) continue;
      const guarded = step.shell === 'bash' || /set\s+-o\s+pipefail/.test(step.run);
      assert.ok(
        guarded,
        `the step piping ${HEALTH_SCRIPT} must set "shell: bash" or "set -o pipefail" — ` +
          `the Actions default shell has no pipefail, so tee's exit 0 would discard the fault signal`,
      );
    }
  });
});
