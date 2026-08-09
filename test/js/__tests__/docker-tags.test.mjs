// Pins the Docker tag scheme from ADR-040.
//
// The invariant that matters to a self-hoster: a docker-only rebuild must never
// re-point the bare :<semver> tag they pinned. So the bare tag is written ONLY
// when DOCKER_PUBLISH_SEMVER=1 (a package release), while every build gets an
// immutable :<version>-<gitsha> plus a moving :latest.
//
// The no-git case is the ADR-039 driver: `npm run build:docker` must keep working
// for someone building from the npm tarball, who has no git checkout.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
/**
 * A throwaway tree holding a COPY of docker-tags.sh plus a fake published
 * manifest at the path the script actually reads (script-relative,
 * ../packages/addressr/package.json).
 *
 * REWRITTEN 2026-08-10. This harness used to inject `npm_package_version` into
 * the real script's environment — supplying the contract it was meant to
 * verify. The workspace split made npm export that variable from the PRIVATE
 * root manifest, which has no `version` at all, so `docker-tags.sh` broke and
 * with it the whole docker-publish job; this suite stayed green throughout.
 * Providing a MANIFEST rather than a variable puts the resolution itself under
 * test.
 */
const treeWith = (version) => {
  const root = mkdtempSync(path.join(tmpdir(), 'addressr-docker-tags-tree-'));
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  mkdirSync(path.join(root, 'packages', 'addressr'), { recursive: true });
  if (version !== null) {
    writeFileSync(
      path.join(root, 'packages', 'addressr', 'package.json'),
      JSON.stringify({ name: '@mountainpass/addressr', version }),
    );
  }
  const destination = path.join(root, 'scripts', 'docker-tags.sh');
  writeFileSync(
    destination,
    readFileSync(path.join(repoRoot, 'scripts/docker-tags.sh'), 'utf8'),
  );
  chmodSync(destination, 0o755);
  return destination;
};
const script = treeWith('9.9.9');

function tags({
  cwd = repoRoot,
  env: environment = {},
  args: arguments_ = [],
} = {}) {
  return execFileSync('sh', [script, ...arguments_], {
    cwd,
    encoding: 'utf8',
    // npm_package_version deliberately NOT injected — the version comes
    // from the manifest written by treeWith() above.
    env: { ...process.env, ...environment },
  })
    .trim()
    .split('\n')
    .filter(Boolean);
}

// A directory that is not a git checkout, standing in for an npm-tarball build.
function nonGitDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'addressr-docker-tags-'));
  writeFileSync(path.join(dir, '.keep'), '');
  return dir;
}

describe('docker-tags.sh — ADR-040 tag scheme', () => {
  it('writes :<version>-<gitsha> and :latest, but NOT the bare :<version>', () => {
    const out = tags();
    assert.ok(
      out.some((t) =>
        /^ghcr\.io\/mountain-pass\/addressr:9\.9\.9-[0-9a-f]{7,}$/.test(t),
      ),
      `expected an immutable sha tag, got ${JSON.stringify(out)}`,
    );
    assert.ok(out.includes('ghcr.io/mountain-pass/addressr:latest'));
    assert.ok(
      !out.includes('ghcr.io/mountain-pass/addressr:9.9.9'),
      'the bare semver tag must not be written without DOCKER_PUBLISH_SEMVER=1',
    );
  });

  it('adds the bare :<version> only under DOCKER_PUBLISH_SEMVER=1', () => {
    const out = tags({ env: { DOCKER_PUBLISH_SEMVER: '1' } });
    assert.ok(out.includes('ghcr.io/mountain-pass/addressr:9.9.9'));
    assert.ok(out.includes('ghcr.io/mountain-pass/addressr:latest'));
  });

  it('degrades to :latest outside a git checkout (npm tarball build)', () => {
    const out = tags({ cwd: nonGitDir() });
    assert.deepEqual(out, ['ghcr.io/mountain-pass/addressr:latest']);
  });

  it('prefixes each tag with -t under the -t flag, for docker build', () => {
    const out = tags({ args: ['-t'] });
    for (const line of out) {
      assert.match(line, /^-t ghcr\.io\/mountain-pass\/addressr:/);
    }
  });

  it('fails loudly when the published manifest cannot be read', () => {
    // RE-POINTED 2026-08-10. This asserted that an absent `npm_package_version`
    // aborts. The script no longer reads that variable — after the workspace
    // split it reads the published manifest — so the old form passed while
    // testing nothing the script does. The PROPERTY is unchanged and is what
    // matters: no resolvable version means no tags, loudly, rather than an
    // image tagged `:-<gitsha>` or `:latest` alone.
    const orphan = treeWith(null);
    assert.throws(() =>
      execFileSync('sh', [orphan], {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env },
      }),
    );
  });
});
