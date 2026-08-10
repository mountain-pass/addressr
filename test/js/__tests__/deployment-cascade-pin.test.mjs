// The changesets cascade that makes an app changeset bump the deployment
// package — and therefore arm a production Terraform apply.
//
// WHY THIS EXISTS. ADR-045 makes a version bump of
// `@mountainpass/addressr-deployment` the thing that arms a production apply.
// Several independent settings must hold for an app changeset to produce that
// bump, and every one of them is a plausible "tidy-up" target. Break any one and
// infrastructure changes stop reaching production **on a green run, in every
// tier** — no error, no failing test, no diff to notice. ADR-045 names this file
// as confirmation criterion 4.
//
// WHAT EACH SETTING DOES, and how it fails:
//
//   updateInternalDependencies: "patch"  — the cascade switch. "patch" is the
//     WIDEST setting: patch, minor and major app bumps all cascade. Narrow it to
//     "minor" and patch-level app changesets — the commonest kind — silently
//     stop bumping the deployment package.
//   an EXACT dep pin on @mountainpass/addressr — changesets only rewrites, and
//     therefore only bumps on, a PINNED internal dependency. A range, `*`, or
//     `workspace:*` all read as already-satisfied: nothing is rewritten, nothing
//     bumps.
//   ignore: []  — an entry here makes `changeset version` skip the package
//     entirely, so no changeset of any kind can arm a deploy.
//   private: true on the deployment package — what lets `changeset version` bump
//     it while `changeset publish` skips it. Flip it and every release publishes
//     our production Terraform stack to the public registry.
//   fixed: [] / linked: []  — a group containing either workspace package
//     changes what a deployment version bump MEANS. ADR-045's own reassessment
//     criteria name this ("a linked or fixed package group"), and it slips past
//     every other assertion here.
//
// MUTATION-PROVED. Each mutation below was applied to the working tree, this
// file was run, and the observed result recorded. One mutation per assertion —
// an assertion whose mutation was never run is an assertion of unknown reach.
//
//   updateInternalDependencies -> "minor"                       RED
//   dep pin -> "^3.3.0"                                         RED
//   dep pin -> "workspace:*"                                    RED
//   dep pin -> "*"                                              RED
//   dep pin -> "3.2.9" (exact but stale vs packages/addressr)   RED
//   ignore -> ["@mountainpass/addressr-deployment"]             RED
//   ignore -> ["@mountainpass/*"] (GLOB — the .includes() hole) RED
//   linked -> [["@mountainpass/addressr", "...-deployment"]]    RED
//   deployment private -> false                                 RED
//
// The glob mutation is the one worth noting: `ignore` accepts glob patterns, so
// an `.includes()` check would return false for `"@mountainpass/*"` and stay
// GREEN while the package is ignored. Asserting emptiness closes that; a
// membership check does not.
//
// DIVISION OF LABOUR — cross-referenced deliberately, and the overlap is NOT
// redundant. `deployment-workspace-membership.test.mjs` asserts the package is
// INSIDE the workspace (a root glob matches it); without that, changesets cannot
// see it at all. This file asserts that, being visible, it is CONFIGURED to
// cascade. Both are required. The two overlap on `ignore` and `private` because
// those break BOTH properties at once, and because ADR-045 criterion 4 and
// ADR-046 criterion 1 each name them — deleting either copy leaves one ADR
// criterion literally undischarged. Do not "de-duplicate" them.
//
// HONEST LIMIT. This asserts CONFIGURATION, not behaviour. It does not run
// `changeset version` and observe a bump. A changesets major that redefined
// `updateInternalDependencies` would satisfy every assertion here and still
// break the cascade; the declared `^2.26.2` range cannot cross to 3.x, so that
// re-probe stays a deliberate act rather than a silent drift.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => JSON.parse(readFileSync(`${repoRoot}${p}`, 'utf8'));

const APP_PKG = '@mountainpass/addressr';
const DEPLOYMENT_PKG = '@mountainpass/addressr-deployment';
const DEPLOYMENT_MANIFEST = 'apps/addressr-deployment/package.json';
const APP_MANIFEST = 'packages/addressr/package.json';

const changesetConfig = read('.changeset/config.json');
const deployment = read(DEPLOYMENT_MANIFEST);
const app = read(APP_MANIFEST);

// Anti-vacuity. Every assertion below reasons about a relationship between two
// named packages. If either manifest is not the package this file thinks it is,
// the assertions pass while guarding nothing.
assert.equal(
  deployment.name,
  DEPLOYMENT_PKG,
  `${DEPLOYMENT_MANIFEST} must be ${DEPLOYMENT_PKG} — otherwise this test guards nothing`,
);
assert.equal(
  app.name,
  APP_PKG,
  `${APP_MANIFEST} must be ${APP_PKG} — otherwise the cascade source is not what this checks`,
);

