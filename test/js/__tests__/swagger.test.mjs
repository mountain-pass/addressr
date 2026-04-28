/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P033 caveat: source-inspection because swagger.js uses babel-only globals
// (__dirname) and cannot be imported by raw Node ESM.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swaggerPath = path.resolve(__dirname, '../../../swagger.js');

// ADR 031: read-shadow startup validator must be invoked in startServer
// alongside other startup wiring so misconfigured shadow env vars fail the
// process at startup. swagger.js is the legacy v1 entry; no proxy-auth
// precedent exists here, so this is a new validator hook on this stack.
describe('startServer — read-shadow startup validator (ADR 031)', () => {
  it('imports validateReadShadowConfig from ./src/read-shadow', async () => {
    const source = await readFile(swaggerPath, 'utf8');
    assert.match(
      source,
      /import\s+\{\s*validateReadShadowConfig\s*\}\s+from\s+['"]\.\/src\/read-shadow['"]/,
      'swagger.js must import validateReadShadowConfig from ./src/read-shadow',
    );
  });

  it('startServer calls validateReadShadowConfig() at startup', async () => {
    const source = await readFile(swaggerPath, 'utf8');
    const startIndex = source.indexOf('export function startServer');
    assert.notEqual(startIndex, -1, 'startServer must exist');
    const endIndex = source.indexOf('\nexport ', startIndex + 1);
    const functionBody = source.slice(
      startIndex,
      endIndex === -1 ? source.length : endIndex,
    );
    assert.match(
      functionBody,
      /validateReadShadowConfig\(\)/,
      'startServer must call validateReadShadowConfig() at startup (ADR 031)',
    );
  });
});
