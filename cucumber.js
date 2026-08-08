import fs from 'node:fs';

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
  if (['rest2', 'cli2', 'nodejs'].includes(profile)) {
    TAGS += ' and @rest2';
  }
  TAGS += "'";
  const NON_RERUN_GLOB = `test/resources/features/**/*.feature ${TAGS}`;
  // The rerun swap: after a failing run, re-run only what failed. Worth knowing
  // that `--dry-run` ALSO writes this file, listing every scenario it skipped —
  // so a dry run silently narrows the next real run to that snapshot. Set
  // CUCUMBER_IGNORE_RERUN=1 to take the full glob without deleting the file;
  // test/js/__tests__/cucumber-profiles.test.mjs does exactly that, so its
  // assertions do not depend on leftover local state.
  const useRerun =
    process.env.CUCUMBER_IGNORE_RERUN !== '1' &&
    fs.existsSync(RERUN) && // eslint-disable-line security/detect-non-literal-fs-filename -- internal rerun file path
    fs.statSync(RERUN).size > 0; // eslint-disable-line security/detect-non-literal-fs-filename -- internal rerun file path
  const FEATURE_GLOB = useRerun ? RERUN : NON_RERUN_GLOB;
  const FORMAT_OPTIONS = {
    snippetInterface: 'async-await',
  };
  // `--import`, not `--require`: the step definitions are native ESM now, and
  // `--require` loads through CommonJS. It does not error on an ESM file — it
  // finds no step definitions and the run reports zero scenarios, green.
  // The @babel/register + @babel/polyfill require-modules are gone with Babel.
  const IMPORT_GLOB = 'test/js/**/*.js';
  const BASE_CONFIG = `${FEATURE_GLOB} --format-options '${JSON.stringify(
    FORMAT_OPTIONS,
  )}' --import '${IMPORT_GLOB}' ${NO_STRICT} --format rerun:${RERUN} --format json:test-results/${profile}/results.cucumber ${FAIL_FAST}`;
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

// PROFILE MAP, and the shape is not interchangeable with the CommonJS one.
//
// Under `module.exports = { default, rest2, cli2 }` cucumber read that object as
// the profile map. Under ESM it reads the DEFAULT EXPORT as the default
// profile's own options, and takes every other profile from a NAMED export. Get
// this wrong and the failure is silent in the worst way: `-p rest2` at least
// errors with "Requested profile doesn't exist", but `-p default` matches
// cucumber's own built-in empty default and reports
//
//     0 scenarios / 0 steps       exit 0
//
// — a green run that executed nothing. Measured during the ESM migration; the
// three profiles were passing 37 / 38 / 33 scenarios before it and reported 0
// after, with a zero exit code, until the export shape was corrected.
export default generateConfig('nodejs');
export const rest2 = generateConfig('rest2');
export const cli2 = generateConfig('cli2');
