#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { satisfies } from 'semver';

// Read rather than `import ... with { type: 'json' }`: this file ships to
// consumers and runs on postinstall, so it must load on the widest range of
// node this package supports, not just the newest.
const { engines } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const version = engines.node;
if (!satisfies(process.version, version)) {
  console.log(
    `Required node version ${version} not satisfied with current version ${process.version}.`,
  );
  process.exit(1); // eslint-disable-line no-process-exit, n/no-process-exit -- postinstall version check
}
