// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// The version a deploy ships, and the four places it has to agree.
//
// P095, realised in production 2026-08-08 (run 31252424980): `deploy.sh` took
// `$npm_package_version` — the version in the job's working tree — and
// `changesets/action` had already bumped that tree to the next, unpublished
// version to author the release PR. Elastic Beanstalk ran `npm install` for a
// version that did not exist and failed on both instances.
//
// WHY THIS IS A FIXTURE TEST AND NOT A GREP. The sibling
// `release-workflow-deploy-only.test.mjs` records, in its own header, that its
// shell assertions are "STILL TEXT, deliberately... the right shape there is a
// fixture test over an extracted predicate". This is the second instance of
// that need, which is what justified building the harness rather than adding a
// third grep. Version resolution is extracted into `deploy/resolve-version.sh`
// so it can be RUN, with a stub `npm` on PATH standing in for the registry.
//
// THE ASSERTION THAT MATTERS MOST is the four-site agreement. The tfvar drives
// main.tf's S3 `key` and the EB application-version label; the manifest pins
// what EB installs; the zip filename is what main.tf's `source` reads. Resolve
// only some of them and terraform labels the environment v3.1.0 while the
// bundle installs 3.0.8 — and `aws_s3_object.elasticapp` declares no `etag`
// and no `source_hash`, so `terraform plan` cannot see the disagreement. That
// silent identity lie is worse than the loud failure P095 records, and a
// grep-based test cannot make this assertion at all.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const resolver = path.join(repoRoot, 'deploy', 'resolve-version.sh');

/** A directory containing a stub `npm` that behaves as instructed. */
const stubNpm = (body) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'addressr-npm-stub-'));
  const bin = path.join(dir, 'npm');
  writeFileSync(bin, `#!/bin/sh\n${body}\n`);
  chmodSync(bin, 0o755);
  return dir;
};

