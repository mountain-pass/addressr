// Every relative link in docs/** must resolve to a file that exists.
//
// Why this exists (R018): cross-artefact doc links embed a MUTABLE path segment.
// Problem tickets carry their lifecycle state as a directory (`open/` → `verifying/`
// → `closed/`), and ADRs carry their status as a filename suffix
// (`.proposed.md` → `.accepted.md` → `.superseded.md`). So every lifecycle
// transition silently breaks every inbound link pointing at that artefact, and
// nothing notices — a stale link renders identically to a live one in every
// markdown viewer. On 2026-08-05 this had accumulated to 174 broken link
// instances across 50 files before anyone looked.
//
// This asserts the invariant rather than leaving it to a human grep, which is the
// same move ADR-001's amendment made for the deploy_only workflow contract.
//
// CORPUS WIDENED 2026-08-18 to the repo-root markdown files. It was `docs/**`
// only, which meant links FROM root files were unchecked while links TO them
// were — an asymmetry nobody had noticed because nothing had depended on it. Then
// `DECISION-MANAGEMENT.md` acquired a link to `049-…proposed.md` carrying the
// exact mutable suffix this guard exists for, and that link is the ONLY
// navigation from the contributor-facing process document to the rule that moved
// out of it. Promoting ADR-049 would have broken it silently and left the rule
// unreachable from the document that used to carry it.
//
// This is ADR-048's shape applied to the guard itself: the check has to sit
// outside the surface it protects, and a surface it cannot see is a surface it
// does not protect.
//
// FENCED CODE BLOCKS ARE SKIPPED, and widening the corpus is what forced it.
// A link inside a ``` fence is ILLUSTRATION — a format sample showing what an
// index entry or a filename should look like — not a reference to a file anyone
// expects to exist. `DECISION-MANAGEMENT.md` carries eight such samples
// (`./001-use-typescript.accepted.md` and friends, plus an `MMM-…` placeholder),
// all inside fences, none of them naming a real decision in this repo. Failing on
// those would push a reader toward inventing files to satisfy the test, which is
// the opposite of the point.
//
// NOT covered: a link that resolves but points at the WRONG artefact (e.g. link
// text "ADR 003" against a target in docs/problems/). Resolution cannot see that.
// Nor an illustrative link written OUTSIDE a fence — indistinguishable from a
// real one by construction.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const DOCS = path.join(REPO, 'docs');

// Repo-root markdown carrying cross-artefact links. Enumerated rather than
// globbed: the root also holds README/CHANGELOG-shaped files whose links point
// outward, and a glob would sweep node_modules on a bad day.
const ROOT_DOCS = [
  'DECISION-MANAGEMENT.md',
  'PROBLEM-MANAGEMENT.md',
  'RISK-POLICY.md',
  'AGENTS.md',
  'CLAUDE.md',
].map((f) => path.join(REPO, f)).filter((f) => existsSync(f));

// docs/adrs/template.md ships `yyyymmdd-xxx.md` as a fill-in-the-blank placeholder.
const EXCLUDED = new Set([path.join(DOCS, 'adrs/template.md')]);

const LINK_RE = /\]\(([^)"#\s]+)(#[^)]*)?\)/g;

async function markdownFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await markdownFiles(p)));
    else if (entry.name.endsWith('.md') && !EXCLUDED.has(p)) out.push(p);
  }
  return out;
}

describe('relative links in docs/** and repo-root markdown (R018)', () => {
  it('finds files and links to check, so a zero-match pass is impossible', async () => {
    // ADDED 2026-08-18. ADR-048's Confirmation criterion 5 claims "NEITHER guard
    // can pass by matching nothing" — and until this existed that was false of
    // this one. Its only assertion was `deepEqual(broken, [])`, which an empty
    // corpus satisfies having checked nothing. The sibling workflow guard
    // carried four floors; this carried none, and the criterion counted them as
    // a pair. Cheaper to make the claim true than to amend a ratified record.
    const files = [...(await markdownFiles(DOCS)), ...ROOT_DOCS];
    assert.ok(files.length > 20, `only ${files.length} markdown files found — the corpus has rotted`);
    assert.ok(ROOT_DOCS.length > 0, 'no repo-root markdown resolved — the ROOT_DOCS list has rotted');
    let links = 0;
    for (const f of files) links += [...(await readFile(f, 'utf8')).matchAll(LINK_RE)].length;
    assert.ok(links > 100, `only ${links} links found across ${files.length} files — LINK_RE has rotted`);
  });

  it('every relative link target exists on disk', async () => {
    const broken = [];
    const unbalanced = [];

    for (const file of [...(await markdownFiles(DOCS)), ...ROOT_DOCS]) {
      const text = await readFile(file, 'utf8');
      // Strip fenced blocks before matching. Line-based rather than regex over
      // the whole text, so an unterminated fence degrades to "skip the rest"
      // rather than silently swallowing the file's remaining links via a greedy
      // match — under-reporting is the direction that hides a real break.
      let inFence = false;
      const prose = text
        .split('\n')
        .filter((line) => {
          if (line.trimStart().startsWith('```')) {
            inFence = !inFence;
            return false;
          }
          return !inFence;
        })
        .join('\n');
      // A file whose fences do not balance has had its tail silently dropped by
      // the filter above — which under-reports, and under-reporting is how a real
      // break hides. Report it rather than trusting the parity.
      if (inFence) unbalanced.push(path.relative(REPO, file));
      for (const [, target] of prose.matchAll(LINK_RE)) {
        // Skip absolute paths, URLs (http:, mailto:) and in-page anchors.
        if (path.isAbsolute(target) || /^[a-z][a-z0-9+.-]*:/i.test(target))
          continue;
        if (!existsSync(path.resolve(path.dirname(file), target))) {
          broken.push(`${path.relative(REPO, file)} -> ${target}`);
        }
      }
    }

    // Enumerate every offender: a repair is only mechanical if the failure names
    // all of them at once.
    assert.deepEqual(
      unbalanced,
      [],
      `unterminated code fence — links after it went unchecked:\n  ${unbalanced.join('\n  ')}`,
    );
    assert.deepEqual(
      broken,
      [],
      `${broken.length} broken doc link(s):\n  ${broken.join('\n  ')}`,
    );
  });
});
