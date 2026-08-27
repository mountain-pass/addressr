#!/usr/bin/env node
// Licence audit for the published production dependency tree.
//
// REPLACES `license-checker --production --onlyAllow ...`, which was retired on
// 2026-08-19 (P106) after nine days of scanning nothing. Three defects, all of
// them structural rather than incidental:
//
//   1. `--production` resolved against the ROOT manifest, which the ADR-046
//      restructure emptied of production dependencies. license-checker printed
//      "Found error: No packages found in this path." and EXITED 0. A gate that
//      examines nothing and reports success is worse than no gate, because the
//      green is read as coverage.
//   2. It classified `buffers@0.1.1` — which declares NO licence, has no
//      LICENSE file, and carries no grant of any kind — as
//      `Custom: http://github.com/substack/node-bufferlist`, a string scraped
//      out of a README sentence pointing at a DIFFERENT project. That scraped
//      string sat in the allow-list, so the single package in the tree with no
//      licence was the one the gate waved through.
//   3. Its only caller was the local pre-commit hook, which `--no-verify`
//      bypasses and which CI never ran.
//
// The upstream package last shipped in June 2022. A maintained fork exists, but
// it inherits the same design, so this is deliberately NOT a dependency swap:
// npm already knows the resolved tree, and node already reads JSON. Adding a
// dependency to audit dependencies was the wrong shape.
//
// DESIGN COMMITMENTS, each one a defect above turned into a rule:
//   - Resolve the tree per publishable workspace package via `npm ls --omit=dev`,
//     so scope cannot drift with the repository layout again.
//   - An EMPTY corpus is a FAILURE, never a pass (ADR-048 criterion 5).
//   - A package with no declared licence FAILS. It is never rescued by a
//     scraped URL, a README, or a guessed identifier.
//   - Exceptions are explicit, must carry a reason and a ticket, are PRINTED on
//     every run, and FAIL when they stop matching anything — so a standing
//     permission cannot quietly outlive the thing it permitted.

import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** SPDX identifiers permitted in the published production tree. */
export const ALLOW = [
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Unlicense',
  'WTFPL',
  'Python-2.0',
  'MPL-2.0',
  'BlueOak-1.0.0',
  'CC0-1.0',
];

/**
 * Packages allowed to fail the rules above, each with a reason and a ticket.
 * NOT an allow-list: every entry is printed on every run, and an entry that
 * stops matching anything fails the audit rather than lingering.
 *
 * EMPTY, and it emptied itself. `buffers@0.1.1` — no licence grant of any kind,
 * reached transitively through `unzip-stream` -> `binary@0.3.0` (published
 * 2011) — was the only entry. Replacing `unzip-stream` with `yauzl` on
 * 2026-08-19 removed it from the tree, and the audit immediately went RED
 * demanding this entry be deleted, which is the behaviour it was written to
 * have: a permission cannot outlive its subject, so the swap could not land
 * quietly leaving a stale grant behind.
 */
export const EXCEPTIONS = {
  'uri-templates': {
    ticket: 'P106',
    reason:
      '0.2.0 declares http://geraintluff.github.io/tv4/LICENSE.txt; that exact text grants unrestricted use, alteration, and distribution, but is not an SPDX identifier.',
  },
};

const normalise = (id) => (id === 'MIT/X11' ? 'MIT' : id);

/** Every licence identifier a manifest declares, from any of the shapes npm allows. */
const declared = (pkg) => {
  const raw =
    typeof pkg.license === 'string'
      ? pkg.license
      : typeof pkg.license === 'object' && pkg.license?.type
        ? pkg.license.type
        : Array.isArray(pkg.licenses)
          ? pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ')
          : undefined;
  return raw?.trim() || undefined;
};

/**
 * Decide whether a resolved package list satisfies the allow-list.
 * Pure: takes the packages, returns the verdict. No filesystem, no npm.
 */
export function auditLicenses({ packages, allow = ALLOW, exceptions = {} }) {
  const problems = [];
  const exercised = [];
  const allowed = new Set(allow);
  const used = new Set();

  if (!packages || packages.length === 0) {
    // THE DEFECT THIS TOOL EXISTS TO END. Nothing scanned is never a pass.
    problems.push(
      'no packages resolved — the audit examined an empty tree. This is a failure, not a pass: ' +
        'it is exactly how the retired gate reported success for nine days.',
    );
    return { ok: false, problems, exercised, checked: 0 };
  }

  for (const pkg of packages) {
    const id = `${pkg.name}@${pkg.version}`;
    const exception = Object.hasOwn(exceptions, pkg.name) ? exceptions[pkg.name] : undefined;
    if (exception) {
      used.add(pkg.name);
      if (!exception.reason || !exception.ticket) {
        problems.push(`${id}: licence exception must carry both a reason and a ticket.`);
      } else {
        exercised.push(`${id} — exception (${exception.ticket}): ${exception.reason}`);
      }
      continue;
    }

    const raw = declared(pkg);
    if (!raw) {
      problems.push(
        `${id}: declares no licence. Not permitted — a package with no grant may not ship. ` +
          'Replace it, obtain a grant upstream, or record a reasoned exception.',
      );
      continue;
    }

    // An SPDX OR is satisfied by any allowed side; an AND requires every side.
    const parts = raw.replace(/[()]/g, '').split(/\s+OR\s+/i);
    const satisfied = parts.some((part) =>
      part
        .split(/\s+AND\s+/i)
        .every((one) => allowed.has(normalise(one.trim()))),
    );
    if (!satisfied) problems.push(`${id}: licence "${raw}" is not on the allow-list.`);
  }

  for (const name of Object.keys(exceptions)) {
    if (!used.has(name)) {
      problems.push(
        `${name}: licence exception no longer matches any package in the tree. ` +
          'Remove it — a standing permission that outlives its subject is how allow-lists rot.',
      );
    }
  }

  return { ok: problems.length === 0, problems, exercised, checked: packages.length };
}

