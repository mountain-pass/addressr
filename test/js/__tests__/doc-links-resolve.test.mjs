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

// HTML joined the corpus 2026-08-20 with docs/story-maps/, which the upstream
// framework encodes as HTML because the spatial layout is the artefact. Both
// quote forms are matched deliberately: lint-staged formats `*.{js,jsx}` and
// `*.{json,css,md}`, so nothing normalises attribute quoting in `.html` and a
// single-quoted href would otherwise go unmatched while the floors below stayed
// satisfied by the double-quoted ones already present.
const HREF_RE = /href=(?:"([^"#]+)(?:#[^"]*)?"|'([^'#]+)(?:#[^']*)?')/g;

const isHtml = (f) => f.endsWith('.html');

// Fenced-code stripping is a markdown concept and is not applied to HTML: an
// href in an HTML file is a live reference, never an illustration.
const linkTargets = (file, text) =>
  isHtml(file)
    ? [...text.matchAll(HREF_RE)].map((m) => m[1] ?? m[2])
    : [...stripFences(file, text).prose.matchAll(LINK_RE)].map((m) => m[1]);

// A target this guard can actually resolve — the others are skipped, so
// counting matches rather than resolvable targets would let the floor pass on
// links that never reach existsSync.
const isResolvable = (target) =>
  !path.isAbsolute(target) && !/^[a-z][a-z0-9+.-]*:/i.test(target);

async function docFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await docFiles(p)));
    else if ((entry.name.endsWith('.md') || isHtml(entry.name)) && !EXCLUDED.has(p)) out.push(p);
  }
  return out;
}

// Strip fenced blocks. Line-based rather than regex over the whole text, so an
// unterminated fence degrades to "skip the rest" rather than silently swallowing
// the file's remaining links via a greedy match — under-reporting is the
// direction that hides a real break.
function stripFences(file, text) {
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
  return { prose, unbalanced: inFence };
}

describe('relative links in docs/** and repo-root markdown (R018)', () => {
  it('finds files and links to check, so a zero-match pass is impossible', async () => {
    // ADDED 2026-08-18. ADR-048's Confirmation criterion 5 claims "NEITHER guard
    // can pass by matching nothing" — and until this existed that was false of
    // this one. Its only assertion was `deepEqual(broken, [])`, which an empty
    // corpus satisfies having checked nothing. The sibling workflow guard
    // carried four floors; this carried none, and the criterion counted them as
    // a pair. Cheaper to make the claim true than to amend a ratified record.
    const files = [...(await docFiles(DOCS)), ...ROOT_DOCS];
    assert.ok(files.length > 20, `only ${files.length} doc files found — the corpus has rotted`);
    assert.ok(ROOT_DOCS.length > 0, 'no repo-root markdown resolved — the ROOT_DOCS list has rotted');

    let links = 0;
    let htmlFiles = 0;
    let htmlTargets = 0;
    for (const f of files) {
      const text = await readFile(f, 'utf8');
      const targets = linkTargets(f, text);
      links += targets.length;
      if (isHtml(f)) {
        htmlFiles += 1;
        htmlTargets += targets.filter(isResolvable).length;
      }
    }
    assert.ok(links > 100, `only ${links} links found across ${files.length} files — LINK_RE has rotted`);

    // HTML NEEDS ITS OWN FLOORS, and the reason is the whole point of this test.
    // The three floors above are all satisfied by the ~200-file markdown corpus
    // alone. Widening the walker to `.html` without floors of its own would
    // produce a guard that LOOKS like it covers the story-map tier while a typo
    // in HREF_RE silently reduced its HTML coverage to nothing — green, and
    // blind, which is exactly the defect the 2026-08-18 commit closed for
    // markdown. Measured on 2026-08-20: pointing STORY-MAP-001's STORY-001 href
    // at a non-existent `stories/accepted/` left this suite at 2 pass / 0 fail.
    assert.ok(htmlFiles > 0, 'no HTML files found under docs/ — the .html walker branch has rotted');
    assert.ok(
      htmlTargets > 0,
      `${htmlFiles} HTML file(s) found but 0 resolvable link targets — HREF_RE has rotted`,
    );
  });

  it('every relative link target exists on disk', async () => {
    const broken = [];
    const unbalanced = [];

    for (const file of [...(await docFiles(DOCS)), ...ROOT_DOCS]) {
      const text = await readFile(file, 'utf8');
      // A file whose fences do not balance has had its tail silently dropped —
      // which under-reports, and under-reporting is how a real break hides.
      // Report it rather than trusting the parity. HTML has no fences.
      if (!isHtml(file) && stripFences(file, text).unbalanced) {
        unbalanced.push(path.relative(REPO, file));
      }
      for (const target of linkTargets(file, text)) {
        // Skip absolute paths, URLs (http:, mailto:) and in-page anchors.
        if (!isResolvable(target)) continue;
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
