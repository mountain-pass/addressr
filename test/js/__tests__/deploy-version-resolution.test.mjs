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
// bundle installs 3.0.8. That silent identity lie is worse than the loud
// failure P095 records, and a grep-based test cannot make this assertion at all.
//
// UNTIL 2026-08-09 terraform could not see the disagreement either:
// `aws_s3_object.elasticapp` declared no `etag` and no `source_hash`, so the
// key was the only thing compared. It now carries a `source_hash` over the
// manifest, so a bundle whose contents disagree with the version in its name
// produces a plan diff. The four-site agreement asserted here is still the
// primary guard — the hash detects that the INPUT changed, never that the
// artefact was built from that input — but it is no longer the only one.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * A throwaway tree holding a COPY of the resolver plus a fake published
 * manifest at the path the resolver actually reads.
 *
 * REWRITTEN 2026-08-10, and the reason is the whole point of this test.
 * It used to run the real `deploy/resolve-version.sh` while INJECTING
 * `npm_package_name` and `npm_package_version` into its environment — which
 * meant it supplied the very contract it was supposed to verify. When the
 * workspace split made npm export those variables from the PRIVATE root
 * manifest (`addressr-workspace`, no `version` at all), the resolver broke in
 * production and this test stayed green, because the fixture kept handing it
 * the values npm no longer would. The risk scorer caught it; the suite did not.
 *
 * So the fixture now provides a MANIFEST, not variables. The resolver reads it
 * the same way it reads the real one — script-relative — so the resolution
 * mechanism itself is under test rather than stubbed out.
 */
const fakeTree = (version = '3.1.0', name = '@mountainpass/addressr') => {
  const root = mkdtempSync(path.join(tmpdir(), 'addressr-resolve-'));
  mkdirSync(path.join(root, 'packages', 'deployment'), { recursive: true });
  mkdirSync(path.join(root, 'packages', 'addressr'), { recursive: true });
  writeFileSync(
    path.join(root, 'packages', 'addressr', 'package.json'),
    JSON.stringify({ name, version }),
  );
  const destination = path.join(root, 'packages', 'deployment', 'resolve-version.sh');
  writeFileSync(
    destination,
    readFileSync(
      path.join(repoRoot, 'packages', 'deployment', 'resolve-version.sh'),
      'utf8',
    ),
  );
  chmodSync(destination, 0o755);
  return destination;
};
const resolver = fakeTree();

/** A directory containing a stub `npm` that behaves as instructed. */
const stubNpm = (body) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'addressr-npm-stub-'));
  const bin = path.join(dir, 'npm');
  writeFileSync(bin, `#!/bin/sh\n${body}\n`);
  chmodSync(bin, 0o755);
  return dir;
};

const runResolver = (npmBody, environment = {}) => {
  const stub = stubNpm(npmBody);
  try {
    return {
      status: 0,
      stdout: execFileSync('sh', [resolver], {
        env: {
          PATH: `${stub}:${process.env.PATH}`,
          // Deliberately NOT set. npm no longer exports a usable name/version
          // at the workspace root, and the resolver must not depend on them.
          ...environment,
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
  // The four consumers must agree or the deploy lies about itself. Terraform is
  // content-aware as of 2026-08-09 (aws_s3_object.elasticapp carries a
  // source_hash over the manifest), so a bundle disagreeing with its key now
  // produces a plan diff — but that is a backstop, not this assertion's job:
  // the hash proves the input changed, not that all four sites agree. This runs deploy.sh far enough to write its artefacts, with a
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

    // The published manifest, at the path deploy.sh and resolve-version.sh
    // actually read (script-relative, one level up from deploy/). Before the
    // 2026-08-10 workspace split these two scripts took the package name and
    // version from `npm_package_*`, which this harness injected — so the
    // harness was supplying the contract instead of testing it, and the split
    // broke production while this suite stayed green. Providing a manifest
    // rather than variables is what makes the resolution mechanism itself the
    // thing under test.
    mkdirSync(path.join(work, 'packages', 'addressr'), { recursive: true });
    writeFileSync(
      path.join(work, 'packages', 'addressr', 'package.json'),
      JSON.stringify({ name: '@mountainpass/addressr', version: '3.1.0' }),
    );

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
    // The stub runs with cwd = deployment/, because deploy.sh cds in before
    // zipping. So `ls -A` here is literally the bundle's contents at the moment
    // it would be archived — the only point where that set is observable.
    write(
      'zip',
      String.raw`printf '%s\n' "$*" > "${capture}/zipargs"; ls -A > "${capture}/zipcontents"; exit 0`,
    );

    execFileSync('sh', [
      '-c',
      `mkdir -p "${work}/packages" && cp -R "${path.join(repoRoot, 'packages', 'deployment')}" "${work}/packages/deployment"`,
    ]);
    // Seed a stale artefact into the bundle directory. deploy.sh must clear it:
    // `zip` UPDATES an existing archive rather than replacing it, and the
    // source_hash is over the manifest going in, not the archive coming out, so
    // anything surviving here would ship invisibly under a correct-looking hash.
    execFileSync('sh', [
      '-c',
      `mkdir -p "${work}/packages/deployment/deployment" && echo stale > "${work}/packages/deployment/deployment/LEFTOVER"`,
    ]);
    try {
      execFileSync('sh', [path.join(work, 'packages', 'deployment', 'deploy.sh'), 'plan'], {
        env: {
          PATH: `${stub}:${process.env.PATH}`,
          // Deliberately NOT set — see the manifest written above.
          PLAN_ONLY: '1',
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
    } catch {
      // The script may exit non-zero once past the artefact-writing stage.
    }
    return {
      deployDir: path.join(work, 'packages', 'deployment'),
      capture,
    };
  };

  it('writes the SAME version into the tfvar, the manifest and the zip name', () => {
    const { deployDir, capture } = runDeployScript();

    const tfvars = readFileSync(path.join(capture, 'tfvars'), 'utf8');
    const zipArguments = readFileSync(path.join(capture, 'zipargs'), 'utf8');
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
      zipArguments,
      new RegExp('deployment-' + RESOLVED + String.raw`\.zip`),
      "the zip filename is what main.tf's `source` reads",
    );
    assert.doesNotMatch(zipArguments, workspaceRe);
  });

  it('bundles EXACTLY the manifest, which is what makes the source_hash honest', () => {
    // aws_s3_object.elasticapp hashes deploy/deployment/package.json, not the
    // zip — the zip carries mtimes and would diff on every run. That proxy is
    // only sound while the manifest IS the bundle. Add a Procfile, an
    // .ebextensions/ fragment or an .npmrc and content-awareness silently stops
    // covering them, while main.tf goes on claiming it does, in prose, at the
    // point of use.
    //
    // Also proves the rebuild-from-empty: LEFTOVER is seeded into the bundle
    // directory before the run, and zip UPDATES an archive rather than
    // replacing it, so without `rm -rf deployment` it would ship under a fresh,
    // correct-looking hash.
    const { capture } = runDeployScript();
    const contents = readFileSync(path.join(capture, 'zipcontents'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();

    assert.deepStrictEqual(
      contents,
      ['package.json'],
      `the deployment bundle must contain exactly package.json — source_hash is over that file alone, so anything else here ships uncovered. Found: ${contents.join(', ')}`,
    );
  });
});
