// @jtbd JTBD-400
// @jtbd JTBD-401
//
// TWO JOBS, because this file enforces two unrelated properties. JTBD-400 owns
// the deploy behaviour: PLAN_ONLY never applies, a failed apply propagates, the
// resolved version reaches every site. JTBD-401 owns exactly one assertion —
// `leaves nothing un-ignored in the deployment directory` — whose harm model is
// credential exposure rather than release determinism: this repo is PUBLIC and
// `tfplan.json` carries the AWS secret key, the ADR-024 proxy-auth secret and
// the Cloudflare token in cleartext.
//
// The second annotation is ADDITIVE, and deliberately so. When JTBD-401 was
// created the JTBD gate was asked whether a credential guard traced to
// JTBD-400 and REJECTED it, on the ground that secret hygiene is not "releases
// stay deterministic". Consolidating these two markers back into one would
// silently re-make the trace that rejection exists to prevent, so the split is
// recorded here rather than left for a future reader to tidy away.
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
//   - `.terraform/environment` is written by the script inside the isolated
//     copy, so a developer's own workspace selection is never touched and
//     needs no save-and-restore.
//
// This is the `scripts/scan-jobs.awk` shape RFC-009 names: feed inputs, assert
// on what came back.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  readdirSync,
  existsSync,
  cpSync,
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

// deploy.sh RUNS IN AN ISOLATED COPY, never in the real tree. P123.
//
// It used to run in `apps/addressr-deployment` itself, and deploy.sh is
// destructive there by design: `rm -rf deployment` then `rm -f
// mountainpass-addressr-deployment-<version>.zip`, both at fixed paths. Under
// `node --test`, files run in parallel, and `deploy-version-resolution.test.mjs`
// builds its workspace with `cp -R` of that same directory. So one file was
// deleting artefacts while the other was copying them, and `cp` failed with
// `cannot stat …-3.3.2.zip` — the real version, which is how the collision was
// finally identified, because that test's own fixtures are 3.1.0.
//
// Measured before the fix: 0 failures in 12 isolated runs of the victim, 1 in 5
// full-suite runs, ~7% on CI. It skipped the release job when it fired.
//
// Isolation also stops this suite leaving build output in a source directory —
// three stale zips were sitting in the working tree when this was diagnosed.
const harness = {
  stubDir: '',
  work: '',
  deployDir: '',
  tfEnv: '',
  baseline: new Set(),
};

/** Every file under `dir`, as paths relative to it. */
const filesUnder = (dir, base = dir) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
};

/**
 * Copy the deployment directory into `dest`, TRACKED FILES ONLY.
 *
 * Not a recursive copy of the whole directory, and the difference is the point.
 * A recursive copy imports whatever the developer's last `npm run deploy:prod`
 * left lying there — `deployment/`, a version-named zip, `.terraform/` with its
 * provider binaries. Those are exactly the paths deploy.sh recreates, so they
 * would land in the pre-run baseline below and then be filtered out of the set
 * of files the script is judged to have produced. The ignore-coverage assertion
 * would examine nothing at all on any machine that had ever deployed, while
 * still reporting green.
 *
 * Inheriting `.terraform/environment` had a second effect: the workspace
 * assertion could read `prod` from a developer's own selection and pass without
 * deploy.sh having written anything.
 *
 * Bytes come from the WORKING TREE, not from `git show HEAD:`. This suite runs
 * at pre-commit, and the change it most needs to gate is the one not yet
 * committed; sourcing from HEAD would test the previous deploy.sh while
 * approving a commit that edits it.
 *
 * LIMIT, because a guard that misdescribes its reach is worse than a smaller
 * one: `git ls-files` reads the INDEX, but the CONTENT is read from the
 * worktree at those paths. So an uncommitted modification to a tracked file IS
 * exercised — the favourable half, and the one that matters most, since the
 * change this suite most needs to gate is an edit to deploy.sh itself. A
 * `git add`ed new file is in too. What is invisible is a new file that has not
 * been staged.
 *
 * `cpSync` per file rather than read-then-write, because it preserves mode.
 * deploy.sh execs `./resolve-version.sh`, so a 0644 copy fails at the first
 * step of every case.
 */
