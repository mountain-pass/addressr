// Every artefact `deploy.sh` writes must be git-ignored.
//
// WHY THIS EXISTS, and it is not hypothetical. The deploy-artefact rules in
// .gitignore all carried a mid-pattern separator (`deploy/tfplan`), which
// anchors them to the .gitignore's own directory. When `deploy/` became
// `apps/addressr-deployment/` on 2026-08-10 the entire block silently stopped
// matching — no error, no diff, nothing to notice. Among the paths that lost
// coverage were `tfplan` and `tfplan.json`, which .gitignore's own comment
// describes as containing "every root variable value in CLEARTEXT, including
// TF_VAR_aws_secret_key, the ADR-024 proxy-auth secret and the Cloudflare
// token — `sensitive = true` flags them, it does not redact them. This repo is
// public."
//
// A directory move stripping secret protection with no signal is exactly the
// silent-green class this repo keeps meeting. The comment did not prevent it;
// this does.
//
// HONEST LIMIT, because overstating a control is how this repo has been bitten
// before. `ARTEFACTS` below is a HARDCODED LIST, not a derivation. What IS
// derived is the anti-vacuity guard: it asserts deploy.sh still writes tfplan
// and tfplan.json, so the list cannot go stale for the two cleartext-secret
// artefacts without this test failing. A NEW artefact added to deploy.sh is
// NOT detected here — add it to the list by hand.
//
// An earlier draft of this comment claimed the list was derived from the
// script. It was not, and the risk scorer caught it. That is the same
// credited-by-name-rather-than-by-configured-value move R003's curation
// withdrew for `create_before_destroy` and for a DeploymentPolicy named
// "Rolling"; a guard that misdescribes its own reach is worse than a smaller
// guard that does not.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const deployDir = 'apps/addressr-deployment';
const deploySh = readFileSync(`${repoRoot}${deployDir}/deploy.sh`, 'utf8');

// The artefacts deploy.sh creates in its own directory, and the derived worker
// bundle build:worker emits beside the worker source.
// EXTENDED 2026-08-10 with the move to apps/addressr-deployment. The list
// covered 4 paths while .gitignore carried 8 rules under the deploy directory,
// so half the block could be stripped by a move without this test noticing.
// `deployment/` is the one that mattered most: deploy.sh writes it on EVERY run
// (the `mkdir -p deployment` below is what this file's anti-vacuity check now
// pins), so losing its rule offers an operator the generated bundle directory
// for commit on their next `git status`, with no test red.
const ARTEFACTS = [
  `${deployDir}/tfplan`,
  `${deployDir}/tfplan.json`,
  `${deployDir}/.terraform`,
  `${deployDir}/cloudflare-worker/worker.bundled.js`,
  // The rule is `…/deployment/` WITH a trailing slash, so it matches
  // directories only and `git check-ignore` on the bare directory path reports
  // nothing when the directory is absent. Assert the generated manifest INSIDE
  // it — which is both what deploy.sh actually writes and what would be offered
  // for commit if the rule were stripped.
  `${deployDir}/deployment/package.json`,
  `${deployDir}/plan.out`,
  `${deployDir}/resolved_x`,
  `${deployDir}/task-definitions/addressr-server.json`,
];

describe('deploy artefacts are git-ignored (public repo, cleartext secrets)', () => {
  it('deploy.sh still writes the artefacts this test claims it does', () => {
    // Guards the derivation itself: if deploy.sh stops writing tfplan.json the
    // list above is stale, and a stale list passes vacuously.
    assert.match(
      deploySh,
      /terraform plan[^\n]*-out=tfplan/,
      'deploy.sh must still write tfplan — otherwise this test guards nothing',
    );
    assert.match(
      deploySh,
      /terraform show -json tfplan > tfplan\.json/,
      'deploy.sh must still write tfplan.json, the cleartext-secret artefact',
    );
    // Added with `deployment/` 2026-08-10. This one is written on EVERY run,
    // not only on a plan, so it is the artefact most likely to be offered for
    // commit if its ignore rule is ever stripped by a move.
    assert.match(
      deploySh,
      /mkdir -p deployment/,
      'deploy.sh must still create the deployment/ bundle directory',
    );
  });

  for (const artefact of ARTEFACTS) {
    it(`${artefact} is ignored`, () => {
      // `--no-index` so the answer is about the ignore RULES, not about whether
      // the path happens to be tracked or currently present.
      const ignored = (() => {
        try {
          execFileSync('git', ['check-ignore', '--no-index', '-q', artefact], {
            cwd: repoRoot,
            stdio: 'ignore',
          });
          return true;
        } catch {
          return false;
        }
      })();
      assert.ok(
        ignored,
        `${artefact} is NOT git-ignored. tfplan and tfplan.json carry every Terraform root variable in cleartext and this repo is public — see the comment above the rules in .gitignore.`,
      );
    });
  }
});