const runResolver = (npmBody, env = {}) => {
  const stub = stubNpm(npmBody);
  try {
    return {
      status: 0,
      stdout: execFileSync('sh', [resolver], {
        env: {
          PATH: `${stub}:${process.env.PATH}`,
          npm_package_name: '@mountainpass/addressr',
          npm_package_version: '3.1.0',
          ...env,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    return { status: error.status ?? 1, stdout: (error.stdout ?? '').trim() };
  }
};

describe('deploy version resolution (P095)', () => {
  it('takes the PUBLISHED version, not the workspace version, by default', () => {
    // The defect exactly: workspace is 3.1.0 (bumped by `changeset version`),
    // registry is 3.0.8. The deploy must ship what EB can install.
    const { status, stdout } = runResolver('echo 3.0.8');
    assert.equal(status, 0);
    assert.equal(stdout, '3.0.8');
  });

  it('takes the WORKSPACE version on the just-published path', () => {
    // release.yml sets this only when steps.changesets.outputs.published is
    // 'true'. There the workspace version IS the version just published,
    // correct by construction. A registry read on that path could return the
    // previous version — `npm view` is a CDN-served read of `latest` and
    // `npm publish` returning does not guarantee an edge read reflects it —
    // which would deploy the wrong version green and silent.
    const { status, stdout } = runResolver('echo 3.0.8', {
      ADDRESSR_DEPLOY_JUST_PUBLISHED: '1',
    });
    assert.equal(status, 0);
    assert.equal(stdout, '3.1.0');
  });

  it('does not consult the registry at all on the just-published path', () => {
    // Not merely "prefers the workspace value": it must not depend on the
    // registry being reachable or current at that moment.
    const { status, stdout } = runResolver('exit 7', {
      ADDRESSR_DEPLOY_JUST_PUBLISHED: '1',
    });
    assert.equal(status, 0);
    assert.equal(stdout, '3.1.0');
  });

  it('FAILS CLOSED when the registry read errors', () => {
    // deploy.sh is #!/bin/sh with no `set -e`; the old fail-closed behaviour
    // came from ${npm_package_version:?required} and must not be lost.
    const { status } = runResolver('exit 1');
    assert.notEqual(status, 0, 'a failed registry read must abort the deploy');
  });

  it('FAILS CLOSED when the registry returns nothing', () => {
    // The mode that matters most: an empty result silently pinning an empty
    // version would be worse than the defect being fixed.
    const { status, stdout } = runResolver('exit 0');
    assert.notEqual(
      status,
      0,
      'an empty registry result must abort the deploy',
    );
    assert.equal(stdout, '', 'nothing may be printed for a caller to consume');
  });

  it('asks for the `latest` dist-tag, not the highest version', () => {
    // `npm view <pkg> versions --json | last` would pick up a prerelease.
    // "What should production run" is the dist-tag.
    const { stdout } = runResolver('echo "ARGS:$*"');
    assert.match(stdout, /\bversion\b/);
    assert.doesNotMatch(stdout, /\bversions\b/);
    assert.match(stdout, /@mountainpass\/addressr/);
  });
});

describe('deploy.sh applies the resolved version at EVERY site (P095)', () => {
  // The four consumers must agree or the deploy lies about itself, and
  // terraform cannot detect it: aws_s3_object.elasticapp has no etag and no
  // source_hash, so a bundle whose contents disagree with its key produces no
  // plan diff. This runs deploy.sh far enough to write its artefacts, with a
  // stub npm and a stub terraform, and reads what it produced.
  // deploy.sh traps EXIT to delete its .auto.tfvars, so it cannot be read
  // afterwards. The stub `terraform` is the correct observation point: it runs
  // while the file exists, which is exactly when real terraform reads it. The
  // stub `zip` records its arguments the same way, capturing the filename
  // main.tf's `source` resolves.
  const runDeployScript = () => {
    const stub = mkdtempSync(path.join(tmpdir(), 'addressr-stub-'));
    const work = mkdtempSync(path.join(tmpdir(), 'addressr-deploy-'));
    const capture = path.join(work, 'capture');
    execFileSync('sh', ['-c', `mkdir -p "${capture}"`]);

    const write = (name, body) => {
      const bin = path.join(stub, name);
      writeFileSync(bin, `#!/bin/sh\n${body}\n`);
      chmodSync(bin, 0o755);
    };
    write('npm', 'case "$1" in view) echo 3.0.8 ;; *) exit 0 ;; esac');
    write(
      'terraform',
      `cat ./*.auto.tfvars > "${capture}/tfvars" 2>/dev/null; exit 0`,
    );
    write('zip', `printf '%s\\n' "$*" > "${capture}/zipargs"; exit 0`);

    execFileSync('sh', [
      '-c',
      `cp -R "${path.join(repoRoot, 'deploy')}" "${work}/deploy"`,
    ]);
    try {
      execFileSync('sh', [path.join(work, 'deploy', 'deploy.sh'), 'plan'], {
        env: {
          PATH: `${stub}:${process.env.PATH}`,
          npm_package_name: '@mountainpass/addressr',
          npm_package_version: '3.1.0',
          PLAN_ONLY: '1',
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
    } catch {
      // The script may exit non-zero once past the artefact-writing stage.
    }
    return { deployDir: path.join(work, 'deploy'), capture };
  };

  it('writes the SAME version into the tfvar, the manifest and the zip name', () => {
    const { deployDir, capture } = runDeployScript();

    const tfvars = readFileSync(path.join(capture, 'tfvars'), 'utf8');
    const zipArgs = readFileSync(path.join(capture, 'zipargs'), 'utf8');
    const manifest = JSON.parse(
      readFileSync(path.join(deployDir, 'deployment', 'package.json'), 'utf8'),
    );

    const RESOLVED = '3.0.8';
    const WORKSPACE = '3.1.0';
    const workspaceRe = new RegExp(WORKSPACE.replaceAll('.', String.raw`\.`));

    assert.match(
      tfvars,
      new RegExp(String.raw`elasticapp_version\s*=\s*"` + RESOLVED + '"'),
      'the tfvar drives the S3 key AND the EB version label',
    );
    assert.doesNotMatch(
      tfvars,
      workspaceRe,
      'the workspace version reaching the tfvar is the EB label lying about the bundle',
    );
    assert.equal(
      manifest.dependencies['@mountainpass/addressr'],
      RESOLVED,
      'the dependency pin is what EB runs `npm install` against',
    );
    assert.equal(
      manifest.version,
      RESOLVED,
      'the manifest version was previously unguarded and could drift from the pin',
    );
    assert.match(
      zipArgs,
      new RegExp('deployment-' + RESOLVED + String.raw`\.zip`),
      "the zip filename is what main.tf's `source` reads",
    );
    assert.doesNotMatch(zipArgs, workspaceRe);
  });
});
