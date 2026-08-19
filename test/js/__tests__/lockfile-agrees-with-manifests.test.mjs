// The lockfile's copy of every manifest must match that manifest on disk.
//
// WHY THIS EXISTS, and it is not hypothetical: commit 78253ee4 shipped a root
// `package.json` that no longer declared `license-checker` alongside a
// `package-lock.json` that still carried its node. `npm ci` therefore installed
// roughly twenty undeclared packages on every clean install, including in CI.
//
// The cause was ORDERING, not carelessness about the edit. The lockfile WAS
// reconciled with `npx npm@10 install --package-lock-only`, and that run was
// cited as verification — but it happened BEFORE the `license-checker` removal
// later in the same sequence. The check examined a real tree and reported
// honestly about it; the tree simply was not the one the commit contained by
// the time it landed. A verification vouches only for the state it ran against.
//
// It was dev-only, so nothing reached the published package. The visible cost
// came later and sideways: those extraneous packages surfaced as two phantom
// "production licence violations" while the replacement licence audit was being
// built, and were first blamed on local dirty state rather than on something
// already shipped.
//
// npm mirrors each workspace manifest's dependency blocks into the lockfile at
// `packages["<dir>"]`, so the disagreement is mechanically detectable. This is
// the check that would have caught it, and unlike re-running an install it
// costs nothing and cannot itself go stale — it reads the two files as they
// are at test time.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Every manifest npm mirrors into the lockfile: the root plus each workspace. */
const manifests = () => {
  const root = read(path.join(repoRoot, 'package.json'));
  const found = [{ key: '', manifest: root }];
  for (const glob of root.workspaces ?? []) {
    if (!glob.endsWith('/*')) continue;
    const dir = glob.slice(0, -2);
    const abs = path.join(repoRoot, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      const file = path.join(abs, entry, 'package.json');
      if (!existsSync(file)) continue;
      found.push({ key: `${dir}/${entry}`, manifest: read(file) });
    }
  }
  return found;
};

const BLOCKS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

describe('package-lock.json agrees with every manifest', () => {
  it('finds the root and every workspace manifest, so a zero-match pass is impossible', () => {
    const found = manifests();
    assert.ok(found.length > 1, `only ${found.length} manifest(s) found — the workspaces glob has rotted`);
    const lock = read(path.join(repoRoot, 'package-lock.json'));
    assert.ok(lock.packages, 'package-lock.json has no `packages` map — lockfileVersion may have changed');
  });

  it('mirrors each manifest exactly, so an edit without a lockfile refresh fails here', () => {
    const lock = read(path.join(repoRoot, 'package-lock.json'));
    const problems = [];
    for (const { key, manifest } of manifests()) {
      const node = lock.packages[key];
      if (!node) {
        problems.push(`${key || '(root)'}: no lockfile node — run \`npx npm@10 install --package-lock-only\``);
        continue;
      }
      for (const block of BLOCKS) {
        const declared = manifest[block] ?? {};
        const mirrored = node[block] ?? {};
        for (const [name, range] of Object.entries(declared)) {
          if (mirrored[name] === undefined) {
            problems.push(`${key || '(root)'}: ${block}."${name}" is declared but missing from the lockfile`);
          } else if (mirrored[name] !== range) {
            problems.push(
              `${key || '(root)'}: ${block}."${name}" is "${range}" in the manifest but "${mirrored[name]}" in the lockfile`,
            );
          }
        }
        for (const name of Object.keys(mirrored)) {
          if (declared[name] === undefined) {
            problems.push(
              `${key || '(root)'}: ${block}."${name}" is in the lockfile but NOT declared in the manifest — ` +
                '`npm ci` would install a package nothing asks for. This is the 78253ee4 shape.',
            );
          }
        }
      }
    }
    assert.deepStrictEqual(problems, [], `\n${problems.join('\n')}\n`);
  });
});
