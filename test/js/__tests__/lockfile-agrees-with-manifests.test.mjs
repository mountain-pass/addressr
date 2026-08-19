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
    // EXACT-PATH ENTRIES ARE NOT SKIPPED. An earlier version did
    // `if (!glob.endsWith('/*')) continue;`, so `"workspaces": ["tools/foo"]`
    // was dropped without a word and the anti-vacuity floor below could not see
    // it — root plus one workspace clears `> 1` regardless. That is the
    // silent-partial-corpus shape this repo keeps hitting, inside a guard.
    if (glob.endsWith('/*')) {
      const dir = glob.slice(0, -2);
      const abs = path.join(repoRoot, dir);
      if (!existsSync(abs)) continue;
      for (const entry of readdirSync(abs)) {
        const file = path.join(abs, entry, 'package.json');
        if (!existsSync(file)) continue;
        found.push({ key: `${dir}/${entry}`, manifest: read(file) });
      }
      continue;
    }
    const file = path.join(repoRoot, glob, 'package.json');
    if (existsSync(file)) found.push({ key: glob, manifest: read(file) });
  }
  return found;
};

const BLOCKS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/**
 * Names of the workspace packages themselves.
 *
 * WHY THESE ARE EXEMPT FROM THE RANGE CHECK, and it is not a convenience.
 * `changesets version` bumps a workspace package's version and rewrites every
 * sibling manifest that depends on it (`updateInternalDependencies: "patch"`),
 * but it does NOT regenerate `package-lock.json`. So between the version commit
 * and the next install, `apps/addressr-deployment`'s manifest says
 * `"@mountainpass/addressr": "3.3.2"` while the lockfile mirror still says
 * `3.3.1`. That disagreement is expected and transient by design.
 *
 * The first version of this guard did not know that, and it FAILED THE RELEASE:
 * the changesets action commits through husky, `test:js` ran, and this test red
 * on 2026-08-19 with 553 pass / 1 fail, taking down the release job. It had been
 * verified against a static tree and never against the state it would actually
 * meet — which is the very defect it was written for (P107).
 *
 * PRESENCE IS STILL CHECKED for these. Only the RANGE is exempt, so removing a
 * workspace dependency from a manifest without refreshing the lockfile still
 * fails, and so does adding one.
 */
/**
 * Is the lockfile node satisfying `<manifestKey>` → `<name>` a workspace link?
 *
 * KEYED ON THE EDGE, NOT THE NAME, and the difference is not pedantry. An
 * earlier version built a Set of linked package NAMES and tested membership,
 * which exempts a name everywhere as soon as it is linked anywhere.
 * `@mountainpass/addressr` is a real published package, so a future manifest
 * depending on the REGISTRY copy would have had its range silently exempted for
 * as long as some other workspace linked the same name — the exact property the
 * re-key was supposed to establish, not established.
 *
 * npm records a workspace edge as a node with `link: true`. Resolution walks
 * from the dependent outward, so check the nested node first and fall back to
 * the hoisted one.
 */
export const isWorkspaceLink = (lock, manifestKey, name) => {
  const nested = manifestKey ? `${manifestKey}/node_modules/${name}` : undefined;
  const node = (nested && lock.packages?.[nested]) ?? lock.packages?.[`node_modules/${name}`];
  return node?.link === true;
};

/** Every package name the lockfile records as a workspace link. */
const linkedNames = (lock) =>
  Object.entries(lock.packages ?? {})
    .filter(([, node]) => node?.link === true)
    .map(([key]) => key.replace(/^.*node_modules\//, ''));

describe('isWorkspaceLink — the exemption predicate', () => {
  // TESTED DIRECTLY because the states that distinguish it do not exist in this
  // repo's lockfile. Today `apps/addressr-deployment/node_modules/...` is absent
  // and the lookup always falls through to the hoisted link, so the whole suite
  // cannot tell edge-keyed resolution from the name-keyed Set it replaced. The
  // property was asserted only in a comment, which is not an assertion.
  const LINK = { link: true };
  const REGISTRY = { version: '3.0.0', resolved: 'https://registry.npmjs.org/x' };

  it('exempts an edge satisfied by a workspace link', () => {
    const lock = { packages: { 'node_modules/pkg': LINK } };
    assert.equal(isWorkspaceLink(lock, 'apps/thing', 'pkg'), true);
  });

  it('does NOT exempt an edge satisfied by a registry copy nested beside a hoisted link', () => {
    // The case the re-key exists for: the name is linked somewhere, but THIS
    // edge resolves to the published package. A name-keyed exemption exempted
    // it; an edge-keyed one must not.
    const lock = {
      packages: {
        'node_modules/pkg': LINK,
        'apps/thing/node_modules/pkg': REGISTRY,
      },
    };
    assert.equal(isWorkspaceLink(lock, 'apps/thing', 'pkg'), false);
  });

  it('does not exempt a name that is not linked at all', () => {
    assert.equal(isWorkspaceLink({ packages: { 'node_modules/pkg': REGISTRY } }, '', 'pkg'), false);
    assert.equal(isWorkspaceLink({ packages: {} }, '', 'pkg'), false);
  });
});

describe('package-lock.json agrees with every manifest', () => {
  it('finds the root and every workspace manifest, so a zero-match pass is impossible', () => {
    const found = manifests();
    assert.ok(found.length > 1, `only ${found.length} manifest(s) found — the workspaces glob has rotted`);
    const lock = read(path.join(repoRoot, 'package-lock.json'));
    assert.ok(lock.packages, 'package-lock.json has no `packages` map — lockfileVersion may have changed');

    // A FLOOR ON THE EXEMPTION, so it cannot go vacuous on a green run. The
    // range check is skipped for workspace links; if a future lockfile shape
    // marked everything `link: true`, every range would be exempt and every
    // assertion would still pass. Pin the exempt set to exactly the workspace
    // packages this repo declares — the same discipline the corpus floor above
    // applies to the manifests themselves.
    const linked = new Set(linkedNames(lock));
    const declared = new Set(found.map(({ manifest }) => manifest.name).filter(Boolean));
    assert.ok(linked.size > 0, 'no workspace links found in the lockfile — the exemption lookup has rotted');
    assert.deepStrictEqual(
      [...linked].sort(),
      [...declared].filter((n) => linked.has(n)).sort(),
      'the lockfile records a workspace link for a package no manifest declares — the exemption has widened',
    );
  });

  it('mirrors each manifest exactly, so an edit without a lockfile refresh fails here', () => {
    const lock = read(path.join(repoRoot, 'package-lock.json'));
    const all = manifests();
    const problems = [];
    for (const { key, manifest } of all) {
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
          } else if (mirrored[name] !== range && !isWorkspaceLink(lock, key, name)) {
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