const copyTrackedInto = (dest) => {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: DEPLOY_DIR,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);

  // THE FLOOR ON THE CORPUS, distinct from the floor on the artefacts below.
  // Without it a wrong cwd yields an empty copy, deploy.sh dies somewhere
  // downstream, and the red names the symptom instead of this.
  //
  // It does NOT catch a cone-mode sparse checkout, and saying so is the point:
  // out-of-cone entries stay in the index marked skip-worktree, so `ls-files`
  // still lists them and this floor still passes. That case surfaces one loop
  // down at the existsSync throw instead — loud and naming the file, but with a
  // cause the message has to allow for.
  for (const required of ['deploy.sh', 'resolve-version.sh', 'main.tf']) {
    assert.ok(
      tracked.includes(required),
      `the tracked file list for the deployment directory does not contain ` +
        `${required}, so the isolated copy cannot build. ${tracked.length} ` +
        'paths were listed, so the listing is wrong rather than the directory ' +
        'empty. The likely cause is a RENAME: all three names are pinned by ' +
        'ratified decisions (main.tf by ADR-030, resolve-version.sh by ' +
        'ADR-045, deploy.sh by ADR-045 and ADR-047), so the repair is to ' +
        'amend the decision and then this list — not to loosen the floor.',
    );
  }

  // During a merge conflict `ls-files` emits an unmerged path once per stage,
  // so a path can appear two or three times here. The copy is an idempotent
  // overwrite, so that is harmless — noted so it is not rediscovered as a bug.
  for (const rel of tracked) {
    const source = path.join(DEPLOY_DIR, rel);
    if (!existsSync(source)) {
      // In the index, absent from the worktree. Name it rather than throw a
      // bare ENOENT from three frames down. Two causes, and the message must
      // not assume the first: the file was deleted without the deletion being
      // committed, OR this is a cone-mode sparse checkout where the entry is
      // present-but-skip-worktree.
      throw new Error(
        `${rel} is tracked but missing from the working tree, so the isolated ` +
          'copy would be incomplete. Either restore it (or commit the ' +
          'deletion), or — if this is a sparse checkout — widen the cone to ' +
          'include apps/addressr-deployment.',
      );
    }
    const target = path.join(dest, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target);
  }
};

const untrackedPaths = () =>
  execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', DEPLOY_DIR],
    { cwd: REPO, encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3));

/**
 * Of `repoRelative`, the subset git's ignore rules cover.
 *
 * `check-ignore` matches PATTERNS, so it answers for paths that do not exist in
 * the real tree — which is the whole point here: the artefacts were produced in
 * an isolated copy, and the question is whether the repo's rules WOULD cover
 * them if they appeared. Exit 1 means "none matched" and is not an error.
 *
 * `--no-index` matches the sibling in `deploy-artefact-ignores.test.mjs`, and
 * it makes the answer a property of the RULES rather than of the tree. A
 * tracked-only copy does make the artefact set disjoint from the index anyway,
 * so the flag changes no result today — but leaving it off would rest the
 * invariant on that disjointness silently, and the next person to alter the
 * copy would have no way to know they were load-bearing.
 */
const ignoredSubset = (repoRelative) => {
  if (repoRelative.length === 0) return new Set();
  try {
    return new Set(
      execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
        cwd: REPO,
        encoding: 'utf8',
        input: repoRelative.join('\n'),
      })
        .split('\n')
        .filter(Boolean),
    );
  } catch (error_) {
    // Exit 1 = nothing matched. Any other status is a real failure.
    if (error_.status === 1) return new Set();
    throw error_;
  }
};

before(() => {
  harness.stubDir = mkdtempSync(path.join(tmpdir(), 'tfstub-'));

  // Mirror the repo layout the scripts actually resolve against: deploy.sh and
  // resolve-version.sh read the published manifest by a script-relative path,
  // so a bare copy of the deployment directory is not enough.
  harness.work = mkdtempSync(path.join(tmpdir(), 'planonly-'));
  harness.deployDir = path.join(harness.work, 'apps', 'addressr-deployment');
  mkdirSync(path.join(harness.work, 'apps'), { recursive: true });
  mkdirSync(path.join(harness.work, 'packages', 'addressr'), {
    recursive: true,
  });
  copyTrackedInto(harness.deployDir);
  // The REAL manifest, not a fixture — this suite is about deploy.sh's control
  // flow, and a fake version would make the resolution it performs unrealistic.
  cpSync(
    path.join(REPO, 'packages', 'addressr', 'package.json'),
    path.join(harness.work, 'packages', 'addressr', 'package.json'),
  );
  harness.tfEnv = path.join(harness.deployDir, '.terraform/environment');
  // Everything present BEFORE deploy.sh runs. Anything appearing after this is
  // an artefact the script produced, which is what the ignore-coverage test
  // below asserts on.
  harness.baseline = new Set(filesUnder(harness.deployDir));
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
});

