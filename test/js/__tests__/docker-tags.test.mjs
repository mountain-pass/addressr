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
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const script = path.join(repoRoot, 'scripts/docker-tags.sh');

function tags({ cwd = repoRoot, env = {}, args = [] } = {}) {
  return execFileSync('sh', [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_package_version: '9.9.9', ...env },
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
      out.some((t) => /^mountainpass\/addressr:9\.9\.9-[0-9a-f]{7,}$/.test(t)),
      `expected an immutable sha tag, got ${JSON.stringify(out)}`,
    );
    assert.ok(out.includes('mountainpass/addressr:latest'));
    assert.ok(
      !out.includes('mountainpass/addressr:9.9.9'),
      'the bare semver tag must not be written without DOCKER_PUBLISH_SEMVER=1',
    );
  });

  it('adds the bare :<version> only under DOCKER_PUBLISH_SEMVER=1', () => {
    const out = tags({ env: { DOCKER_PUBLISH_SEMVER: '1' } });
    assert.ok(out.includes('mountainpass/addressr:9.9.9'));
    assert.ok(out.includes('mountainpass/addressr:latest'));
  });

  it('degrades to :latest outside a git checkout (npm tarball build)', () => {
    const out = tags({ cwd: nonGitDir() });
    assert.deepEqual(out, ['mountainpass/addressr:latest']);
  });

  it('prefixes each tag with -t under the -t flag, for docker build', () => {
    const out = tags({ args: ['-t'] });
    for (const line of out) {
      assert.match(line, /^-t mountainpass\/addressr:/);
    }
  });

  it('fails loudly when npm_package_version is absent', () => {
    assert.throws(() =>
      execFileSync('sh', [script], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, npm_package_version: '' },
      }),
    );
  });
});
