const fs = require('fs');

const FAIL_FAST = process.env.FAIL_FAST || '--fail-fast';
const NO_STRICT = process.env.NO_STRICT || '--no-strict';

function generateConfig(profile) {
  fs.mkdirSync(`test-results/${profile}`, { recursive: true });

  const RERUN = `@cucumber-${profile}.rerun`;
  const TAGS = process.env.ADDRESSR_ENABLE_GEO
    ? `--tags 'not(@not-${profile}) and not(@not-geo)'`
    : `--tags 'not(@not-${profile}) and not(@geo)'`;
  const NON_RERUN_GLOB = `test/resources/features/**/*.feature ${TAGS}`;
  const FEATURE_GLOB =
    fs.existsSync(RERUN) && fs.statSync(RERUN).size !== 0
      ? RERUN
      : NON_RERUN_GLOB;
  const FORMAT_OPTIONS = {
    snippetInterface: 'async-await',
    snippetSyntax:
      './node_modules/@windyroad/cucumber-js-throwables/lib/custom-cucumber-syntax.js',
  };
  const MODULES =
    '--require-module @babel/register --require-module @babel/polyfill';
  const REQUIRE_GLOB = 'test/js/**/*.js';
  const BASE_CONFIG = `${FEATURE_GLOB} --format-options '${JSON.stringify(
    FORMAT_OPTIONS
  )}' ${MODULES} --require ${REQUIRE_GLOB} ${NO_STRICT} --format rerun:${RERUN} --format json:test-results/${profile}/results.cucumber ${FAIL_FAST}`;
  if (profile === 'rest') {
    const rval = `${BASE_CONFIG} --world-parameters '${JSON.stringify({
      client: 'rest',
    })}'`;
    console.log('BASE_CONFIG', rval);
    return rval;
  }
  if (profile === 'cli') {
    const rval = `${BASE_CONFIG} --world-parameters '${JSON.stringify({
      client: 'rest',
      starter: 'cli',
    })}'`;
    console.log('BASE_CONFIG', rval);
    return rval;
  }
  console.log('BASE_CONFIG', BASE_CONFIG);
  return BASE_CONFIG;
}

module.exports = {
  default: generateConfig('nodejs'),
  rest: generateConfig('rest'),
  cli: generateConfig('cli'),
};
