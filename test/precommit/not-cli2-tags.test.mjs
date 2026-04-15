// Regression test for Problem 010 guardrail: every `@not-cli2` tag in a
// cucumber feature file must cite an open/known-error problem ticket.
//
// Serves JTBD J7 (Ship releases reliably from trunk) — specifically the
// job story "When a scenario is tagged to skip a test profile ... without
// a docs/problems/NNN- cross-reference ... I want the commit to fail".
//
// The script under test is scripts/check-not-cli2-tags.mjs. The test
// creates two temporary feature files — one compliant, one non-compliant —
// and asserts the script's exit code is 0 or 1 respectively.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const script = join(repoRoot, 'scripts', 'check-not-cli2-tags.mjs');

function runScript(cwd) {
  return spawnSync('node', [script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('Problem 010: @not-cli2 tag guardrail', () => {
  let workDir;

  before(() => {
    workDir = mkdtempSync(join(tmpdir(), 'addressr-p010-'));
    mkdirSync(join(workDir, 'test', 'resources', 'features'), {
      recursive: true,
    });
  });

  after(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  it('exits 0 when every @not-cli2 scenario cites a docs/problems/ ticket', () => {
    writeFileSync(
      join(workDir, 'test', 'resources', 'features', 'compliant.feature'),
      [
        'Feature: Compliant',
        '  # See docs/problems/010-cli2-cucumber-cannot-mutate-origin-env.open.md',
        '  @not-cli2',
        '  Scenario: env-mutating scenario',
        '    Given something',
        '',
      ].join('\n'),
    );

    const result = runScript(workDir);
    assert.equal(
      result.status,
      0,
      `Expected exit 0 for compliant fixture, got ${result.status}. stderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
    );
  });

  it('exits 0 when @not-cli2 appears alongside @not-cli (broader profile-specific skip)', () => {
    writeFileSync(
      join(workDir, 'test', 'resources', 'features', 'combined-tags.feature'),
      [
        'Feature: Combined',
        '  @not-nodejs @not-cli @not-cli2',
        '  Scenario: CORS-style scenario that only runs in the rest profile',
        '    Given something',
        '',
      ].join('\n'),
    );

    const result = runScript(workDir);
    assert.equal(
      result.status,
      0,
      `Expected exit 0 when @not-cli2 is paired with @not-cli. stderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
    );
  });

  it('exits 1 when a @not-cli2 scenario has no docs/problems/ reference', () => {
    writeFileSync(
      join(workDir, 'test', 'resources', 'features', 'naked.feature'),
      [
        'Feature: Naked',
        '  @not-cli2',
        '  Scenario: orphan env-mutating scenario',
        '    Given something',
        '',
      ].join('\n'),
    );

    const result = runScript(workDir);
    assert.equal(
      result.status,
      1,
      `Expected exit 1 for non-compliant fixture, got ${result.status}. stderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
    );
    assert.match(
      result.stdout + result.stderr,
      /naked\.feature/,
      'Expected script output to name the offending file',
    );
  });
});
