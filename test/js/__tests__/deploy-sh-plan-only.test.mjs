// @jtbd JTBD-400
//
// CONVERTED 2026-08-21 — RFC-009, the shell-predicate sub-shape. Six assertions
// in `terraform-plan-workflow.test.mjs` and three in `deploy-artefact-ignores`
// read `apps/addressr-deployment/deploy.sh` as TEXT and asserted it contains
// PLAN_ONLY handling, an exit-code branch, and a workspace guard. A text scan
// cannot tell a branch that exists from a branch that is reached — this ticket's
// whole subject, and the shape that let P117 hide behind a correct-looking
// predicate for months.
//
// RUNNING THE DEPLOY SCRIPT IS THE OBVIOUS HAZARD, and the standing rule is that
// terraform runs only from CI. This is safe by construction, not by care:
//
//   - `terraform` is SHADOWED by a stub earlier on PATH. Every invocation is
//     recorded and none reaches the real binary, which IS installed on a
//     developer machine (`/opt/homebrew/bin/terraform`).
//   - The stub is the assertion surface. "PLAN_ONLY never applies" is read off
//     the recorded call list, which is the actual behaviour rather than a
//     statement about the source.
//   - No AWS credentials are exercised: the script exits before any apply.
//   - `.terraform/environment` is written by the script and is gitignored; the
//     test restores it so a developer's workspace selection survives.
//
// This is the `scripts/scan-jobs.awk` shape RFC-009 names: feed inputs, assert
// on what came back.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const DEPLOY_DIR = path.join(REPO, 'apps/addressr-deployment');
const TF_ENV = path.join(DEPLOY_DIR, '.terraform/environment');

const harness = { stubDir: '', savedEnvironment: undefined };

before(() => {
  harness.stubDir = mkdtempSync(path.join(tmpdir(), 'tfstub-'));
  const stub = path.join(harness.stubDir, 'terraform');
  writeFileSync(
    stub,
    [
      '#!/bin/sh',
      'echo "$*" >> "$TF_CALLS"',
      'case "$1" in',
      '  plan) exit "${TF_PLAN_EXIT:-0}" ;;',
      '  apply) exit "${TF_APPLY_EXIT:-0}" ;;',
      '  *) exit 0 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(stub, 0o755);
  if (existsSync(TF_ENV))
    harness.savedEnvironment = readFileSync(TF_ENV, 'utf8');
});

after(() => {
  if (harness.savedEnvironment !== undefined)
    writeFileSync(TF_ENV, harness.savedEnvironment);
  rmSync(harness.stubDir, { recursive: true, force: true });
});

const runDeploy = (environment) => {
  const calls = path.join(
    harness.stubDir,
    `calls-${Math.random().toString(36).slice(2)}.txt`,
  );
  writeFileSync(calls, '');
  let status = 0;
  let output = '';
  try {
    output = execFileSync('sh', ['deploy.sh'], {
      cwd: DEPLOY_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: `${harness.stubDir}${path.delimiter}${process.env.PATH}`,
        TF_CALLS: calls,
        ...environment,
      },
    });
  } catch (error_) {
    status = error_.status ?? 1;
    output = `${error_.stdout ?? ''}${error_.stderr ?? ''}`;
  }
  return {
    status,
    output,
    calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean),
  };
};

const untracked = () =>
  execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', DEPLOY_DIR],
    { cwd: REPO, encoding: 'utf8' },
  );

