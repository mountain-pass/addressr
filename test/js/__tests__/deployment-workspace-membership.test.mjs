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
// does not assert that the cascade itself is configured — that the dep pin is
// exact and `updateInternalDependencies` is `"patch"` — which is ADR-045's
// separate confirmation criterion 4 and belongs in its own file. The two
// together are what make an app changeset bump this package; either alone is
// insufficient. Cross-referenced deliberately so neither is mistaken for the
// whole guard.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
  });
});
