/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable unicorn/prevent-abbreviations */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P018 parked: the root `/` cache-control is long-lived by design —
// new rels are added infrequently, and every client page load fetches
// this resource for HATEOAS discovery. A short TTL would cost an
// origin round-trip per request. When the rel set does change, the
// operational playbook is a RapidAPI CF purge (natural expiry up to
// 7 days per P017). This test guards against accidental shortening
// of the directive.
//
// Placed at test/js/__tests__/ so the TDD hook associates it with
// src/waycharter-server.js by basename. Other tests stay under test/js/.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../../../src/waycharter-server.js');

describe('root / cache-control directive (P018 parked — long-lived by design)', () => {
  it("root resource emits 'public, max-age=${ONE_WEEK}'", async () => {
    const source = await readFile(serverPath, 'utf8');
    const rootBlockMatch = source.match(
      /registerResourceType\(\{\s*path:\s*'\/',[\s\S]*?\n\s*\}\);/,
    );
    assert.ok(
      rootBlockMatch,
      'expected to find root resource registration block in src/waycharter-server.js',
    );
    const rootBlock = rootBlockMatch[0];
    assert.match(
      rootBlock,
      /'cache-control':\s*`public,\s*max-age=\$\{ONE_WEEK\}`/,
      `expected root resource to emit 'public, max-age=\${ONE_WEEK}' (long-lived by design — P018 parked); got:\n${rootBlock}`,
    );
  });
});

// ADR 031: read-shadow startup validator must be invoked alongside
// validateProxyAuthConfig() in startRest2Server so misconfigured shadow
// env vars fail the process at startup rather than silently degrade.
describe('startRest2Server — read-shadow startup validator (ADR 031)', () => {
  it('imports validateReadShadowConfig from ./read-shadow', async () => {
    const source = await readFile(serverPath, 'utf8');
    assert.match(
      source,
      /import\s+\{\s*validateReadShadowConfig\s*\}\s+from\s+['"]\.\/read-shadow['"]/,
      'src/waycharter-server.js must import validateReadShadowConfig from ./read-shadow',
    );
  });

  it('startRest2Server calls validateReadShadowConfig() at startup', async () => {
    const source = await readFile(serverPath, 'utf8');
    const startIndex = source.indexOf('export function startRest2Server');
    assert.notEqual(startIndex, -1, 'startRest2Server must exist');
    const endIndex = source.indexOf('\nexport ', startIndex + 1);
    const fnBody = source.slice(
      startIndex,
      endIndex === -1 ? source.length : endIndex,
    );
    assert.match(
      fnBody,
      /validateReadShadowConfig\(\)/,
      'startRest2Server must call validateReadShadowConfig() at startup (ADR 031)',
    );
  });
});
