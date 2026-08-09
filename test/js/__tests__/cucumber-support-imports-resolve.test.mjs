// @jtbd JTBD-400 (Ship releases reliably from trunk)
//
// The cucumber support files are loaded by cucumber and by nothing else. `test:js`
// globs `test/js/__tests__/*.test.mjs`, so a broken import in `world.js` or a step
// file is invisible to the unit tier, to pre-commit, and to every reviewer reading
// a green suite — and surfaces as ERR_MODULE_NOT_FOUND at `BeforeAll` in CI, on
// every scenario of every tier at once.
//
// That is not hypothetical. The P097 readiness gate was wired into `world.js` with
// `../index-ready.js` where the module sits at `./index-ready.js` — the specifier
// was copied from the test file, which is one directory deeper and where the same
// string is correct. `npm run test:js` was 392/392 with that in the tree.
//
// WHY STATIC ANALYSIS RATHER THAN IMPORTING THE FILES. Importing `world.js`
// outside a cucumber run throws from cucumber's own guard — "You're calling
// functions (e.g. BeforeAll) on an instance of Cucumber that isn't running" — so
// an import-and-see check cannot run here at all. Resolving specifiers and reading
// export statements answers the same questions without executing anything.
//
// THE INVENTORY IS READ FROM `cucumber.js`, NOT RESTATED. A hand-maintained list
// of "the files cucumber loads" is a second copy of a fact the runner already
// owns, and the first draft of this guard proved the point by walking `test/js/`
// non-recursively while the runner's glob is `test/js/**/*.js` — it checked six
// of nine files and left the three drivers unguarded, one of which reaches four
// directories up into `src/`. A restated inventory drifts silently and does not
// self-correct.
//
// SCOPE. This checks that relative specifiers resolve AND that each named binding
// they import is exported by the target. It does not check bare specifiers —
// `node_modules` resolution is npm's job and a missing package fails loudly at
// install — and it does not follow re-export chains, which is called out at the
// re-export branch below rather than left to be discovered.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const cucumberConfig = path.join(repoRoot, 'cucumber.js');

/** Relative import/export specifiers, static and dynamic. */
const SPECIFIER = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g;
/** `import { a, b as c } from '...'` — the braced clause only. */
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"]/g;
/** `export const x`, `export function x`, `export class x`, `export async function x`. */
const EXPORT_DECL =
  /export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g;
/** `export { a, b as c }` — the braced clause. */
const EXPORT_CLAUSE = /export\s*\{([^}]*)\}/g;
/** `export * from '...'` / `export { x } from '...'` — chains we do not follow. */
const RE_EXPORT = /export\s+(?:\*|\{[^}]*\})\s*from\s*['"][^'"]*['"]/;

/**
 * The directory the runner's `--import` glob is rooted at, read from
 * `cucumber.js` rather than written down here. If that glob moves, this fails
 * loudly instead of quietly checking the old location.
 */
async function importRoot() {
  const config = await readFile(cucumberConfig, 'utf8');
  const match = /IMPORT_GLOB\s*=\s*['"]([^'"]+)['"]/.exec(config);
  assert.ok(
    match,
    'could not read IMPORT_GLOB from cucumber.js — this guard shadows that ' +
      'glob and cannot be trusted if it has moved or been renamed',
  );
  const glob = match[1];
  assert.match(
    glob,
    /\*\.js$/,
    `cucumber's import glob "${glob}" no longer ends in *.js; this guard's walk ` +
      'filters on .js and would now check fewer files than the runner loads',
  );
  assert.match(
    glob,
    /\*\*/,
    `cucumber's import glob "${glob}" is no longer recursive; this guard walks ` +
      'recursively and would now check more than the runner loads',
  );
  return path.join(repoRoot, glob.slice(0, glob.indexOf('*')));
}

