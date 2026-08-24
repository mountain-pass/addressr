#!/usr/bin/env node
// Fail loudly when a glob-driven test tier matches nothing.
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
// `pretest:js` and `pretest:credentials` rather than written as another
// .test.mjs file. Placement follows scripts/check-not-cli2-tags.mjs and
// scripts/check-gnaf-source.mjs.
//
// IT READS THE GLOBS, IT DOES NOT RESTATE THEM — and that is the 2026-08-24
// rewrite. Two earlier versions hardcoded a list of directories. That made the
// file's own headline false in a way a risk review had to catch: a tier could
// be silently disabled by NARROWING ITS GLOB, with the guard still green. The
// measured proof, before the fix: editing `test:website` from two globs to one
// left this script reporting six healthy tiers and exiting 0 while two of the
// three website test files stopped running. A guard against glob/target drift
// that carried six hand-maintained copies of its own targets.
//
// So the directories are DERIVED from `package.json`, and the only thing kept
// by hand is a floor per directory. The check is bidirectional, which is what
// closes the narrowing hole:
//
//   - every directory a `node --test` script globs must have a floor here
//     (a new tier cannot be added unfloored), and
//   - every floor here must still be globbed by the script it names
//     (a glob cannot be narrowed without this failing).
//
// A FLOOR, NOT AN EXACT COUNT, and not a growth tracker. This was got wrong
// twice. The unit floor was 30 against 36 files, described as "six files of
// headroom"; the tier grew to 63 and the floor did not move, so the slack had
// silently become 33. The first correction raised it to 50 — which fixed the
// number and kept the mistake, because 50 rots again past ~66 and false-reds on
// ordinary consolidation. The purpose stated here is the zero-match failure:
// high enough that "the glob broke" cannot pass, low enough that legitimate
// pruning does not false-red. Small constants serve that. "Half the tier
// disappeared" is a real but DIFFERENT risk and wants a different control.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));

// The ONLY hand-maintained data: how few files is too few, per globbed
// directory. Keys are repo-relative directories, matching what the globs
// resolve to. Every one is a zero-match floor, deliberately small.
//
// `test/mcp/smoke.test.mjs` is absent because `test:mcp:smoke` names a LITERAL
// path rather than a glob, so a missing file makes `node --test` exit non-zero
// on its own. It has no zero-match exposure to floor, and the derivation below
// skips non-glob arguments for the same reason.
const FLOORS = {
  'test/js/__tests__': 5,
  'test/integration': 1,
  'test/credentials': 1,
  'test/precommit': 1,
  'apps/website/test': 1,
  'apps/website/test/__tests__': 1,
};

/**
 * Every `node --test` glob in package.json, as [script, dir, basenamePattern].
 *
 * BOTH AXES, and the second one is a correction. An earlier version returned
 * only the directory — `path.posix.dirname(token)` — and then matched files
 * with a hardcoded `.endsWith('.test.mjs')`. That closed directory-level
 * narrowing and left filename-level narrowing wide open: `*.test.js` (an
 * extension typo) or `*-workflow.test.mjs` (a deliberate narrowing) both keep
 * the dirname, keep the file count, and run zero tests while this script
 * reports the tier healthy. The header claimed the globs were read, not
 * restated; that was true of one half of each glob.
 */
const globbedDirs = () => {
  const found = [];
  for (const [script, body] of Object.entries(pkg.scripts ?? {})) {
    if (!body.includes('node --test')) continue;
    for (const token of body.split(/\s+/)) {
      // Only glob arguments: a literal path cannot silently match nothing.
      if (!token.includes('*')) continue;
      found.push([script, path.posix.dirname(token), path.posix.basename(token)]);
    }
  }
  return found;
};

/**
 * `*.test.mjs` → a matcher. `*` is the only wildcard; every other character is
 * literal.
 *
 * NO REGEX, and that is the point rather than a style preference. This was a
 * `new RegExp` built by escaping the pattern and substituting `.*` for `*`. It
 * worked, and it carried two costs a risk review made me price properly:
 *
 *   1. `?` was not escaped, so a basename containing one became a quantifier
 *      and OVER-matched — `foo?.test.mjs` matching `fo.test.mjs`. A correctness
 *      hole in a guard, which I had annotated rather than closed.
 *   2. It tripped `security/detect-non-literal-regexp`, and the suppression I
 *      wrote for it went wrong three times: first inert (the directive sat at
 *      the top of a multi-line comment, so it landed on another comment), then
 *      deleted on a false premise, then restored with a justification that
 *      mis-cited P131 and contradicted itself.
 *
 * Splitting on `*` removes both at once. No escaping means no escaping bug, and
 * no dynamic RegExp means no rule to suppress and nothing to justify. The fix
 * that deletes the argument beats the fix that wins it.
 */
