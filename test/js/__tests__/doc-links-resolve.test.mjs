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
// NOT covered: a link that resolves but points at the WRONG artefact (e.g. link
// text "ADR 003" against a target in docs/problems/). Resolution cannot see that.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs');

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

describe('docs/** relative links (R018)', () => {
  it('every relative link target exists on disk', async () => {
    const broken = [];

    for (const file of await markdownFiles(DOCS)) {
      const text = await readFile(file, 'utf8');
      for (const [, target] of text.matchAll(LINK_RE)) {
        // Skip absolute paths, URLs (http:, mailto:) and in-page anchors.
        if (path.isAbsolute(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        if (!existsSync(path.resolve(path.dirname(file), target))) {
          broken.push(`${path.relative(DOCS, file)} -> ${target}`);
        }
      }
    }

    // Enumerate every offender: a repair is only mechanical if the failure names
    // all of them at once.
    assert.deepEqual(broken, [], `${broken.length} broken doc link(s):\n  ${broken.join('\n  ')}`);
  });
});
