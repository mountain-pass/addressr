// Unit tests for the licence audit's decision logic.
//
// WHY THIS EXISTS SEPARATELY FROM THE SCRIPT. The gate this replaces
// (`license-checker --production`) failed in three distinct ways at once, and
// each one needs a test that fails when it regresses:
//
//   1. It scanned an empty tree and exited 0, because the ADR-046 restructure
//      emptied the root manifest of production dependencies. Nine days blind.
//   2. It classified a package with NO licence grant (`buffers@0.1.1`) as
//      `Custom: <url>` by scraping a README hyperlink — a link to a DIFFERENT
//      project — and that scraped string was in the allow-list, so the one
//      package in the tree with no licence was the one waved through.
//   3. Its only caller was a bypassable local pre-commit hook. CI never ran it.
//
// So the logic is a pure function over an explicit package list, and the tests
// below pin: empty corpus FAILS, undeclared licence FAILS, and an exception
// must be deliberate, reasoned and reported rather than silently allowed.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditLicenses, isDevOnlyPath } from '../../../scripts/license-audit.mjs';

const ALLOW = ['MIT', 'Apache-2.0', 'ISC'];
const ok = (name) => ({ name, version: '1.0.0', license: 'MIT' });

describe('licence audit', () => {
  it('uses the lockfile path to exclude only packages marked dev-only', () => {
    const lock = {
      packages: {
        'node_modules/dev-tool': { dev: true },
        'node_modules/production-package': { dev: false },
      },
    };
    assert.equal(isDevOnlyPath(lock, '/repo', '/repo/node_modules/dev-tool'), true);
    assert.equal(isDevOnlyPath(lock, '/repo', '/repo/node_modules/production-package'), false);
    assert.equal(isDevOnlyPath(lock, '/repo', '/repo/node_modules/unlisted-package'), false);
  });

  it('fails on an empty corpus rather than passing vacuously', () => {
    // THE DEFECT THIS REPLACES. license-checker printed "No packages found in
    // this path." and exited 0, so a gate scanning nothing reported success.
    const r = auditLicenses({ packages: [], allow: ALLOW });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /no packages/i);
  });

  it('passes a tree whose licences are all on the allow-list', () => {
    const r = auditLicenses({ packages: [ok('a'), ok('b'), ok('c')], allow: ALLOW });
    assert.deepStrictEqual(r.problems, []);
    assert.equal(r.ok, true);
    assert.equal(r.checked, 3);
  });

  it('fails a package that declares no licence at all', () => {
    // `buffers@0.1.1` is exactly this shape: no `license`, no `licenses`, no
    // LICENSE file. It must fail rather than be rescued by a README scrape.
    const r = auditLicenses({
      packages: [ok('a'), { name: 'buffers', version: '0.1.1' }],
      allow: ALLOW,
    });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /buffers@0\.1\.1.*no licence/is);
  });

  it('fails a licence that is not on the allow-list', () => {
    const r = auditLicenses({
      packages: [ok('a'), { name: 'copyleft', version: '2.0.0', license: 'GPL-3.0' }],
      allow: ALLOW,
    });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /copyleft@2\.0\.0.*GPL-3\.0/s);
  });

  it('accepts an SPDX OR expression when either side is allowed', () => {
    const r = auditLicenses({
      packages: [{ name: 'dual', version: '1.0.0', license: '(MIT OR GPL-3.0)' }],
      allow: ALLOW,
    });
    assert.deepStrictEqual(r.problems, []);
  });

  it('requires every side of an SPDX AND expression to be allowed', () => {
    const r = auditLicenses({
      packages: [{ name: 'both', version: '1.0.0', license: 'MIT AND GPL-3.0' }],
      allow: ALLOW,
    });
    assert.equal(r.ok, false);
  });

  it('reads the older `licenses` array form', () => {
    const r = auditLicenses({
      packages: [{ name: 'old', version: '1.0.0', licenses: [{ type: 'MIT' }] }],
      allow: ALLOW,
    });
    assert.deepStrictEqual(r.problems, []);
  });

  it('treats MIT/X11 as MIT', () => {
    // chainsaw@0.1.0 and traverse@0.3.9 both declare this older spelling.
    const r = auditLicenses({
      packages: [{ name: 'chainsaw', version: '0.1.0', license: 'MIT/X11' }],
      allow: ALLOW,
    });
    assert.deepStrictEqual(r.problems, []);
  });

  it('lets a named exception pass, but reports it instead of hiding it', () => {
    // An exception is a recorded, reasoned decision — not an allow-list entry
    // that silently launders a missing licence, which is how buffers passed.
    const r = auditLicenses({
      packages: [{ name: 'buffers', version: '0.1.1' }],
      allow: ALLOW,
      exceptions: { buffers: { reason: 'transitive via unzip-stream; tracked on P106', ticket: 'P106' } },
    });
    assert.equal(r.ok, true);
    assert.equal(r.problems.length, 0);
    assert.equal(r.exercised.length, 1);
    assert.match(r.exercised[0], /buffers.*P106/);
  });

  it('reports the exact uri-templates public-domain declaration exception', () => {
    const r = auditLicenses({
      packages: [{
        name: 'uri-templates',
        version: '0.2.0',
        license: 'http://geraintluff.github.io/tv4/LICENSE.txt',
      }],
      allow: ALLOW,
      exceptions: {
        'uri-templates': {
          reason: 'exact linked text grants unrestricted use, alteration, and distribution',
          ticket: 'P106',
        },
      },
    });

    assert.equal(r.ok, true);
    assert.match(r.exercised.join('\n'), /uri-templates@0\.2\.0.*P106/s);
  });

  it('fails an exception that names no reason, so exceptions cannot be casual', () => {
    const r = auditLicenses({
      packages: [{ name: 'buffers', version: '0.1.1' }],
      allow: ALLOW,
      exceptions: { buffers: {} },
    });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /reason/i);
  });

  it('fails an exception that no longer matches anything, so the list cannot rot', () => {
    // A stale exception is a standing permission nobody re-examined.
    const r = auditLicenses({
      packages: [ok('a')],
      allow: ALLOW,
      exceptions: { 'long-gone': { reason: 'x', ticket: 'P1' } },
    });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /long-gone.*no longer/is);
  });
});
