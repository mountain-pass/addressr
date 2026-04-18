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
const serverPath = path.resolve(
  __dirname,
  '../../../src/waycharter-server.js',
);

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
