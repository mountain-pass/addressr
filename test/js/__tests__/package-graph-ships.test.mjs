// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// Every module the published package can reach must be inside the tarball.
//
// WHY THIS IS NOT SOURCE INSPECTION (P033). It does consume source, but the
// distinguishing thing is not that a dependency graph is "a static fact" —
// `assert.match(/fuzziness: "AUTO:5,8"/)` is a static fact about source too, and
// that is the anti-pattern's own worked example. What makes this legitimate is
// that the CONSUMER OF THESE STRINGS IS A RESOLVER, NOT A HUMAN READING INTENT.
// An import specifier is not evidence about behaviour; it is the input Node
// itself resolves, so asserting on it asserts on the artefact. And the failure
// it guards is silent-green by construction: a module missing from `files` dies
// at first import in the installed package while every existing instrument
// stays green — which is exactly what happened with the Docker CMD path
// recorded in ADR-044's Consequences.
//
// THE INSTRUMENT IS ESBUILD, NOT A REGEX, and that choice is load-bearing. The
// first draft extracted specifiers with a regex and resolved them by hand. That
// is the weaker-interpreter half of P033: a hand-rolled extractor has blind
// spots, and this tree has the edge to prove it —
// `src/waycharter-server.js` ends with
// `export { stopServer, forceCloseConnections } from './graceful-shutdown.js'`,
// a real graph edge sitting on the primary walk from `src/server2.js`.
// `esbuild` is already a declared devDependency driving `build:worker`, so a
// real resolver costs nothing and handles re-exports, side-effect imports,
// literal dynamic `import()` and conditional exports for free. It also removes
// the need for a separate does-this-file-exist check: an unresolvable import
// fails the build.
//
// WHAT THIS GUARDS THAT NOTHING ELSE DOES. Production runs the loader with
// `ADDRESSR_ENABLE_GEO=1` against the PUBLISHED PACKAGE. `test:nodejs:geo` is
// source-plus-geo; `test:cli2:nogeo` is package-minus-geo. The pair production
// actually runs is exercised by neither, and `test:cli2:geo` is in no script
// chain. Wiring that up is real work and is ticketed separately — but the way
// that gap can actually bite reduces to a module reachable only on the geo
// branch being absent from the tarball, because geo DATA comes from the G-NAF
// dataset rather than from package files. That residue is static, and this is
// it, in milliseconds instead of an 8GiB CI leg.
//
// Before ADR-044 the property held by accident: `files` listed `lib/` and
// `babel . -d lib` compiled the whole tree into it, so everything shipped
// whether reachable or not. With `files` an explicit list, an omission is live —
// `version.js` is gitignored, generated at prepack, imported at runtime, and had
// to be added by hand.
//
// DELIBERATELY ONE DIRECTION. This asserts reachable ⊆ shipped, never the
// converse. `api/swagger-2.yaml` is a `files` entry with no importer anywhere,
// and ADR-036 pins that it stays. A tidy-up that "completed" this test with the
// reverse assertion would delete a payload a confirmed decision requires.
//
// NOT COVERED, stated rather than implied: runtime asset reads. `check-version.js`
// reads `../package.json` (npm always ships it) and the loader `createReadStream`s
// G-NAF paths — external to the tarball, which is the same fact that makes the
// geo reasoning above hold.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

// Everything a consumer can invoke, plus what the bins import — listed
// explicitly so a bin rewritten to point elsewhere cannot silently shrink the
// graph this walks.
const ENTRY_POINTS = [...Object.values(pkg.bin), 'loader.js', 'src/server2.js'];

/** Does `files` cover this repo-relative path? */
const isShipped = (relative) =>
  pkg.files.some((entry) =>
    entry.endsWith('/') ? relative.startsWith(entry) : relative === entry,
  );

/** Every local module esbuild actually resolves from the entry points. */
const reachedModules = async () => {
  const { metafile } = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ENTRY_POINTS,
    bundle: true,
    metafile: true,
    write: false,
    // Required with multiple entry points even though nothing is written.
    outdir: 'esbuild-metafile-only',
    platform: 'node',
    format: 'esm',
    // Dependencies are npm's problem; only first-party modules must be in files.
    packages: 'external',
    logLevel: 'silent',
  });
  return Object.keys(metafile.inputs)
    .map((p) => p.split(path.sep).join('/'))
    .filter((p) => !p.startsWith('node_modules/'));
};

describe('the published package ships every module it can reach (ADR-044)', () => {
  it('resolves a non-trivial graph, so a passing result means something', async () => {
    // Precondition, per the slicer lesson this repo learned twice: if the walk
    // returns little or nothing, every assertion below passes vacuously.
    const reached = await reachedModules();
    assert.ok(
      reached.length > 10,
      `resolved only ${reached.length} modules from ${ENTRY_POINTS.length} entry points`,
    );
    // Named members across all four shipped directories, so a graph that
    // silently stops at one boundary cannot satisfy the size floor alone.
    for (const expected of [
      'service/address-service.js',
      'client/elasticsearch.js',
      'utils/stream-down.js',
      'src/graceful-shutdown.js',
    ]) {
      assert.ok(
        reached.includes(expected),
        `${expected} is reachable in fact but absent from the resolved graph`,
      );
    }
  });

  it('covers every reachable local module with a files entry', async () => {
    const unshipped = (await reachedModules()).filter((r) => !isShipped(r)).sort();
    assert.deepStrictEqual(
      unshipped,
      [],
      `reachable from a published entry point but not in package.json "files", so absent from the tarball — the installed package throws ERR_MODULE_NOT_FOUND on first reaching them: ${unshipped.join(', ')}`,
    );
  });

  it('ships the generated version module, which nothing else would catch', async () => {
    // version.js is gitignored and written by `genversion`, so it is invisible
    // to a source-tree check and absent from a clean checkout. It shipped inside
    // lib/ before ADR-044 and had to be added to `files` by hand.
    assert.ok(
      pkg.files.includes('version.js'),
      'version.js must be an explicit files entry: gitignored, generated at prepack, imported at runtime',
    );
    assert.match(
      pkg.scripts.prepack ?? '',
      /genversion/,
      'prepack must generate version.js, or the files entry points at nothing',
    );
  });
});