after(() => {
  rmSync(harness.stubDir, { recursive: true, force: true });
  rmSync(harness.work, { recursive: true, force: true });
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
      cwd: harness.deployDir,
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
    const stale = path.join(harness.deployDir, 'tfplan');
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
      readFileSync(harness.tfEnv, 'utf8').trim(),
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

  it('leaves nothing un-ignored in the deployment directory', () => {
    // This repo is PUBLIC and tfplan.json carries cleartext secrets. The floor
    // this replaces read deploy.sh and asserted the WRITES were still written —
    // which cannot tell a write that happens from a write that is merely coded.
    // Deriving the check from what is actually on disk closes that gap and
    // cannot go stale.
    //
    // THE MEASUREMENT THAT SHAPED THIS, and why its conclusion no longer holds.
    // Two earlier baseline-relative attempts were measured BLIND to the
    // `deployment/` ignore rule being stripped: that directory is durable, it
    // survives between runs, so it sat in any baseline this file could capture
    // and was filtered out as pre-existing. The conclusion drawn at the time —
    // that no pristine snapshot existed and the check therefore had to be
    // absolute — expired with the tracked-only copy. `.gitignore` guarantees
    // `deployment/` is never tracked, so it cannot enter this baseline at all.
    // The measurement stands; the rule it produced does not.
    //
    // What actually lands in `created` is `deployment/package.json`, not the
    // bare directory: the rule carries a trailing slash and so matches
    // directories, and the check runs over files. Same reasoning as the
    // sibling in `deploy-artefact-ignores.test.mjs`, recorded here so the two
    // do not drift apart.
    runDeploy({
      PLAN_ONLY: '1',
      TF_WORKSPACE: 'prod',
      npm_lifecycle_event: 'deploy:prod',
    });

    // ASSERTED ON THE ARTEFACTS DEPLOY.SH ACTUALLY PRODUCED, not on the real
    // directory's git status. P123 moved execution into an isolated copy, and
    // the original form — `git status` over apps/addressr-deployment — would
    // then pass having observed nothing, because nothing writes there any more.
    // A green that means "the script was never run here" reads identically to
    // one that means "every artefact is covered", which is the failure this
    // whole suite exists to avoid.
    //
    // So the question is asked directly: of the files deploy.sh created, would
    // the repo's ignore rules cover each one? `check-ignore` matches patterns,
    // so it answers for paths that exist only in the copy.
    const created = filesUnder(harness.deployDir).filter(
      (f) => !harness.baseline.has(f),
    );

    // THE FLOOR. Without it every assertion below is vacuous the day deploy.sh
    // stops producing anything, or the copy silently fails to build.
    assert.ok(
      created.length > 0,
      'deploy.sh produced no new files in the isolated copy, so the ' +
        'ignore-coverage assertion below would examine nothing. Either the ' +
        'copy did not build or the script no longer bundles.',
    );

    const repoRelative = created.map((f) =>
      path.posix.join('apps/addressr-deployment', f.split(path.sep).join('/')),
    );
    const covered = ignoredSubset(repoRelative);
    const leaked = repoRelative.filter((f) => !covered.has(f));
    assert.deepEqual(
      leaked,
      [],
      `deploy.sh produces files no ignore rule covers: ${leaked.join(', ')}. ` +
        'On a public repo each one is a commit offer. Either a rule was ' +
        'dropped or the script started writing somewhere new.',
    );

    // DO NOT DELETE THIS AS REDUNDANT. Once the copy became tracked-only, this
    // became the only surface in the file that observes the operator's ACTUAL
    // directory: everything above runs against a reconstruction. It no longer
    // catches deploy.sh, which is precisely why it looks removable — what it
    // catches is a stray left by hand, or by a tool that is not deploy.sh, in
    // the one place where an un-ignored file becomes a commit offer on a public
    // repo.
    const strays = untrackedPaths();
    assert.deepEqual(
      strays,
      [],
      `un-ignored files sitting in the deployment directory: ${strays.join(', ')}`,
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
