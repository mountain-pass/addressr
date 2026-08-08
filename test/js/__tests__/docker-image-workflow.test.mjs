// ADR-040 stage 2: pin the publish gates in .github/workflows/docker-image.yml.
//
// NOT in scope for P033 (source-inspection tests are an anti-pattern), for the
// same reason its sibling release-workflow-deploy-only.test.mjs is not: a
// workflow `if:` expression has no executable local surface. The declaration IS
// the artefact, and GitHub evaluates that exact string. Exact-string pinning is
// the point here, not a smell. Do not delete this file in a P033 sweep.
//
// Why it earns its keep: every failure mode here is SILENT-GREEN. A publish gate
// that never fires, a publish gate that fires on a pull request, a boolean input
// compared against a quoted 'true' (GitHub coerces mismatched operands to number,
// so `true == 'true'` is `1 == NaN` => false), or a DOCKER_PUBLISH_SEMVER that
// disagrees between the build and the push — none of them turn a run red. They
// either publish something that should not have been published, or quietly
// publish nothing while reporting success.
//
// STAGE 3 RECONCILIATION — do not delete this note. Stage 3 wires release.yml to
// invoke this workflow with publish_semver: true. A changesets release commit
// touches package.json, so while package.json sat in this workflow's own push
// path filter the same commit would have published the image TWICE and
// re-pointed the supposedly immutable :<version>-<gitsha>. Of the four options
// the ADR-040 stage-2 amendment enumerated, the user pinned **option C**: drop
// package.json / package-lock.json from the PUSH filter while keeping them on
// the PULL_REQUEST filter. That dissolves the collision for every commit
// changesets/action authors — a release commit no longer matches the push
// filter at all, so release.yml is the sole publisher on that commit — while
// leaving PR-time build verification of a dependency bump intact.
//
// The asymmetry between the two filters IS the guard, which makes it a prime
// candidate for a well-meaning "these two lists have drifted, let's re-sync
// them" tidy-up. `pins option C` below is what makes that tidy-up red instead
// of a silent double publish.
//
// Known limitation (accepted): these assertions pin the gate strings, the step
// ordering, and the two path filters, not GitHub's evaluation of them. A publish
// path added in a second job, or a `docker push` reached through a script this
// file does not name, would not be caught.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = readFileSync(
  fileURLToPath(
    new URL('../../../.github/workflows/docker-image.yml', import.meta.url),
  ),
  'utf8',
);

const PUBLISH_GATE =
  "        if: github.event_name != 'pull_request' && github.ref == 'refs/heads/master'";

const lineOf = (needle) => {
  const index = raw.split('\n').findIndex((l) => l.includes(needle));
  assert.notEqual(index, -1, `expected to find ${needle}`);
  return index;
};

// Extract one top-level trigger's `paths:` list from the `on:` block.
//
// STILL a hand-rolled slicer, but the reason has changed and the old one is
// withdrawn (P033, 2026-08-08). This previously cited the sibling
// release-workflow-deploy-only.test.mjs header "for why a second interpreter is
// a downgrade here", and claimed js-yaml was "only transitively present via
// @changesets/cli". Both are false: `js-yaml` is a DECLARED devDependency, and
// that sibling header has been rescinded — it now parses, along with
// terraform-plan-workflow.test.mjs and loader-workflow.test.mjs.
//
// What keeps this one text-based is narrower and is scheduled, not principled:
// this file guards the ADR-040 stage-3 double-publish property via the
// push/pull_request filter asymmetry, and stage 3 is still open (several
// unticked Confirmation criteria). Converting the instrument that guards a
// property while that property is still landing is the wrong order. Convert it
// once stage 3 is ticked — tracked on P033.
//
// Meanwhile the slicer stays honest about being a WEAKER interpreter than a
// parser, so it asserts its own preconditions: exactly one opener at the
// expected indent, and a non-empty result. Otherwise a reorder or a reformat
// yields an empty list and every `does not contain` assertion below passes
// vacuously — the silent-green class this whole file exists to catch. Note the
// sibling's own reorder defect, measured when it converted: its `on:` slice was
// bounded by `indexOf('\n  pull_request:')`, so swapping the two trigger blocks
// — no behaviour change — made it read the wrong list. The preconditions below
// are what stop the same thing happening here.
//
// Comment lines are stripped, not just ignored: both filters carry prose that
// NAMES the files the other one filters on, so a raw line scan would find
// 'package.json' in the push block's own explanation of why it is absent.
const pathsOf = (name) => {
  const lines = raw.split('\n');
  const openers = lines.filter((l) => l === `  ${name}:`);
  assert.equal(openers.length, 1, `expected exactly one '  ${name}:' opener`);
  const start = lines.indexOf(`  ${name}:`);
  let end = start + 1;
  while (end < lines.length && !/^ {2}\S/.test(lines[end])) end += 1;
  const paths = lines
    .slice(start + 1, end)
    .filter((l) => /^ {6}- '.+'$/.test(l))
    .map((l) => l.trim().replace(/^- '|'$/g, ''));
  assert.ok(paths.length > 0, `'${name}:' paths list sliced empty`);
  return paths;
};

