#!/usr/bin/env node
const { satisfies } = require('semver');
const { engines } = require('../package');

const version = engines.node;
if (!satisfies(process.version, version)) {
  console.log(
    `Required node version ${version} not satisfied with current version ${process.version}.`,
  );
  process.exit(1); // eslint-disable-line no-process-exit, n/no-process-exit -- postinstall version check
}
