#!/usr/bin/env node
'use strict';
const { satisfies } = require('semver');
const { engines } = require('../package');

const version = engines.node;
if (!satisfies(process.version, version)) {
  console.log(
    `Required node version ${version} not satisfied with current version ${process.version}.`
  );
  process.exit(1);
}