const matcherFor = (pattern) => {
  const parts = pattern.split('*');
  if (parts.length === 1) return (name) => name === pattern;
  const [first] = parts;
  const last = parts.at(-1);
  return (name) => {
    if (name.length < first.length + last.length) return false;
    if (!name.startsWith(first) || !name.endsWith(last)) return false;
    let cursor = first.length;
    for (const middle of parts.slice(1, -1)) {
      const at = name.indexOf(middle, cursor);
      if (at === -1) return false;
      cursor = at + middle.length;
    }
    return cursor <= name.length - last.length;
  };
};

const derived = globbedDirs();
let failed = false;

// THE FLOOR ON THE DERIVATION ITSELF. Without it, a change to how package.json
// stores scripts makes this loop find nothing and the whole check passes having
// examined no tier at all — the exact class it exists to catch, one level up.
if (derived.length < 5) {
  console.error(
    `assert-test-files: only ${derived.length} \`node --test\` globs found in package.json.`,
  );
  console.error(
    'assert-test-files: this script derives its targets from those scripts, so',
  );
  console.error(
    'finding almost none means the derivation is broken, not that the tiers are gone.',
  );
  process.exit(1);
}

// 1. Every globbed directory must be floored. Catches a new tier added with no
//    guard — the state `test:credentials` itself was in when it was written.
for (const [script, dir] of derived) {
  if (!(dir in FLOORS)) {
    console.error(
      `assert-test-files: \`${script}\` globs ${dir}/ but no floor is declared for it.`,
    );
    console.error(
      'assert-test-files: add it to FLOORS. A tier with no floor can silently match nothing.',
    );
    failed = true;
  }
}

// 2. Every floor must still be globbed. THIS is what catches glob NARROWING:
//    drop a pattern from a multi-glob script and its directory stops appearing
//    here, so the tier would quietly stop running.
const derivedDirs = new Set(derived.map(([, dir]) => dir));
for (const dir of Object.keys(FLOORS)) {
  if (!derivedDirs.has(dir)) {
    console.error(
      `assert-test-files: a floor is declared for ${dir}/ but NO \`node --test\` script globs it.`,
    );
    console.error(
      'assert-test-files: either a glob was narrowed — in which case that tier has silently',
    );
    console.error(
      'stopped running — or the tier was retired and this floor should go with it.',
    );
    failed = true;
  }
}

// 3. Every floored directory must hold at least its floor — counted with the
//    glob's OWN basename pattern, not a hardcoded suffix, so an extension typo
//    or an in-directory narrowing reds here instead of passing.
for (const [dir, floor] of Object.entries(FLOORS)) {
  const abs = path.join(REPO, dir);
  const patterns = derived.filter(([, d]) => d === dir).map(([, , p]) => p);
  const matches = patterns.map((p) => matcherFor(p));
  let files = [];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- `abs` is
    // path.join(REPO, dir) where dir is a key of the FLOORS literal above. Named
    // `abs` rather than `dir` because the reason should name the argument actually
    // passed. The structurally identical unsuppressed site is the readFileSync at
    // the top of this file; both are benign for the same reason and only one was
    // annotated, which is the ad-hoc-suppression pattern P084 exists to triage.
    files = readdirSync(abs).filter((f) => matches.some((m) => m(f)));
  } catch (error) {
    console.error(`assert-test-files: cannot read ${abs} — ${error.message}`);
    console.error(
      `assert-test-files: the ${dir}/ tier would run ZERO tests and exit 0. Refusing.`,
    );
    failed = true;
    continue;
  }

  if (files.length < floor) {
    console.error(
      `assert-test-files: found ${files.length} files matching ${patterns.join(' or ')} in ${dir}/, expected at least ${floor}.`,
    );
    console.error(
      'assert-test-files: `node --test` exits 0 when its glob matches nothing, so this would',
    );
    console.error(
      `have been a GREEN run with the ${dir}/ tier never executed.`,
    );
    failed = true;
    continue;
  }

  console.log(
    `assert-test-files: ${files.length} in ${dir}/ matching ${patterns.join(' or ')} (floor ${floor}).`,
  );
}

// Every tier is reported before exiting, so one broken glob does not hide a
// second one behind it.
if (failed) process.exit(1);