/**
 * Resolve each publishable workspace package's production tree.
 *
 * TWO WRONG APPROACHES WERE TRIED FIRST, both caught by mutation-testing this
 * script rather than by reasoning about it, and both worth recording because
 * each failed in this file's own subject class — examining less than it claimed:
 *
 *   - `npm ls --parseable` ALONE prints every directory in `node_modules`,
 *     including EXTRANEOUS packages (on disk, no longer declared). Removing
 *     `license-checker` from devDependencies without reinstalling left it
 *     extraneous, and its subtree surfaced as two phantom production
 *     violations. The audit became a function of the machine, not the manifest.
 *   - Walking `npm ls --json` skips deduped subtrees: it resolved 59 packages
 *     where the true production tree has 133. A checker that silently audits
 *     44% of its corpus and reports success is precisely the defect P106
 *     records.
 *
 * So: `--parseable`, because it is the only one of the three that returns the
 * complete tree.
 *
 * A THIRD attempt tried to REFUSE to run when npm reported extraneous packages.
 * That was also wrong: under `--omit=dev`, and even on a freshly-installed tree,
 * a workspace-scoped `npm ls` reports dev-only packages (`@types/node`,
 * `undici-types`) as extraneous, so the refusal fired on a clean checkout.
 * Extraneous is not a usable dirty-tree signal here.
 *
 * npm 10 on Linux also leaks some root dev-only optional dependencies into a
 * public workspace's `--omit=dev` output. The lockfile's path-specific `dev`
 * flag is deterministic across npm versions, so it removes only entries that
 * the committed dependency graph marks exclusively development-only. Missing
 * lock entries remain included: uncertainty fails toward over-reporting.
 */
export function isDevOnlyPath(lock, repoRoot, packagePath) {
  const key = path.relative(repoRoot, packagePath).replaceAll('\\', '/');
  return lock.packages?.[key]?.dev === true;
}

export function resolveProductionTree(repoRoot = process.cwd()) {
  const root = JSON.parse(readFileSync(`${repoRoot}/package.json`, 'utf8'));
  const lock = JSON.parse(readFileSync(`${repoRoot}/package-lock.json`, 'utf8'));
  const seen = new Set();
  const packages = [];
  const excluded = [];

  for (const glob of root.workspaces ?? []) {
    if (!glob.endsWith('/*')) continue;
    const dir = `${repoRoot}/${glob.slice(0, -2)}`;
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(`${dir}/${entry}/package.json`, 'utf8'));
      } catch {
        continue;
      }
      if (manifest.private === true) {
        // NAME IT, do not just skip it (ADR-053 Confirmation criterion 5). The scan
        // REACHES this tree via root.workspaces above and then declines to audit it.
        // Silently, that is the P106 shape — a gate that examines nothing and reports
        // success, where the green reads as coverage of everything present.
        //
        // Generic rather than special-cased to apps/website, so apps/addressr-deployment
        // is named too. That is the honest excluded set and it closes the same
        // misreading for both at no extra cost.
        //
        // The exclusion is a SCOPE statement, not a claim of no obligation: this audit's
        // subject is the published npm tarball. A Gatsby client bundle does ship
        // third-party code to browsers, which is a real licence question under most OSS
        // terms — just a distinct, currently ungoverned one.
        excluded.push(`${glob.slice(0, -2)}/${entry}`);
        continue;
      }

      const run = (args) => {
        try {
          return execFileSync('npm', args, {
            encoding: 'utf8',
            cwd: repoRoot,
            maxBuffer: 128 * 1024 * 1024,
          });
        } catch (error) {
          // `npm ls` exits non-zero when the tree has problems but still emits
          // usable output. Prefer it; only give up when there is none.
          if (error.stdout) return error.stdout;
          throw error;
        }
      };

      for (const p of run(['ls', '-w', manifest.name, '--omit=dev', '--all', '--parseable'])
        .trim()
        .split('\n')) {
        if (!p || p === repoRoot) continue; // first line is the repo root, not a package
        if (isDevOnlyPath(lock, repoRoot, p)) continue;
        let pkg;
        try {
          pkg = JSON.parse(readFileSync(`${p}/package.json`, 'utf8'));
        } catch {
          continue;
        }
        if (!pkg.name || !pkg.version) continue;
        const id = `${pkg.name}@${pkg.version}`;
        if (seen.has(id)) continue;
        seen.add(id);
        packages.push(pkg);
      }
    }
  }
  packages.excluded = excluded;
  return packages;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const packages = resolveProductionTree();
  const { ok, problems, exercised, checked } = auditLicenses({
    packages,
    allow: ALLOW,
    exceptions: EXCEPTIONS,
  });
  console.log(`licence audit: ${checked} packages in the published production tree`);
  for (const x of packages.excluded ?? [])
    console.log(`  EXCLUDED   ${x} (private: hosted or deployed, not published — NOT audited)`);
  for (const e of exercised) console.log(`  EXCEPTION  ${e}`);
  for (const p of problems) console.error(`  FAIL       ${p}`);
  if (!ok) {
    console.error(`\nlicence audit FAILED with ${problems.length} problem(s).`);
    process.exit(1);
  }
  console.log('licence audit passed.');
}
