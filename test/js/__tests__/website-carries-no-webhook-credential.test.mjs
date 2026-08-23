// The website source must carry no Slack incoming-webhook URL.
//
// WHY THIS EXISTS. The site was imported from a separate PUBLIC repository that
// had two Slack incoming-webhook bearer credentials hardcoded in it since 2019 —
// one in an enterprise quote form, one in an unused Contact component. A Slack
// incoming webhook is a bearer credential: anyone holding it posts arbitrary
// messages into that channel. The quote form did its POST with a browser
// `fetch`, so its webhook was not merely in a public repo, it was SERVED in the
// client bundle to every visitor of addressr.io for roughly seven years.
//
// ADR-053 deletes both files as part of the import, in the same commit as the
// import, because on a public repo an import-then-prune sequence republishes a
// live credential under a new path with a fresh commit date.
//
// HONEST LIMIT, stated because a reader will otherwise credit this with more
// than it does. This is the SOURCE-TREE half of ADR-053's Confirmation criterion
// 2: it catches the known string class in files under `apps/website`, and it is
// deliberately the cheap half — no build, so it runs on every commit.
//
// It does not scan build output. The build-output half is the one that mattered
// for the original exposure, because a bundler can inline a value this scan
// would see in a form it would not. That half now exists, in the same commit —
// `apps/website/test/rendered-output.test.mjs` — but it runs only in the job
// that builds, and JTBD-401 records it as PARTIALLY met: one tree, two patterns.
//
// Neither half closes the remaining gap. A credential arriving through a
// dependency or an env-substituted template passes both, and the Google Maps
// browser key already in the served bundle has an UNVERIFIED restriction status
// that no scan here can settle.
//
// ON P033: this file reads repository files and asserts on them, so it joins the
// population P033 measures. That is not the defect P033 was about — a credential
// scanner reading files IS its behaviour, not a weaker proxy for it. Recorded in
// P033's own figures rather than left to inflate them silently.
//
// @adr ADR-053 (website imported as an app with hosting unchanged)
// @jtbd JTBD-401
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const WEBSITE = path.join(repoRoot, 'apps/website');

// Split so this file cannot match itself when the suite scans its own tree.
const WEBHOOK_HOST = 'hooks.slack' + '.com';

const SKIP_DIRS = new Set(['node_modules', '.cache', 'public', '.git']);

const sourceFiles = (dir) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...sourceFiles(full));
    } else if (/\.(js|jsx|ts|tsx|mjs|cjs|json|md|ya?ml)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

describe('apps/website carries no Slack webhook credential', () => {
  it('finds website source files to scan, so a zero-match pass is impossible', () => {
    // The load-bearing assertion. Without it this whole file passes vacuously
    // before the import lands, and again the day someone moves or renames the
    // tree — reporting "no credential found" having read nothing. That green
    // would be read as coverage, which is worse than no test at all.
    assert.ok(
      existsSync(WEBSITE),
      'apps/website does not exist — this test is inert and must not report green',
    );
    const found = sourceFiles(WEBSITE).length;
    assert.ok(
      found > 20,
      `only ${found} scannable files under apps/website; the import carried 78, ` +
        'so a corpus this small means the walk is broken rather than the tree clean',
    );
  });

  it('contains no Slack incoming-webhook URL in any source file', () => {
    const offenders = sourceFiles(WEBSITE)
      .filter((f) => readFileSync(f, 'utf8').includes(WEBHOOK_HOST))
      .map((f) => path.relative(repoRoot, f));
    assert.deepEqual(
      offenders,
      [],
      'Slack webhook URL found in website source. A webhook URL is a bearer ' +
        'credential; committing one to this public repo exposes it and, if the ' +
        'file reaches a browser bundle, serves it to every visitor.',
    );
  });
});