describe('apps/addressr-deployment/deploy.sh — run, not read', () => {
  it('refuses PLAN_ONLY without an explicit workspace, before touching terraform', () => {
    const result = runDeploy({
      PLAN_ONLY: '1',
      TF_WORKSPACE: '',
      npm_lifecycle_event: 'deploy:plan',
    });

    assert.notEqual(result.status, 0, 'PLAN_ONLY with no workspace must fail');
    assert.match(
      result.output,
      /PLAN_ONLY requires an explicit TF_WORKSPACE/,
      'the refusal did not name what the operator must set',
    );
    // The point of the guard: without it the fallback derives "plan" and the
    // remote backend targets a workspace that does not exist, which yields a
    // full-create diff that reads like a real answer.
    assert.deepEqual(
      result.calls,
      [],
      `terraform was invoked despite the guard: ${result.calls.join(' | ')}`,
    );
  });

  it('PLAN_ONLY plans and NEVER applies', () => {
    // TF_PLAN_EXIT=2 is load-bearing, not decoration. Exit 2 is the ONLY plan
    // result that reaches the apply branch, so with the default exit 0 this
    // assertion passes even against a script with no PLAN_ONLY guard at all.
    // Measured: mutating the guard to be unreachable left the exit-0 form green.
    const result = runDeploy({
      PLAN_ONLY: '1',
      TF_WORKSPACE: 'prod',
      npm_lifecycle_event: 'deploy:prod',
      TF_PLAN_EXIT: '2',
    });

    assert.ok(
      result.calls.some((c) => c.startsWith('plan ')),
      `expected a terraform plan; calls were: ${result.calls.join(' | ')}`,
    );
    assert.ok(
      result.calls.every((c) => !c.startsWith('apply')),
      `PLAN_ONLY reached terraform apply — the single gated path is no longer single. Calls: ${result.calls.join(' | ')}`,
    );
  });

  it('treats a changes-present plan (exit 2) as success, not failure', () => {
    // exit 2 from `terraform plan -detailed-exitcode` means "there are changes",
    // which is the case this workflow exists to report. Failing the job on it
    // would skip the caller's assertion step, which is the real verdict.
    const result = runDeploy({
      PLAN_ONLY: '1',
      TF_WORKSPACE: 'prod',
      npm_lifecycle_event: 'deploy:prod',
      TF_PLAN_EXIT: '2',
    });
    assert.equal(
      result.status,
      0,
      'a plan reporting changes was treated as a failure; the job would stop before the step that reads the plan',
    );
  });

  it('clears a stale plan file before planning', () => {
    // A leftover tfplan from a previous run would be shown and applied as if it
    // were this run's plan. The stub never writes one, so a surviving sentinel
    // is proof the removal did not happen.
    const stale = path.join(DEPLOY_DIR, 'tfplan');
    writeFileSync(stale, 'STALE PLAN FROM A PREVIOUS RUN');
    try {
      runDeploy({
        PLAN_ONLY: '1',
        TF_WORKSPACE: 'prod',
        npm_lifecycle_event: 'deploy:prod',
      });
      assert.equal(existsSync(stale), false, 'the stale plan survived the run');
    } finally {
      rmSync(stale, { force: true });
    }
  });

  it('deploy:prod derives its workspace and DOES apply — the control for the case above', () => {
    // Without this, "PLAN_ONLY never applies" is satisfied by a script that
    // never applies under any conditions.
    const result = runDeploy({
      PLAN_ONLY: '',
      TF_WORKSPACE: '',
      npm_lifecycle_event: 'deploy:prod',
      TF_PLAN_EXIT: '2',
    });

    assert.equal(
      readFileSync(TF_ENV, 'utf8').trim(),
      'prod',
      'deploy:prod did not select the prod workspace',
    );
    assert.ok(
      result.calls.some((c) =>
        c.startsWith('apply -auto-approve -input=false'),
      ),
      `deploy:prod never reached apply; calls were: ${result.calls.join(' | ')}`,
    );
  });

  it('every artefact the run actually creates is git-ignored', () => {
    // This repo is PUBLIC and tfplan.json carries cleartext secrets. The floor
    // this replaces read deploy.sh and asserted the WRITES were still written —
    // which cannot tell a write that happens from a write that is merely coded.
    // Deriving the list from what the run leaves on disk closes that gap and
    // cannot go stale.
    assert.equal(
      untracked(),
      '',
      'the deployment directory was not clean before the run',
    );

    runDeploy({
      PLAN_ONLY: '1',
      TF_WORKSPACE: 'prod',
      npm_lifecycle_event: 'deploy:prod',
    });

    const leaked = untracked()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3));
    // `git status` already applies the ignore rules, so anything listed here is
    // a file the deploy would offer for commit on a public repo.
    assert.deepEqual(
      leaked,
      [],
      `deploy.sh left un-ignored artefacts behind: ${leaked.join(', ')}`,
    );
  });

  it('propagates a failed apply instead of reporting success', () => {
    // Measured gap: swallowing apply's exit code left every other assertion
    // here green while CI would read a broken deploy as a successful one.
    const result = runDeploy({
      PLAN_ONLY: '',
      TF_WORKSPACE: '',
      npm_lifecycle_event: 'deploy:prod',
      TF_PLAN_EXIT: '2',
      TF_APPLY_EXIT: '1',
    });
    assert.notEqual(
      result.status,
      0,
      'a failed terraform apply exited 0 — CI would record the deploy as successful',
    );
  });

  it('treats a genuine plan failure (exit 1) as failure', () => {
    // The control. Without it, "exit 2 is success" is satisfied by a script that
    // ignores the exit code entirely.
    const result = runDeploy({
      PLAN_ONLY: '1',
      TF_WORKSPACE: 'prod',
      npm_lifecycle_event: 'deploy:prod',
      TF_PLAN_EXIT: '1',
    });
    assert.notEqual(
      result.status,
      0,
      'a failed terraform plan was reported as success — the exit code is not being read at all',
    );
  });
});
