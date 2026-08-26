import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const packages = {
  'addressr-mcp': [
    'LICENSE',
    'README.md',
    'bin/addressr-mcp.mjs',
    'package.json',
    'src/server.mjs',
  ],
  'addressr-core': ['README.md', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.mjs', 'package.json'],
  'addressr-react': ['README.md', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.mjs', 'dist/style.css', 'package.json'],
  'addressr-svelte': ['README.md', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.mjs', 'dist/style.css', 'package.json'],
  'addressr-vue': ['README.md', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.mjs', 'dist/style.css', 'package.json'],
};

for (const [directory, expectedFiles] of Object.entries(packages)) {
  const path = `packages/${directory}`;
  const manifest = JSON.parse(readFileSync(`${path}/package.json`, 'utf8'));
  assert.equal(manifest.name, `@mountainpass/${directory}`);
  assert.equal(manifest.repository.directory, path);

  const [{ files }] = JSON.parse(execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--workspace', manifest.name],
    { encoding: 'utf8' },
  ));
  assert.deepEqual(files.map(({ path: file }) => file).sort(), expectedFiles.sort());

  const shippedText = JSON.stringify(manifest.scripts ?? {}) + expectedFiles
    .filter((file) => file !== 'package.json' && /\.(?:[cm]?js|d\.ts|json|ya?ml)$/.test(file))
    .map((file) => readFileSync(`${path}/${file}`, 'utf8'))
    .join('');
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    assert.ok(
      shippedText.includes(dependency),
      `${manifest.name} declares unused production dependency ${dependency}`,
    );
  }
}

const require = createRequire(import.meta.url);
for (const directory of Object.keys(packages).filter((name) => name !== 'addressr-mcp')) {
  await import(`../packages/${directory}/dist/index.mjs`);
  require(`../packages/${directory}/dist/index.cjs`);
}

console.log('workspace package contracts passed (5 tarballs, 4 ESM imports, 4 CommonJS imports)');
