import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const workspacePatterns = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
).workspaces;

const manifests = workspacePatterns.flatMap((pattern) => {
  if (!pattern.endsWith('/*')) {
    throw new Error(`unsupported workspace pattern: ${pattern}`);
  }

  const parent = path.join(root, pattern.slice(0, -2));
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name, 'package.json'));
});

let hasFailed = false;

for (const manifestPath of manifests) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }

  if (manifest.private === true || !manifest.name || !manifest.version)
    continue;

  const result = spawnSync(
    'npm',
    ['view', manifest.name, 'version', '--json'],
    { encoding: 'utf8' },
  );

  let publishedVersion;
  try {
    publishedVersion = JSON.parse(result.stdout);
  } catch {
    publishedVersion = undefined;
  }

  if (result.status !== 0 || publishedVersion !== manifest.version) {
    console.error(
      `::error::${manifest.name} is ${manifest.version} locally but npm reports ${publishedVersion ?? 'unavailable'}`,
    );
    hasFailed = true;
    continue;
  }

  console.log(`${manifest.name}@${manifest.version} is published`);
}

if (hasFailed) process.exitCode = 1;
