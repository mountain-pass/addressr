// Regression test for Problem 011: lint-staged silently drops `.changeset/*.md`
// files from commits.
//
// Serves JTBD J7 ("Ship releases reliably from trunk") — a commit that stages
// a changeset file MUST retain that file in HEAD after the pre-commit hook runs.
// Motivated by commit ef66d39 where the P009 changeset was staged alongside
// code, vanished after lint-staged, and broke the release pipeline.
//
// Test harness choice: Node's built-in test runner (per ADR 020 precedent at
// test/mcp/smoke.test.mjs). No new toolchain.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

describe('Problem 011: pre-commit preserves staged .changeset/*.md', () => {
  let workDir;

  before(() => {
    workDir = mkdtempSync(join(tmpdir(), 'addressr-p011-'));

    // Re-use the real package.json + tool configs so the test exercises the
    // actual lint-staged pipeline, not a simulated one.
    for (const entry of [
      'package.json',
      'package-lock.json',
      'eslint.config.js',
      '.prettierrc',
    ]) {
      cpSync(join(repoRoot, entry), join(workDir, entry));
    }
    // Symlink node_modules to avoid a multi-GB copy.
    symlinkSync(join(repoRoot, 'node_modules'), join(workDir, 'node_modules'));

    sh('git', ['init', '-q', '-b', 'master'], { cwd: workDir });
    sh('git', ['config', 'user.email', 'test@example.com'], { cwd: workDir });
    sh('git', ['config', 'user.name', 'P011 Test'], { cwd: workDir });
    sh('git', ['config', 'commit.gpgsign', 'false'], { cwd: workDir });

    writeFileSync(join(workDir, 'seed.txt'), 'seed\n');
    // Seed a file we will later rename in the ef66d39-style scenario.
    mkdirSync(join(workDir, 'docs', 'problems'), { recursive: true });
    writeFileSync(
      join(workDir, 'docs', 'problems', '999-seed.open.md'),
      '# Problem 999\n\nSeed content.\n',
    );
    sh('git', ['add', '.'], { cwd: workDir });
    sh('git', ['commit', '-q', '-m', 'seed'], { cwd: workDir });
  });

  after(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  it('keeps a staged `.changeset/*.md` file in HEAD after lint-staged runs', () => {
    // Reproduces the ef66d39 fileset: a changeset, multiple markdown files,
    // a file rename (docs/problems/*.open.md -> *.known-error.md), a .feature
    // file that is NOT in lint-staged config, and a .js file.
    mkdirSync(join(workDir, '.changeset'), { recursive: true });
    writeFileSync(
      join(workDir, '.changeset', 'p011-repro.md'),
      '---\n"addressr": patch\n---\n\nRepro for P011.\n',
    );
    writeFileSync(
      join(workDir, 'touched.js'),
      "export const touched = 'P011 repro';\n",
    );
    writeFileSync(
      join(workDir, 'README.md'),
      '# Repro\n\nSome content.\n',
    );
    writeFileSync(
      join(workDir, 'docs', 'JOBS_TO_BE_DONE.md'),
      '# Jobs\n\nContent.\n',
    );
    // The rename: 999-seed.open.md -> 999-seed.known-error.md
    sh('git', [
      'mv',
      'docs/problems/999-seed.open.md',
      'docs/problems/999-seed.known-error.md',
    ], { cwd: workDir });
    // .feature file — not in lint-staged config, mirrors the P009 scenario
    mkdirSync(join(workDir, 'test', 'resources', 'features'), {
      recursive: true,
    });
    writeFileSync(
      join(workDir, 'test', 'resources', 'features', 'repro.feature'),
      'Feature: repro\n  Scenario: noop\n    Given nothing\n',
    );

    sh('git', [
      'add',
      '.changeset/p011-repro.md',
      'touched.js',
      'README.md',
      'docs/JOBS_TO_BE_DONE.md',
      'test/resources/features/repro.feature',
    ], { cwd: workDir });

    // Run the real lint-staged (the pre-commit gate). Then commit with
    // --no-verify since the hook already ran. If lint-staged silently drops
    // the changeset, it will be missing from HEAD.
    sh('npx', ['lint-staged'], { cwd: workDir });
    sh('git', ['commit', '-q', '-m', 'test: P011 repro', '--no-verify'], {
      cwd: workDir,
    });

    const stat = sh('git', ['show', '--stat', '--name-only', 'HEAD'], {
      cwd: workDir,
    });
    assert.match(
      stat,
      /\.changeset\/p011-repro\.md/,
      'Expected .changeset/p011-repro.md to be in HEAD; lint-staged dropped it.\n' +
        `git show output:\n${stat}`,
    );
  });
});
