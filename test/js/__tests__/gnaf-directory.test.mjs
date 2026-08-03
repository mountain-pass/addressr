// @jtbd JTBD-201 (Run Addressr Self-Hosted)
//
// Behavioural tests (NOT source-inspection — see P033) for G-NAF directory
// discovery inside an unzipped extract.
//
// WHY THIS EXISTS. The discovery used the `glob` npm package, whose transitive
// `minimatch` → `brace-expansion` chain was the ONLY vulnerability in the
// production dependency tree (GHSA-mh99-v99m-4gvg, high). `dry-aged-deps`
// named a `depcheck` parent bump as the fix, but depcheck 1.4.7 is already the
// newest published version, so that route does not exist. Node's built-in
// `node:fs/promises` glob does the same job and removes the dependency.
//
// The swap is NOT free of behavioural questions, which is what these tests
// pin. The npm package treats a trailing slash as directory-only by contract;
// Node's built-in does not document that. And the caller takes `[0]` from an
// unsorted result, so multi-match ordering was never guaranteed by either.
// Both cases are asserted below rather than assumed equivalent.
//
// The branch this covers is UNREACHABLE IN CI: `service/address-service.js`
// short-circuits the whole download/unzip/discover block on
// GNAF_TEST_FIXTURE_DIR, which release.yml sets on both cucumber steps. So
// before this file the discovery had no automated coverage at all, in either
// implementation. That is the gap these tests close, independent of the swap.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { findGnafDirectory } = await import('../../../service/gnaf-directory.js');

const withTempTree = async (build, assertions) => {
  const root = await mkdtemp(path.join(tmpdir(), 'gnaf-discovery-'));
  try {
    await build(root);
    await assertions(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

describe('service/gnaf-directory.js — findGnafDirectory', () => {
  it('finds a nested G-NAF directory and returns it relative to the extract root', async () => {
    // The real shape: the zip expands to a dated wrapper directory, and G-NAF
    // sits under it at a depth the caller does not know in advance.
    await withTempTree(
      async (root) => {
        await mkdir(path.join(root, 'g-naf_augustXX/G-NAF/Standard'), {
          recursive: true,
        });
      },
      async (root) => {
        assert.deepEqual(await findGnafDirectory(root), [
          path.join('g-naf_augustXX', 'G-NAF'),
        ]);
      },
    );
  });

  it('returns an empty array when no G-NAF directory is present', async () => {
    // The caller turns this into "Cannot find 'G-NAF' directory in Data dir",
    // so an empty array must mean absent rather than throw.
    await withTempTree(
      async (root) => {
        await mkdir(path.join(root, 'somewhere/else'), { recursive: true });
        await writeFile(path.join(root, 'somewhere/else/x.psv'), 'x');
      },
      async (root) => {
        assert.deepEqual(await findGnafDirectory(root), []);
      },
    );
  });

  it('ignores a FILE named G-NAF', async () => {
    // The discriminating case. The npm package's trailing-slash pattern was
    // directory-only by contract; Node's built-in does not document that, so a
    // stray file would otherwise be returned and the caller would derive a
    // mainDirectory that does not exist.
    await withTempTree(
      async (root) => {
        await mkdir(path.join(root, 'decoy'), { recursive: true });
        await writeFile(path.join(root, 'decoy/G-NAF'), 'not a directory');
      },
      async (root) => {
        assert.deepEqual(await findGnafDirectory(root), []);
      },
    );
  });

  it('skips an unreadable match rather than failing the whole discovery', async () => {
    // The npm package silently swallowed entries it could not stat. A bare
    // `await stat()` does not — it rejects, replacing the caller's explicit
    // "Cannot find 'G-NAF' directory in Data dir" with a raw fs error. A
    // dangling symlink is the cheap reproducible case; EACCES is the same
    // shape. One bad entry must not hide a good extract sitting beside it.
    await withTempTree(
      async (root) => {
        await mkdir(path.join(root, 'real/G-NAF'), { recursive: true });
        await mkdir(path.join(root, 'broken'), { recursive: true });
        await symlink(
          path.join(root, 'does-not-exist'),
          path.join(root, 'broken/G-NAF'),
        );
      },
      async (root) => {
        assert.deepEqual(await findGnafDirectory(root), [
          path.join('real', 'G-NAF'),
        ]);
      },
    );
  });

  it('composes with the caller arithmetic under either trailing-slash convention', async () => {
    // address-service.js does
    //   path.dirname(`${unzipped}/${gnafDirectory[0].slice(0, -1)}`)
    // The `.slice(0, -1)` is vestigial — it dates from a `glob` major that
    // returned a trailing slash, and today just strips the `F` off `G-NAF`.
    // `path.dirname` discards that segment either way, so the answer is the
    // parent of G-NAF under BOTH conventions. That reasoning is what makes the
    // built-in swap safe, and it was held only by a comment. Pin it.
    const parentOf = (unzipped, match) =>
      path.dirname(`${unzipped}/${match.slice(0, -1)}`);

    await withTempTree(
      async (root) => {
        await mkdir(path.join(root, 'g-naf_augustXX/G-NAF/Standard'), {
          recursive: true,
        });
      },
      async (root) => {
        const [discovered] = await findGnafDirectory(root);
        const expected = path.join(root, 'g-naf_augustXX');
        // What discovery actually returns today (no trailing slash).
        assert.equal(parentOf(root, discovered), expected);
        // And what an older glob major would have returned, so a future
        // change of convention on either side cannot silently move the answer.
        assert.equal(parentOf(root, `${discovered}/`), expected);
      },
    );
  });

  it('orders multiple matches deterministically', async () => {
    // The caller indexes [0] with no sort of its own. Neither implementation
    // guarantees an order, so discovery owns it — otherwise which extract wins
    // depends on filesystem iteration order.
    await withTempTree(
      async (root) => {
        await mkdir(path.join(root, 'zeta/G-NAF'), { recursive: true });
        await mkdir(path.join(root, 'alpha/G-NAF'), { recursive: true });
      },
      async (root) => {
        assert.deepEqual(await findGnafDirectory(root), [
          path.join('alpha', 'G-NAF'),
          path.join('zeta', 'G-NAF'),
        ]);
      },
    );
  });
});
