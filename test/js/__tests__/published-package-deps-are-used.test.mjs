// A publishable package must not declare a production dependency its shipped
// source never uses.
//
// WHY THIS EXISTS. The ADR-046 restructure moved dependencies out of the root
// manifest into `packages/addressr`. The service's own dependencies moved
// correctly. `@changesets/cli` moved with them — but it was never a dependency
// of the service, it was tooling for the repo, and its callers stayed at the
// root. So from 2026-08-10 a release-management CLI and its subtree shipped to
// every consumer of a published package, inside every Docker image, for nine
// days. It worked the whole time, because npm hoists it up to the root
// `node_modules` where the root scripts find it. Nothing was broken. Nothing
// complained. It was simply wrong, in the artefact other people install.
//
// ADR-046's four Confirmation criteria — the root `workspaces` glob,
// `npx npm@10 ci` resolution, name/directory agreement, and `private`
// placement — all check that packages RESOLVE. None checks that what a package
// DECLARES is what it USES. This is that fifth invariant.
//
// Writing it surfaced two more: `node-machine-id`, referenced nowhere in the
// repository at all, and `uri-template-lite`, used only by a test driver.
//
// WHAT IT DOES NOT COVER, so the green is not read as wider than it is: this is
// a substring scan over the shipped file set, not a resolver. It answers "is
// this name mentioned anywhere we ship", which is deliberately generous — a
// dependency loaded by a name built at runtime would pass. It catches the
// declared-and-never-mentioned case, which is the one that actually happened.
// The converse direction — used but NOT declared — is left to npm's own
// resolution and is not asserted here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** Every workspace package that is actually published. */
const publishablePackages = () => {
  const root = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const found = [];
  for (const glob of root.workspaces ?? []) {
    if (!glob.endsWith('/*')) continue;
    const dir = path.join(repoRoot, glob.slice(0, -2));
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const manifest = path.join(dir, entry, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg.private === true) continue; // not published; its deps ship nowhere
      found.push({ pkg, dir: path.join(dir, entry) });
    }
  }
  return found;
};

// Packages whose files[] contain generated output are checked after build by
// scripts/check-workspace-packages.mjs. This test covers committed shipped files.
const packagesWithCommittedFiles = () => publishablePackages().filter(({ pkg }) =>
  !(pkg.files ?? []).every((file) => file.replace(/\/$/, '') === 'dist'),
);

/** Concatenated text of everything the package's `files` field ships. */
const shippedText = ({ pkg, dir }) => {
  let text = JSON.stringify(pkg.scripts ?? {});
  const visit = (p) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) visit(path.join(p, e));
    } else if (/\.(?:d\.)?(?:js|mjs|cjs|ts)|\.(?:json|ya?ml)$/.test(p)) {
      text += readFileSync(p, 'utf8');
    }
  };
  for (const f of pkg.files ?? []) visit(path.join(dir, f.replace(/\/$/, '')));
  return text;
};

describe('published packages — every production dependency is actually used', () => {
  it('finds a publishable package and a shipped file set, so a zero-match pass is impossible', () => {
    // The failure this repo keeps hitting is a check that matches nothing and
    // reports success. Assert the corpus before asserting anything about it.
    const pkgs = packagesWithCommittedFiles();
    assert.ok(pkgs.length > 0, 'no publishable workspace package found — the workspaces glob has rotted');
    for (const p of pkgs) {
      assert.ok(
        (p.pkg.files ?? []).length > 0,
        `${p.pkg.name} declares no "files" — the shipped set would scan as empty and pass vacuously`,
      );
      assert.ok(
        shippedText(p).length > 1000,
        `${p.pkg.name} shipped-file scan produced almost no text — the files[] paths have rotted`,
      );
      assert.ok(
        Object.keys(p.pkg.dependencies ?? {}).length > 0,
        `${p.pkg.name} declares no production dependencies — nothing to check`,
      );
    }
  });

  it('declares no production dependency the shipped source never mentions', () => {
    const problems = [];
    for (const p of packagesWithCommittedFiles()) {
      const text = shippedText(p);
      for (const dep of Object.keys(p.pkg.dependencies ?? {})) {
        if (text.includes(dep)) continue;
        problems.push(
          `${p.pkg.name} declares "${dep}" as a production dependency, but nothing in its shipped ` +
            `files[] mentions it. If a root script or a test needs it, it belongs in the root ` +
            `devDependencies — declaring it here ships it to every consumer.`,
        );
      }
    }
    assert.deepStrictEqual(problems, [], `\n${problems.join('\n')}\n`);
  });
});
