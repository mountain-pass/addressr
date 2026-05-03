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
      /import\s+\{[^}]*validateReadShadowConfig[^}]*\}\s+from\s+['"]\.\/read-shadow['"]/,
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

// P035: /debug/shadow-config endpoint must be registered as a waycharter
// resource type so an operator can introspect runtime shadow state.
// Source-inspection here per the file's existing precedent (P033 caveat at
// the file head); behavioural integration coverage lives in the release.yml
// post-deploy smoke step, which exercises the full route + middleware
// chain against the deployed server.
describe('startRest2Server — /debug/shadow-config endpoint (P035)', () => {
  it('imports getShadowStatus from ./read-shadow', async () => {
    const source = await readFile(serverPath, 'utf8');
    assert.match(
      source,
      /import\s+\{[^}]*getShadowStatus[^}]*\}\s+from\s+['"]\.\/read-shadow['"]/,
      'src/waycharter-server.js must import getShadowStatus from ./read-shadow',
    );
  });

  it('registers /debug/shadow-config as a waycharter resource type', async () => {
    const source = await readFile(serverPath, 'utf8');
    const startIndex = source.indexOf('export function startRest2Server');
    const endIndex = source.indexOf('\nexport ', startIndex + 1);
    const fnBody = source.slice(
      startIndex,
      endIndex === -1 ? source.length : endIndex,
    );
    assert.match(
      fnBody,
      /registerResourceType\(\{[\s\S]*?path:\s*['"]\/debug\/shadow-config['"]/,
      'startRest2Server must register /debug/shadow-config via waycharter.registerResourceType',
    );
  });

  it('the /debug/shadow-config loader calls getShadowStatus()', async () => {
    const source = await readFile(serverPath, 'utf8');
    const blockStart = source.indexOf("path: '/debug/shadow-config'");
    assert.notEqual(blockStart, -1, '/debug/shadow-config block must exist');
    // Look at the next ~600 characters which should contain the loader body
    const block = source.slice(blockStart, blockStart + 600);
    assert.match(
      block,
      /getShadowStatus\(\)/,
      '/debug/shadow-config loader must call getShadowStatus() to populate the response body',
    );
  });

  it('the /debug/shadow-config response sets cache-control: no-cache', async () => {
    const source = await readFile(serverPath, 'utf8');
    const blockStart = source.indexOf("path: '/debug/shadow-config'");
    const block = source.slice(blockStart, blockStart + 600);
    assert.match(
      block,
      /'cache-control':\s*['"]no-cache['"]/,
      '/debug/shadow-config must set cache-control: no-cache so monitoring tools see live counters',
    );
  });
});
