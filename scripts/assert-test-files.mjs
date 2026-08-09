// Fail loudly when the unit-tier glob matches nothing.
//
// WHY THIS EXISTS, measured rather than imagined. `test:js` is
// `node --test test/js/__tests__/*.test.mjs`, and that glob is CWD-RELATIVE.
// A dry-run of the packages/addressr migration (2026-08-10) moved the tree and
// then ran it: `tests 0 / pass 0 / fail 0`, EXIT CODE 0. The entire unit tier
// vanished — every governance fence, the R028 register invariants, the
// release-workflow pins, the guard that keeps the retired deploy/** push axis
// from returning — and pre-commit, the `engine-floor` job and release.yml's
// "Workflow and unit pins" step would all have stayed GREEN.
//
// This is the shape ADR-044 records for the cucumber tier (a zero-match profile
// reports `0 scenarios / 0 steps` and exits 0) reappearing in the UNIT tier,
// which is where the pins that guard everything else live. A safety net that
// silently unhooks itself is worse than none, because the green run reads as
// evidence.
//
// NOT A TEST INSIDE THE SUITE, and this is the whole point: a test in
// test/js/__tests__/ cannot detect that test/js/__tests__/ did not run. The
// check has to sit OUTSIDE the thing it checks, which is why it is wired into
// `pretest:js` rather than written as another .test.mjs file. Placement follows
// scripts/check-not-cli2-tags.mjs and scripts/check-gnaf-source.mjs.
//
// A FLOOR, NOT AN EXACT COUNT. An exact count reddens on every new test file
// and trains people to bump it without reading. The floor only has to be high
// enough that "the glob broke" cannot pass, and low enough that legitimate
// pruning does not false-red. It counts FILES, not assertions, because the
// failure being caught is the glob matching nothing — assertion coverage is a
// different question, answered by the suite itself.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../test/js/__tests__/', import.meta.url));
// 30 against 36 present on 2026-08-10: six files of headroom for pruning, and
// no headroom at all for the glob silently resolving to nothing.
const FLOOR = 30;

let files = [];
try {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path derived from import.meta.url
  files = readdirSync(DIR).filter((f) => f.endsWith('.test.mjs'));
} catch (error) {
  console.error(`assert-test-files: cannot read ${DIR} — ${error.message}`);
  console.error(
    'assert-test-files: the unit tier would run ZERO tests and exit 0. Refusing.',
  );
  process.exit(1);
}

if (files.length < FLOOR) {
  console.error(
    `assert-test-files: found ${files.length} unit test files in ${DIR}, expected at least ${FLOOR}.`,
  );
  console.error(
    'assert-test-files: `node --test` exits 0 when its glob matches nothing, so this would',
  );
  console.error(
    'have been a GREEN run with the whole unit tier — and every governance fence in it — never executed.',
  );
  console.error(
    'If the tier legitimately moved, repoint BOTH the test:js glob and this check together.',
  );
  process.exit(1);
}

console.log(
  `assert-test-files: ${files.length} unit test files (floor ${FLOOR}).`,
);
