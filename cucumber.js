const fs = require('fs');

const FAIL_FAST = process.env.FAIL_FAST || '--fail-fast';

function generateConfig(profile) {
  fs.mkdirSync(`test-results/${profile}`, { recursive: true });

  const RERUN = `@cucumber-${profile}.rerun`;
  const FEATURE_GLOB =
    fs.existsSync(RERUN) && fs.statSync(RERUN).size !== 0
      ? RERUN
      : `test/resources/features/**/*.feature --tags 'not(@not-${profile})'`;
  const FORMAT_OPTIONS = {
    snippetInterface: 'async-await',
    snippetSyntax:
      './node_modules/@windyroad/cucumber-js-throwables/lib/custom-cucumber-syntax.js',
  };
  const MODULES =
    '--require-module @babel/register --require-module @babel/polyfill';
  const REQUIRE_GLOB = 'test/js/**/*.js';
  const BASE_CONFIG = `${FEATURE_GLOB} --format-options '${JSON.stringify(
    FORMAT_OPTIONS,
  )}' ${MODULES} --require ${REQUIRE_GLOB} --no-strict --format rerun:${RERUN} --format json:test-results/${profile}/results.cucumber ${FAIL_FAST}`;
  if (profile === 'system') {
    return `${BASE_CONFIG} --world-parameters '${JSON.stringify({
      client: 'rest',
    })}'`;
  }
  return BASE_CONFIG;
}

module.exports = {
  default: generateConfig('component'),
  system: generateConfig('system'),
};
