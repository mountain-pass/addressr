// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// Shared test support: which workflow carries the managed-channel health check.
//
// NOT a test file, and it lives outside `__tests__` deliberately. Two test
// files need this derivation — the one pinning the carrier's exit-code path and
// the one asserting the carrier is judged for liveness — and the first version
// of that sharing had the second IMPORT the first. That re-registers the
// imported file's `describe` block, so its cases ran twice in the tier: a
// single-suite file reported two suites, and the tier total rose by four when
// two cases had been added. A helper module has no suite to drag along.
//
// The `test:js` glob is `test/js/__tests__/*.test.mjs`, and `assert-test-files`
// floors that directory alone, so a module here is outside both and can neither
// be mistaken for a tier member that stopped running nor decrement the floor.
// Both importers fail at import time if it is renamed or deleted, which is the
// right direction for a zero-match hazard.
//
// `.mjs` rather than the `.js` its neighbours here use: those are CommonJS-era
// Cucumber support, and this is imported by the `.test.mjs` tier.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

export const HEALTH_SCRIPT = 'managed-channel-health.mjs';
export const WORKFLOW_DIR = '.github/workflows';

/**
 * The workflow that CARRIES the health check, derived from what it RUNS rather
 * than named by a path literal. A rename of the workflow file then follows the
 * derivation; a rename of the SCRIPT, or an invocation that stops being a
 * literal path in a `run:` step, produces zero matches and reds loudly. Loud is
 * the right direction for the second, and the message names both causes so a
 * reader who moved the call behind an `npm run` does not read it as a corpus
 * failure.
 *
 * Exactly one must match, and that is load-bearing rather than decorative: a
 * first-match read over a non-unique set would bind the liveness assertion to
 * one workflow while a second, actually-scheduled one lost its trigger unseen.
 * Mutation-proved 2026-09-19 by adding a second workflow that runs the script.
 */
export function healthCarrier() {
  const matches = readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .filter((file) =>
      readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8').includes(HEALTH_SCRIPT),
    );
  assert.equal(
    matches.length,
    1,
    `expected exactly one workflow to run ${HEALTH_SCRIPT}, found ${matches.length}` +
      ` (${matches.join(', ') || 'none'}). Either the script was renamed or moved, or its ` +
      'invocation is no longer a literal path in a `run:` step, or a second workflow now ' +
      'runs it and the carrier is ambiguous.',
  );
  return matches[0];
}
