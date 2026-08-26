import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const effectsScript = path.join(repoRoot, 'scripts/release-effects.mjs');
const publicationScript = path.join(
  repoRoot,
  'scripts/check-workspace-publications.mjs',
);

const runEffects = (published, packages) =>
  spawnSync(
    process.execPath,
    [effectsScript, String(published), JSON.stringify(packages)],
    { encoding: 'utf8' },
  );

describe('release package effects', () => {
  it('arms API effects only when the API package was published', () => {
    assert.equal(
      runEffects(true, [
        { name: '@mountainpass/addressr', version: '3.3.2' },
      ]).stdout,
      'api-published=true\n',
    );
    assert.equal(
      runEffects(true, [
        { name: '@mountainpass/addressr-mcp', version: '1.0.5' },
      ]).stdout,
      'api-published=false\n',
    );
  });

  it('rejects a malformed published-package value', () => {
    const result = runEffects(false, {});
    assert.notEqual(result.status, 0);
  });

  it('rejects a global publish result with no package list', () => {
    const result = runEffects(true, []);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outputs disagree/);
  });

  it('accepts the no-publication state', () => {
    assert.equal(runEffects(false, []).stdout, 'api-published=false\n');
  });
});

const fixture = (publishedVersions) => {
  const root = mkdtempSync(path.join(tmpdir(), 'addressr-publications-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);

  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ workspaces: ['packages/*', 'apps/*'] }),
  );

  const workspaceManifests = Object.entries({
    'packages/api': {
      name: '@mountainpass/addressr',
      version: '3.3.2',
    },
    'packages/mcp': {
      name: '@mountainpass/addressr-mcp',
      version: '1.0.4',
    },
    'apps/website': {
      name: '@mountainpass/website',
      version: '1.0.0',
      private: true,
    },
  });

  for (const [directory, manifest] of workspaceManifests) {
    const manifestPath = path.join(root, directory, 'package.json');
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest));
  }

  const fakeNpm = path.join(bin, 'npm');
  writeFileSync(
    fakeNpm,
    `#!/usr/bin/env node
const versions = JSON.parse(process.env.FAKE_NPM_VERSIONS);
const version = versions[process.argv[3]];
if (!version) process.exit(1);
process.stdout.write(JSON.stringify(version));
`,
  );
  chmodSync(fakeNpm, 0o755);

  return spawnSync(process.execPath, [publicationScript], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_NPM_VERSIONS: JSON.stringify(publishedVersions),
      PATH: `${bin}:${process.env.PATH}`,
    },
  });
};

describe('public workspace publication verification', () => {
  it('passes only when every public workspace version matches npm', () => {
    const result = fixture({
      '@mountainpass/addressr': '3.3.2',
      '@mountainpass/addressr-mcp': '1.0.4',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /@mountainpass\/addressr-mcp@1\.0\.4/);
    assert.doesNotMatch(result.stdout, /@mountainpass\/website/);
  });

  it('fails loudly when one public workspace was not published', () => {
    const result = fixture({
      '@mountainpass/addressr': '3.3.2',
      '@mountainpass/addressr-mcp': '1.0.3',
    });
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /@mountainpass\/addressr-mcp is 1\.0\.4 locally but npm reports 1\.0\.3/,
    );
  });
});
