// @jtbd JTBD-400 (Ship releases reliably from trunk)
// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// A D1 migration must carry no semicolon inside a comment.
//
// THIS RULE IS MEASURED, not inferred from documentation. On 2026-09-06 the
// failure that broke run 33365620209 was characterised by diffing the failing
// revision of migration 0002 against its recovery, 166892c1..076a1c63. The
// recovery changed exactly one character:
//
//   -/* Preserve existing entitlements as hard capped; zero included requests is
//   +/* Preserve existing entitlements as hard capped. Zero included requests is
//
// A semicolon, inside a block comment, replaced by a full stop. Nothing else in
// the file moved. So `wrangler d1 migrations apply --remote` splits statements on
// semicolons WITHOUT tracking comment context: the semicolon above ended a
// "statement" consisting of an unterminated comment, and the remainder parsed as
// garbage. Comment length, `--` versus block form and newline placement are all
// irrelevant — the earlier belief that a long comment was the hazard was wrong,
// and 0003 was rewritten twice on that mistaken belief before the real rule was
// measured.
//
// WHY THIS TEST AND NOT AN APPLIER. Neither available applier reproduces it.
// Miniflare's `CUSTOMER_DB.exec` is given `sql.replaceAll('\n', ' ')` and accepts
// the semicolon form. `wrangler d1 migrations apply --local` was built as a probe
// on 2026-09-06 and mutation-tested against four comment-shaped faults, this one
// included; it caught none of them, and was deleted rather than kept as coverage
// it did not provide. The remote parser is the only one that fails, and reaching
// it costs a production release. So the rule is asserted directly against the
// text — which is what the recovery commit proves the rule to be.
//
// The cost of being wrong is set by ordering: `deploy.sh` runs `terraform apply`
// at line 132, deploying the Worker, and `wrangler d1 migrations apply --remote`
// at line 153. `PLAN_ONLY=1` exits before both, so the release-PR plan comment
// never exercises a migration. A rejected migration is therefore first met in
// production, with the new Worker already live against the old schema.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../apps/addressr-deployment/cloudflare-worker/migrations',
);

// Block comments first, so a `--` inside one is not mistaken for a line comment.
function commentsIn(sql) {
  const found = [];
  const withoutBlocks = sql.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    found.push(match);
    return ' '.repeat(match.length);
  });
  for (const match of withoutBlocks.matchAll(/--[^\n]*/g)) found.push(match[0]);
  return found;
}

describe('D1 migrations survive the remote applier’s statement splitter', () => {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  it('finds migrations to check, so a zero-match pass is impossible', () => {
    // Without this the suite would go green on an empty or moved directory —
    // the failure mode that keeps recurring in this repo.
    assert.ok(
      files.length >= 3,
      `expected at least 3 migrations in ${migrationsDir}, found ${files.length}`,
    );
  });

  for (const file of files) {
    it(`${file} has no semicolon inside a comment`, () => {
      const offenders = commentsIn(
        readFileSync(path.join(migrationsDir, file), 'utf8'),
      ).filter((comment) => comment.includes(';'));

      assert.deepStrictEqual(
        offenders,
        [],
        `${file}: a semicolon inside a comment ends a statement for the remote ` +
          `applier, leaving the comment unterminated and the rest unparseable. ` +
          `This is what failed run 33365620209. Replace it with a full stop or a ` +
          `comma:\n${offenders.join('\n')}`,
      );
    });
  }
});