/** Every `.js` file under `root`, recursively — matching `**‍/*.js`. */
async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      // `__tests__` is this tier's own directory. Cucumber's glob does reach it,
      // but those files are `.mjs` and so are not matched by `*.js`.
      found.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      found.push(full);
    }
  }
  return found;
}

/** Bare name from one clause entry: `a` from `a`, `a` from `a as b`. */
const importedName = (part) => {
  const [name] = part.trim().split(/\s+as\s+/, 1);
  return name.trim();
};

/** Exported name from one clause entry: `a` from `a`, `b` from `a as b`. */
const exportedName = (part) => {
  const trimmed = part.trim();
  const as = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(trimmed);
  return as ? as[1] : trimmed;
};

/** Names a module exports, by reading its export statements. */
const exportedNames = (source) => {
  const names = new Set();
  for (const [, name] of source.matchAll(EXPORT_DECL)) names.add(name);
  for (const [, clause] of source.matchAll(EXPORT_CLAUSE)) {
    const clauseNames = clause.split(',').map(exportedName).filter(Boolean);
    for (const name of clauseNames) names.add(name);
  }
  return names;
};

describe('cucumber support files import things that exist', () => {
  it('resolves every relative specifier under the runner’s import glob', async () => {
    const files = await walk(await importRoot());
    // Guard the guard: a walk that silently matches nothing would pass this
    // whole suite while checking not one specifier.
    assert.ok(files.length > 0, 'found no cucumber support files to check');

    const specifiers = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const [, specifier] of source.matchAll(SPECIFIER)) {
        specifiers.push({ file, specifier });
      }
    }
    const checked = specifiers.length;

    const broken = [];
    for (const { file, specifier } of specifiers) {
      const target = path.resolve(path.dirname(file), specifier);
      try {
        await access(target);
      } catch {
        broken.push(`${path.relative(repoRoot, file)} -> ${specifier}`);
      }
    }

    assert.ok(checked > 0, 'found no relative specifiers to check');
    assert.deepStrictEqual(
      broken,
      [],
      'cucumber support files import paths that do not exist; these fail at ' +
        'BeforeAll in CI and are invisible to test:js',
    );
  });

  it('imports named bindings the target module actually exports', async () => {
    // The half a path check cannot see. `import { awaitIndexReady } from
    // './index-ready.js'` with the name misspelt resolves clean and fails at
    // BeforeAll exactly as a wrong path does.
    const files = await walk(await importRoot());
    const wanted = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const [, clause, specifier] of source.matchAll(NAMED_IMPORT)) {
        const names = clause.split(',').map(importedName).filter(Boolean);
        for (const name of names) wanted.push({ file, specifier, name });
      }
    }
    const checked = wanted.length;

    const missing = [];
    for (const { file, specifier, name } of wanted) {
      const target = path.resolve(path.dirname(file), specifier);
      // Unresolvable path — the first case owns that failure. A module that
      // re-exports is not fully described by its own export statements, so it is
      // skipped rather than guessed at: a false green here is quiet, a false red
      // would train people to ignore this guard.
      let targetSource;
      try {
        targetSource = await readFile(target, 'utf8');
      } catch {
        continue;
      }
      // The skip is PER BINDING, not per module. `src/waycharter-server.js`
      // re-exports `stopServer` and `forceCloseConnections` from
      // `./graceful-shutdown.js` while declaring `startRest2Server` itself — a
      // whole-module skip would have silently stopped checking all three. Only a
      // name this module does not declare AND that could have arrived through a
      // re-export is unresolvable from here; everything else is checkable.
      const exported = exportedNames(targetSource);
      if (!exported.has(name) && RE_EXPORT.test(targetSource)) continue;
      if (!exported.has(name)) {
        missing.push(
          `${path.relative(repoRoot, file)} -> ${specifier} :: ${name}`,
        );
      }
    }

    assert.ok(checked > 0, 'found no named imports to check');
    assert.deepStrictEqual(
      missing,
      [],
      'cucumber support files import bindings their targets do not export',
    );
  });
});
