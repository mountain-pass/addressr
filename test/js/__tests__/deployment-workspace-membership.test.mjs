// The deployment package must stay inside the npm workspace, or the ADR-045
// arming mechanism dies silently.
//
// WHY THIS EXISTS. `changeset version` bumps `@mountainpass/addressr-deployment`
// only while changesets can SEE it, and changesets sees it only because a root
// `workspaces` glob matches its directory. ADR-045 makes that bump the thing
// that arms a production Terraform apply. So if the glob stops matching — a
// directory move that forgets to update it, someone "tidying" the globs, the
// package landing outside both — then infrastructure changes stop reaching
// production, on a green run, in every tier. Nothing else in the suite asserts
// this.
//
// It is not hypothetical: the package moved twice on 2026-08-10, `deploy/` ->
// `packages/deployment` -> `apps/addressr-deployment`, and the second move
// required adding `apps/*` to a glob list that had only ever held `packages/*`.
//
// HONEST LIMIT. This asserts workspace MEMBERSHIP and changesets VISIBILITY. It
// does not assert that the cascade itself is CONFIGURED — that the dep pin is
// exact and tracks the app, that `updateInternalDependencies` is `"patch"`, that
// no `fixed`/`linked` group regroups the packages — which is ADR-045's
// confirmation criterion 4, discharged by `deployment-cascade-pin.test.mjs`. The
// two together are what make an app changeset bump this package; either alone is
// insufficient.
//
// THE OVERLAP WITH THAT FILE IS DELIBERATE. DO NOT "DE-DUPLICATE" IT.
// `ignore` and `private` are asserted in BOTH files, because they break both
// properties at once — an ignored or published package is simultaneously
// invisible to the cascade and wrong as a workspace member. ADR-045 criterion 4
// and ADR-046 criterion 1 each name them independently, so deleting either copy
// leaves one ADR criterion literally undischarged. An earlier version of this
// paragraph described a clean split between the two files; it was inaccurate the
// day it was written, and a reader who believed it would have deleted a copy.
//
// Note the two files assert `ignore` at DIFFERENT strengths on purpose. This one
// checks the deployment package is not a member; the cascade file asserts the
// list is EMPTY, because `ignore` accepts glob patterns and a membership check
// returns false for `"@mountainpass/*"` while the package is in fact ignored.
// The stronger form lives there; this one is the weaker sibling and is not the
// guard against globs.
//
// MUTATION-PROVED 2026-08-10, run rather than claimed: setting
// `packages/addressr`'s `private` to `true` turns this file RED. The other
// assertions here predate that convention and are NOT mutation-proved — do not
// read this note as covering them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => JSON.parse(readFileSync(`${repoRoot}${p}`, 'utf8'));

const DEPLOYMENT_DIR = 'apps/addressr-deployment';
const DEPLOYMENT_PKG = '@mountainpass/addressr-deployment';

const root = read('package.json');
const changesetConfig = read('.changeset/config.json');

// Anti-vacuity: if the directory is not there, every assertion below would be
// reasoning about a package that does not exist. Fail loudly instead.
const manifestPath = `${DEPLOYMENT_DIR}/package.json`;
assert.ok(
  existsSync(`${repoRoot}${manifestPath}`),
  `${manifestPath} must exist — this test guards nothing otherwise`,
);
const deployment = read(manifestPath);

// Turn ["packages/*", "apps/*"] into a predicate. Only the single trailing-star
// form is supported, which is all npm workspaces uses here; anything else
// should fail loudly rather than be silently treated as a non-match.
const globMatches = (glob, dir) => {
  assert.match(
    glob,
    /^[^*]+\/\*$|^[^*]+$/,
    `unsupported workspaces glob shape "${glob}" — this test cannot evaluate it, ` +
      `so it would silently under-report membership`,
  );
  return glob.endsWith('/*')
    ? dir.startsWith(glob.slice(0, -1)) &&
        !dir.slice(glob.length - 1).includes('/')
    : dir === glob;
};

