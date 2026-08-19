// The licence audit must run in CI, not only in the local pre-commit hook.
//
// WHY. Before 2026-08-19 the licence gate's ONLY caller was
// `package.json`'s pre-commit script. `--no-verify` bypasses it, a contributor
// without hooks installed never runs it, and no workflow invoked it — so the
// sole compliance control over what licences reach a published artefact lived
// on one machine, optionally. That was half of P106; the other half was that it
// scanned an empty tree. Fixing the scan without giving it a CI home would have
// left a correct check nobody is obliged to run.
//
// This guard sits outside both surfaces it protects — it is a unit test, so it
// runs even when the workflow does not.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolveProductionTree } from '../../../scripts/license-audit.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('licence audit — wired into CI, not just the local hook', () => {
  it('is invoked by at least one workflow that runs on push', () => {
    const dir = path.join(repoRoot, '.github', 'workflows');
    const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
    assert.ok(files.length > 0, 'no workflow files found — the glob has rotted');
    const callers = files.filter((f) => {
      const body = readFileSync(path.join(dir, f), 'utf8');
      // Whole comment lines stripped: this file's own rationale mentions the
      // script name, and prose about the code must not read as the code.
      const code = body
        .split('\n')
        .filter((l) => !/^\s*#/.test(l))
        .join('\n');
      return /npm run check-licenses|scripts\/license-audit\.mjs/.test(code);
    });
    assert.ok(
      callers.length > 0,
      'no workflow invokes the licence audit — it is back to being local-only, which is the P106 defect',
    );
  });

  it('is still wired to the audit script rather than the retired tool', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const script = pkg.scripts?.['check-licenses'] ?? '';
    assert.match(script, /license-audit\.mjs/, 'check-licenses no longer points at the audit script');
    assert.doesNotMatch(
      script,
      /license-checker/,
      'check-licenses points at license-checker again — retired 2026-08-19 per P106: it scanned the ' +
        'root manifest (emptied by ADR-046), exited 0 on an empty tree, and allow-listed a README scrape',
    );
    assert.ok(
      !Object.hasOwn(pkg.devDependencies ?? {}, 'license-checker'),
      'license-checker is back in devDependencies; it last shipped in June 2022',
    );
  });

  it('resolves a real, non-trivial production tree', () => {
    // A FLOOR OUTSIDE THE AUDIT ITSELF. The audit fails on an empty corpus, but
    // an empty corpus is not the only way to under-report: a resolver change
    // that silently returned 12 packages instead of 126 would pass every other
    // assertion here. Two resolver attempts did exactly that while this script
    // was being written — one returned 59 of 133 by skipping deduped subtrees.
    const packages = resolveProductionTree();
    assert.ok(
      packages.length > 100,
      `only ${packages.length} packages resolved in the published production tree — ` +
        'the resolver has shrunk. This is the under-reporting direction, which is the ' +
        'defect the audit exists to prevent.',
    );
    assert.ok(
      packages.every((p) => p.name && p.version),
      'a resolved package has no name or version — the resolver is returning junk',
    );
  });
});