describe('docker-image.yml — ADR-040 stage 2 publisher', () => {
  it('is callable as a reusable workflow with a boolean publish_semver input', () => {
    assert.ok(raw.includes('  workflow_call:'));
    assert.ok(raw.includes('      publish_semver:'));
    assert.ok(raw.includes('        type: boolean'));
    assert.ok(raw.includes('        default: false'));
  });

  it('pins option C: package manifests are on the pull_request filter and NOT the push filter', () => {
    // ADR-040 stage 3. The two filters are near-identical by design, so a bare
    // raw.includes('package.json') proves nothing — each half is sliced and
    // asserted separately.
    const push = pathsOf('push');
    const pullRequest = pathsOf('pull_request');

    // Positive preconditions first: if the slicer found the wrong region, these
    // fail loudly rather than letting the absence assertions pass on an empty
    // or mis-sliced list.
    for (const paths of [push, pullRequest]) {
      assert.ok(paths.includes('Dockerfile'));
      assert.ok(paths.includes('.dockerignore.tmpl'));
      assert.ok(paths.includes('.github/workflows/docker-image.yml'));
    }

    // The guard itself. A changesets release commit touches package.json; with
    // it on the PUSH filter that one commit fires both this workflow's push
    // trigger and release.yml's workflow_call, publishing twice and re-pointing
    // the immutable :<version>-<gitsha>.
    assert.ok(!push.includes('package.json'));
    assert.ok(!push.includes('package-lock.json'));

    // Kept on the pull_request filter: a dependency bump must still have the
    // image BUILT and smoke-tested before it can merge. PRs never publish.
    assert.ok(pullRequest.includes('package.json'));
    assert.ok(pullRequest.includes('package-lock.json'));
  });

  it('never compares publish_semver against the string "true"', () => {
    // `true == 'true'` is `1 == NaN` => false. A gate written that way never
    // fires and the run stays green with the bare :<semver> silently unpushed.
    assert.doesNotMatch(raw, /publish_semver\s*[!=]=\s*'true'/);
  });

  it('grants packages: write so the GHCR push authenticates via GITHUB_TOKEN', () => {
    // GHCR push needs packages: write on the token; contents: read is retained
    // for the checkout. No Docker Hub credentials exist any more.
    assert.match(raw, /permissions:\n\s+contents: read\n\s+packages: write/);
    assert.doesNotMatch(raw, /DOCKER_ID_USER|DOCKER_ID_PASS/);
  });

  it('gates the publish step on master and never on a pull request', () => {
    // Two independent conjuncts. On a same-repo pull request the secrets ARE
    // available, so secret presence alone is not a guard; and on a
    // pull_request event github.ref is refs/pull/N/merge, so either conjunct
    // alone would block it. Both are pinned so neither can be dropped as
    // redundant.
    assert.ok(raw.split('\n').includes(PUBLISH_GATE));
  });

  it('passes the built-in GITHUB_TOKEN + actor to the publish step', () => {
    // GHCR auth is the always-present GITHUB_TOKEN, so there is no
    // skip-when-secret-absent branch any more — the master/not-PR gate carries
    // the whole guard. The login-or-skip lives in package.json predocker:push.
    assert.ok(raw.includes('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}'));
    assert.ok(raw.includes('GITHUB_ACTOR: ${{ github.actor }}'));
  });

  it('publishes through the stage-1 SHA tag scheme, never an inline docker push', () => {
    assert.ok(raw.includes('npm run docker:push'));
    assert.doesNotMatch(raw, /docker push/);
  });

  it('builds exactly once, in this file, and smoke-tests before publishing', () => {
    // ADR-040's "one definition per action". The literal `docker build` lives
    // in package.json, so the workflow-side predicate is the npm script.
    const builds = raw
      .split('\n')
      .filter((l) => l.trim() === 'run: npm run build:docker');
    assert.equal(builds.length, 1, `expected 1 build step, found ${builds.length}`);

    assert.ok(lineOf('run: npm run build:docker') < lineOf('Container starts and serves /health'));
    assert.ok(lineOf('Container starts and serves /health') < lineOf('Container stops on SIGTERM'));
    // The step name, not `npm run docker:push` — the header comment names the
    // script too, and that mention sits above every step.
    assert.ok(lineOf('Container stops on SIGTERM') < lineOf('- name: Publish image to GitHub Container Registry'));
  });

  it('resolves DOCKER_PUBLISH_SEMVER once, at job scope', () => {
    // build:docker and docker:push BOTH derive tags from scripts/docker-tags.sh,
    // which reads this variable. At step scope the build would tag two images
    // and the push would try to push three, failing on the missing tag.
    const declarations = raw
      .split('\n')
      .filter((l) => l.includes('DOCKER_PUBLISH_SEMVER:'));
    assert.equal(declarations.length, 1);
    assert.equal(
      declarations[0],
      "      DOCKER_PUBLISH_SEMVER: ${{ inputs.publish_semver && '1' || '0' }}",
    );
  });

  it('keeps a concurrency group that cannot collide with a caller workflow', () => {
    // In a called workflow github.workflow resolves to the CALLER's name, so a
    // ${{ github.workflow }}-derived group would be identical to release.yml's
    // own group at stage 3 and deadlock: the caller waits on the callee, the
    // callee queues behind the caller.
    assert.ok(raw.includes('      group: docker-image-${{ github.ref }}'));
    assert.doesNotMatch(raw, /concurrency: \$\{\{ github\.workflow \}\}/);
  });
});
