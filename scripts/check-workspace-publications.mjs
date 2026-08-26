import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

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

const attempts = Number(process.env.PUBLICATION_CHECK_ATTEMPTS ?? 6);
const retryDelayMs = Number(process.env.PUBLICATION_CHECK_DELAY_MS ?? 10_000);

if (!Number.isSafeInteger(attempts) || attempts < 1) {
  throw new Error('PUBLICATION_CHECK_ATTEMPTS must be a positive integer');
}
if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) {
  throw new Error('PUBLICATION_CHECK_DELAY_MS must be a non-negative integer');
}

const publicWorkspaces = [];

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

  publicWorkspaces.push(manifest);
}

let pending = publicWorkspaces;
let mismatches = [];

for (let attempt = 1; attempt <= attempts && pending.length > 0; attempt += 1) {
  mismatches = [];

  for (const manifest of pending) {
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
      mismatches.push({ manifest, publishedVersion });
    } else {
      console.log(`${manifest.name}@${manifest.version} is published`);
    }
  }

  pending = mismatches.map(({ manifest }) => manifest);
  if (pending.length > 0 && attempt < attempts) await delay(retryDelayMs);
}

for (const { manifest, publishedVersion } of mismatches) {
  console.error(
    `::error::${manifest.name} is ${manifest.version} locally but npm reports ${publishedVersion ?? 'unavailable'}`,
  );
}

if (mismatches.length > 0) process.exitCode = 1;