describe('the changesets cascade that arms a production apply (ADR-045 criterion 4)', () => {
  it('updateInternalDependencies is "patch", the widest cascade setting', () => {
    assert.equal(
      changesetConfig.updateInternalDependencies,
      'patch',
      'must be "patch": a narrower setting silently stops lower-severity app ' +
        'changesets cascading, so infra rides only some releases and nobody is told which',
    );
  });

  it('the dependency on the app is an EXACT version, not a range', () => {
    const pin = deployment.dependencies?.[APP_PKG];
    assert.ok(pin, `${DEPLOYMENT_MANIFEST} must depend on ${APP_PKG}`);
    // Rejected shape by shape rather than with one regex, so a failure names
    // which form was found. `workspace:*` is called out because npm workspaces
    // accepts it and it is the likeliest well-intentioned tidy-up.
    assert.ok(
      !pin.startsWith('workspace:'),
      `the pin is "${pin}": a workspace protocol is already-satisfied, so ` +
        'changesets rewrites nothing and no bump cascades',
    );
    assert.ok(
      !/^[\^~><*]|\s|\|\||^$/.test(pin),
      `the pin is "${pin}": a range or wildcard is already-satisfied, so ` +
        'changesets rewrites nothing and no bump cascades',
    );
    // Permissive about prerelease/build metadata on purpose. The load-bearing
    // property is "changesets treats this as a pinned internal dependency", not
    // "three dot-separated integers" — a criterion that would red on a
    // legitimate 3.4.0-rc.1 is worse than no criterion at all.
    assert.match(
      pin,
      /^\d+\.\d+\.\d+(?:[-+].+)?$/,
      `the pin is "${pin}": it must be an exact version`,
    );
  });

  it('the pin tracks the app package, so it cannot be exact-but-stale', () => {
    // The regex above accepts any exact version, including one that has drifted
    // from packages/addressr. Drift is the strongest form of the silent-green
    // failure this file exists for: the cascade has stopped running and every
    // other assertion here stays green.
    //
    // Safe to assert equality because `changeset version` rewrites BOTH the app
    // version and this pin in one command, so the normal path has no committed
    // intermediate where they differ — including under `changeset pre`.
    //
    // THE ONE STATE THAT REDS LEGITIMATELY: a hand-bumped app version, which
    // this repo does reach during swallowed-publish recovery (the P044 / P095
    // class). If you are here mid-recovery, this is not telling you the tree is
    // corrupt — running `changeset version` restores the equality, or edit the
    // pin to match. The failure message prints both values so the fix is one
    // read. Deliberately kept loud rather than relaxed: a rare, instantly
    // diagnosable block beats the silent failure it catches.
    //
    // deploy.sh writes its OWN manifest from resolve-version.sh at deploy time,
    // so the in-repo pin never decides what EB installs — its only jobs are
    // arming the cascade and workspace linking.
    assert.equal(
      deployment.dependencies?.[APP_PKG],
      app.version,
      `the pin (${deployment.dependencies?.[APP_PKG]}) has drifted from ` +
        `${APP_MANIFEST} (${app.version}) — changesets rewrites this on every ` +
        'cascade, so a mismatch means the cascade has stopped running',
    );
  });

  it('the changesets ignore list is EMPTY, not merely lacking this package', () => {
    // Emptiness, deliberately, rather than a membership check. `ignore` accepts
    // GLOB patterns, so `"@mountainpass/*"` would ignore the deployment package
    // while `.includes(DEPLOYMENT_PKG)` returns false and the test stays green —
    // production deploys silently stop arming. Mutation-proved above.
    assert.deepEqual(
      changesetConfig.ignore ?? [],
      [],
      'ignore must be empty: an entry — including a glob that matches without ' +
        'naming it — makes changeset version skip the deployment package, so no ' +
        'changeset of any kind can arm a production apply',
    );
  });

  it('no fixed or linked group contains either workspace package', () => {
    // ADR-045's reassessment criteria name this directly: a linked or fixed
    // group "would move what a deployment version bump means". It slips past
    // every other assertion here.
    for (const key of ['fixed', 'linked']) {
      for (const group of changesetConfig[key] ?? []) {
        for (const member of group) {
          assert.ok(
            member !== APP_PKG && member !== DEPLOYMENT_PKG,
            `${key} contains a group naming ${member}: grouping changes what a ` +
              'deployment version bump means, which is a deliberate cascade change ' +
              'and an ADR-045 reassessment trigger',
          );
        }
      }
    }
  });

  it('the deployment package stays private', () => {
    // What makes the whole arrangement work: `changeset version` bumps a private
    // package, `changeset publish` skips it. Flip it and the Terraform stack —
    // including the module layout of our production infrastructure — publishes
    // to the public registry on the next release.
    assert.equal(
      deployment.private,
      true,
      'private must be true: changeset publish would otherwise push the ' +
        'deployment package to the registry on every release',
    );
  });
});