describe('the deployment package is inside the npm workspace (ADR-045 arming)', () => {
  it('the manifest is the package ADR-045 names', () => {
    assert.equal(deployment.name, DEPLOYMENT_PKG);
  });

  it('a root workspaces glob matches its directory', () => {
    const globs = root.workspaces ?? [];
    const matching = globs.filter((g) => globMatches(g, DEPLOYMENT_DIR));
    assert.ok(
      matching.length > 0,
      `no root workspaces glob matches ${DEPLOYMENT_DIR} — changesets cannot ` +
        `see the package, so no changeset can bump it and no infrastructure ` +
        `change can reach production. Globs present: ${JSON.stringify(globs)}`,
    );
  });

  it('changesets does not ignore it', () => {
    assert.ok(
      !(changesetConfig.ignore ?? []).includes(DEPLOYMENT_PKG),
      `${DEPLOYMENT_PKG} is in .changeset/config.json "ignore" — changeset ` +
        `version will skip it and the ADR-045 gate can never arm`,
    );
  });

  it('it stays private, so changeset publish skips it while version bumps it', () => {
    // `private: true` is what lets the package carry a changesets version line
    // without being published to the registry. Flip it and every release
    // publishes the Terraform stack as a public package.
    assert.equal(deployment.private, true);
  });

  it('the published app is NOT in the same tree — packages/* is distributable', () => {
    // ADR-046's rule, pinned so a future "tidy" cannot collapse apps/ and
    // packages/ back together and take the distinction with it.
    assert.ok(
      existsSync(`${repoRoot}packages/addressr/package.json`),
      'packages/addressr must remain the distributable package',
    );
    assert.equal(read('packages/addressr/package.json').name, '@mountainpass/addressr');
    // ...and it must remain PUBLISHABLE. `resolve-version.sh` resolves the
    // version to deploy with `npm view` against this package's name, so a
    // private app package leaves the deploy path with nothing to resolve and
    // fails closed — loudly, but for a reason nobody would look for here.
    // `notEqual(..., true)` rather than `equal(..., false)` on purpose: the
    // manifest carries no `private` key at all (it uses `publishConfig.access`),
    // and absent is as correct as explicit false.
    //
    // This is ADR-046 criterion 4 ("no `packages/*` entry is private") landing
    // early for the one entry that exists. That criterion says it should become
    // an assertion "when a third arrives"; the coupling to resolve-version.sh
    // makes it worth having now for this package specifically.
    assert.notEqual(
      read('packages/addressr/package.json').private,
      true,
      'packages/addressr must stay publishable — resolve-version.sh reads the ' +
        'registry for the version the deployment manifest pins',
    );
  });
});

// ---------------------------------------------------------------------------
// ADR-046 Confirmation criterion 4, converted from inspection to assertion.
//
// The criterion says the polarity check "should become an assertion WHEN A
// THIRD ARRIVES". `apps/website` is the third workspace entry (ADR-053), so it
// is due now. Above, the same rule is asserted for the two entries that existed
// individually; this block generalises it so a FOURTH entry is covered the day
// it lands rather than the day someone remembers.
//
// IT IS TWO OPPOSITE ASSERTIONS, and that is the whole subtlety. Copying the
// `notEqual(private, true)` nuance to both globs would assert that apps/website
// is NOT private — the inverse of the rule, and in direct contradiction with
// the deployment assertion above. Each glob gets its own direction:
//
//   packages/*  MUST be publishable  -> notEqual(private, true)
//               (absent key is as correct as explicit false; see :128-140)
//   apps/*      MUST be private      -> equal(private, true)
//               (an app published to the registry is the thing ADR-046's
//                distributable/deployed split exists to prevent)
describe('ADR-046 criterion 4 — packages/* publishable, apps/* private', () => {
  const manifests = (glob) => {
    const dir = `${repoRoot}${glob}`;
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${glob}/${e.name}/package.json`)
      .filter((rel) => existsSync(`${repoRoot}${rel}`));
  };

  it('finds entries under BOTH globs, so a zero-match pass is impossible', () => {
    // Without this, a rename of packages/ or apps/ would empty the corpus and
    // both assertions below would pass having examined nothing — the exact
    // zero-match class this repo has been bitten by before.
    assert.ok(manifests('packages').length > 0, 'no packages/* manifests found');
    assert.ok(manifests('apps').length > 0, 'no apps/* manifests found');
  });

  it('no packages/* entry is private', () => {
    for (const rel of manifests('packages')) {
      assert.notEqual(
        read(rel).private,
        true,
        `${rel} is private — packages/* is the DISTRIBUTABLE tree (ADR-046). ` +
          `A private package here publishes nothing and any consumer resolving ` +
          `it from the registry fails closed.`,
      );
    }
  });

  it('no apps/* entry is publishable', () => {
    for (const rel of manifests('apps')) {
      assert.equal(
        read(rel).private,
        true,
        `${rel} is not private — apps/* is the DEPLOYED tree (ADR-046). ` +
          `Without private:true, changeset publish pushes our own deployment ` +
          `or website source to the public registry.`,
      );
    }
  });
});
