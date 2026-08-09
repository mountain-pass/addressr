// G-NAF directory discovery inside an unzipped extract.
//
// Extracted from address-service.js so it can be tested — the caller's branch
// is unreachable in CI (address-service short-circuits the whole
// download/unzip/discover block on GNAF_TEST_FIXTURE_DIR, which release.yml
// sets on both cucumber steps). Same shape as service/covered-states.js, which
// P034 extracted for the same reason.
//
// Uses Node's built-in glob rather than the `glob` npm package. That package's
// minimatch → brace-expansion chain was the only vulnerability in the
// production dependency tree (GHSA-mh99-v99m-4gvg), and it had no upgrade path:
// dry-aged-deps named a depcheck parent bump, but depcheck 1.4.7 is already the
// newest published version.
//
// The trailing slash on the pattern is load-bearing: it restricts matches to
// directories, so a FILE named G-NAF is not returned and neither is a dangling
// symlink. That is the npm package's documented contract and Node's built-in
// was measured to agree on 22.0.0, 22.16.0, 22.17.1 and 24.16 — the whole
// range `engines: >=22` declares. It is undocumented for the built-in, so the
// sibling test pins it rather than trusting it; an explicit stat() filter was
// tried and removed as dead code, since glob never yields an entry it would
// have excluded.
//
// On the suppression below: fs/promises glob is present from Node 22.0.0 and
// marked supported at 22.17.0, and engines is `>=22`, so the rule fires on the
// 22.0-22.16 gap. Raising the engines floor instead would be a BREAKING change
// for self-hosted operators — scripts/check-version.js runs in postinstall and
// process.exit(1)s below the floor, so it is a hard install failure, not a
// warning. Suppressed narrowly here, and release.yml's `engine-floor` job runs
// test:js on 22.7.x — inside the experimental band, so the gap is exercised
// rather than assumed. 22.7 rather than 22.0 because the .mjs tests import
// untranspiled .js modules and ESM-in-.js only loads from 22.7; see that job's
// comment. The 22.0 end rests on the one-off cross-version measurement above.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { glob } from 'node:fs/promises';

/**
 * Find every G-NAF directory inside an unzipped G-NAF extract.
 *
 * @param {string} unzipped Extract root to search under.
 * @returns {Promise<string[]>} Matching directories, relative to `unzipped`,
 *   sorted. Empty when none is present — the caller turns that into its
 *   "Cannot find 'G-NAF' directory" error.
 */
export async function findGnafDirectory(unzipped) {
  const matches = await Array.fromAsync(glob('**/G-NAF/', { cwd: unzipped }));
  // The caller indexes [0]. Neither implementation guarantees an order, so sort
  // here rather than let filesystem iteration order decide which extract wins.
  // Any total order will do; these are paths from a G-NAF zip, so ASCII, where
  // every locale agrees with codepoint order anyway.
  return matches.toSorted((a, b) => a.localeCompare(b));
}
