const fs = require('node:fs');

const FAIL_FAST = process.env.FAIL_FAST || '--fail-fast';
const NO_STRICT = process.env.NO_STRICT || '--no-strict';

function generateConfig(profile) {
  fs.mkdirSync(`test-results/${profile}`, { recursive: true }); // eslint-disable-line security/detect-non-literal-fs-filename -- internal test output path

  const RERUN = `@cucumber-${profile}.rerun`;
  let TAGS = process.env.ADDRESSR_ENABLE_GEO
    ? `--tags 'not(@not-${profile}) and not(@not-geo)`
    : `--tags 'not(@not-${profile}) and not(@geo)`;
  // rest2 / cli2 / nodejs (the in-process v2 embedded tier per ADR-036) all run
  // the v2 @rest2 scenarios. The v1 rest/cli profiles were removed with the v1 API.
  if (profile === 'rest2' || profile === 'cli2' || profile === 'nodejs') {
    TAGS = `${TAGS} and @rest2`;
  }
  TAGS = `${TAGS}'`;
  const NON_RERUN_GLOB = `test/resources/features/**/*.feature ${TAGS}`;
  const FEATURE_GLOB =
    fs.existsSync(RERUN) && fs.statSync(RERUN).size > 0 // eslint-disable-line security/detect-non-literal-fs-filename -- internal rerun file path
      ? RERUN
      : NON_RERUN_GLOB;
  const FORMAT_OPTIONS = {
    snippetInterface: 'async-await',
  };
  const MODULES =
    '--require-module @babel/register --require-module @babel/polyfill';
  const REQUIRE_GLOB = 'test/js/**/*.js';
  const BASE_CONFIG = `${FEATURE_GLOB} --format-options '${JSON.stringify(
    FORMAT_OPTIONS,
  )}' ${MODULES} --require ${REQUIRE_GLOB} ${NO_STRICT} --format rerun:${RERUN} --format json:test-results/${profile}/results.cucumber ${FAIL_FAST}`;
  if (profile === 'rest2') {
    const rval = `${BASE_CONFIG} --world-parameters '${JSON.stringify({
      client: 'rest2',
    })}'`;
    console.log('BASE_CONFIG - rest2', rval);
    return rval;
  }
  if (profile === 'cli2') {
    const rval = BASE_CONFIG;
    console.log('BASE_CONFIG - cli2', rval);
    return rval;
  }
  console.log('BASE_CONFIG', BASE_CONFIG);
  return BASE_CONFIG;
}

module.exports = {
  default: generateConfig('nodejs'),
  rest2: generateConfig('rest2'),
  cli2: generateConfig('cli2'),
};
