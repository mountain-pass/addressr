// P039: pin the `deploy_only` predicates in .github/workflows/release.yml.
//
// PARSED, not grepped, as of 2026-08-08 (P033). The previous header argued the
// opposite — that a YAML parse "would be weaker, not stronger" because it "adds
// a second interpreter that can disagree with GitHub's evaluator", and "would
// pull in an undeclared parser dependency". Both grounds were false and the
// record now says so rather than leaving them to be rediscovered:
//
//   - `js-yaml` is a DECLARED devDependency, not an undeclared one, and two
//     sibling tests already parse this very file with it
//     (terraform-plan-workflow.test.mjs, loader-workflow.test.mjs).
//   - The second-interpreter argument conflates parsing the DOCUMENT with
//     evaluating an EXPRESSION. GitHub parses this YAML with a YAML parser
//     before it evaluates any `if:`. Nothing here re-interprets
//     `success() && (...)`; the parse only locates the node the expression
//     hangs off, and the expression is then compared as an exact string. That
//     is the property the old header wanted, anchored where it belongs.
//
// The exact-string comparison of `if:` expressions is retained deliberately and
// is still the point: `deploy_only` is declared `type: boolean` and the `inputs`
// context PRESERVES that type (only `github.event.inputs.*` is always-string).
// GitHub coerces mismatched operands to number, so `true == 'true'` becomes
// `1 == NaN` => false. A gate written `inputs.deploy_only == 'true'` would never
// fire on a deploy-only dispatch: the run goes GREEN with the Deploy step
// skipped and the decoupling ships inert.
//
// WHAT THE PARSE FIXED, beyond tidiness — both are defects the text form had:
//
//   1. False-green. `raw.includes('        type: boolean')` and the matching
//      `default: false` were not anchored to `deploy_only` at all. They matched
//      any input in the file with those properties. Latent rather than live —
//      `deploy_only` is currently the only workflow_dispatch input — but the
//      assertion did not check the thing its name claims, and adding a second
//      boolean input would have made it vacuous silently. Now keyed on the
//      input by name. The same fix makes the boolean-vs-string trap a TYPE
//      check on the parsed value rather than a regex over the text, which is
//      the strongest available form: `publish_semver: 'true'` parses to a
//      string and fails `assert.equal(..., true)` on the spot.
//   2. False-red. Every pin embedded its own leading indentation, including a
//      DEPLOY_GATE constant compared with whole-line `===` and carrying eight
//      leading spaces. Any reformat of the workflow broke the suite with no
//      behaviour change. The `fetch-depth` assertion had additionally grown a
//      hand-rolled job-slicer — two regexes over raw text to bound one job —
//      which the parse replaces with `jobs.release`.
//
// KNOWN LIMITATION — NOW CLOSED, which the text form could not do. The old note
// read: "the occurrence count pins the three gated steps that exist today, so a
// FIFTH deploy-path step added without the gate would still not be caught."
// With the step list parsed, `every step that touches production carries the
// gate` is directly expressible, so a new deploy-bearing step added without the
// gate now fails. The occurrence count is KEPT as well, because the two catch
// different things: the predicate catches an unguarded NEW step, the count
// catches a gate DELETED from an existing one (including the sleep, which has
// no prod-touching content of its own to key on). ADR-040's Confirmation names
// that count by name; it is strengthened here, not dropped.
//
// Note the detection step deliberately carries no `success()` — any `if:` drops
// GitHub's implicit success default, so it runs after an upstream failure. That
// is harmless (it only writes an output, and all three deploy steps carry their
// own `success() &&`) and is NOT to be "fixed" by adding a conjunct.
//
// STILL TEXT, deliberately: the assertions over `scripts/release-watch.sh` and
// `scripts/push-and-watch.sh` below. Those are shell, not YAML, and the right
// shape there is a fixture test over an extracted predicate — recorded on P085,
// not solved by this change.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/**
 * Parse a workflow.
 *
 * The `?? parsed[true]` is not defensive padding: YAML 1.1 resolves a bare `on:`
 * key to the boolean `true`, so the trigger block lands under a boolean key
 * rather than the string 'on'. Both sibling workflow tests carry the same guard.
 */
const workflow = (relative) => {
  const parsed = yaml.load(read(relative));
  return { ...parsed, on: parsed.on ?? parsed[true] };
};

const release = workflow('../../../.github/workflows/release.yml');
const dockerImage = workflow('../../../.github/workflows/docker-image.yml');

// ADR-040 makes the ADR-001 amendment a MECHANICAL prerequisite on the
// deploy/** axis, in as many words: "Asserted in
// test/js/__tests__/release-workflow-deploy-only.test.mjs, not left to a human
// grep." That is why this file reads a decision record as well as a workflow.
// Markdown, so it stays a text read.
const adr001 = read(
  '../../../docs/decisions/001-risk-gated-release-process.proposed.md',
);

// The operator-facing half of the no-double-publish property: release.yml going
// multi-job is only safe if the watcher can SEE the new job. See the P004 note.
const releaseWatch = read('../../../scripts/release-watch.sh');

// push-and-watch.sh carried the SAME defects and until 2026-08-05 had no test
// coverage at all — the script that actually mis-fired in anger was the unpinned
// one. Pinned here rather than in a new file so the two watchers' invariants
// stay adjacent and cannot drift apart.
const pushWatch = read('../../../scripts/push-and-watch.sh');

// The exact expression GitHub evaluates. Compared against parsed `if:` VALUES,
// so indentation is irrelevant while the expression stays character-exact.
//
// The parentheses are load-bearing: `&&` binds tighter than `||`, so
// `success() && A || B` parses as `(success() && A) || B` and would deploy on a
// deploy-only dispatch even after an upstream step failed — strictly worse than
// the status quo.
const DEPLOY_GATE =
  "success() && (steps.changesets.outputs.published == 'true' || inputs.deploy_only == true || steps.deploy-paths.outputs.changed == 'true')";

const releaseSteps = release.jobs.release.steps;
const stepNamed = (name) => {
  const step = releaseSteps.find((s) => s.name === name);
  assert.ok(step, `release.yml must have a step named "${name}"`);
  return step;
};

/**
 * Everything a step executes, as one string: `run`, a composite action's inputs,
 * and BOTH env surfaces.
 *
 * `step.env` is not optional padding. The live "Deploy new version" step carries
 * its `TF_VAR_*` credentials there, and only a second copy of one variable in
 * `with.env` made it visible to an earlier version of this helper — so the
 * predicate below was catching that step by coincidence rather than by rule. A
 * future step declaring `TF_VAR_*` in `env:` alone would have been invisible.
 */
const stepBody = (step) =>
  [
    step.run,
    step.with?.runCmd,
    JSON.stringify(step.with?.env ?? ''),
    JSON.stringify(step.env ?? ''),
  ]
    .filter(Boolean)
    .join('\n');

describe('release.yml — P039 publish-free deploy trigger', () => {
  it('declares deploy_only as a boolean workflow_dispatch input defaulting to false', () => {
    // Keyed on the input BY NAME. The text form matched any input in the file
    // carrying these properties, so it could not have caught deploy_only itself
    // changing type — the exact silent-green failure this file exists to stop.
    const input = release.on.workflow_dispatch.inputs.deploy_only;
    assert.ok(input, 'deploy_only must be a workflow_dispatch input');
    assert.equal(input.type, 'boolean');
    assert.equal(
      input.default,
      false,
      'the default must be the BOOLEAN false, not the string "false"',
    );
  });

  it('keeps the master-HEAD-only job guard (the anti-divergence constraint)', () => {
    assert.equal(release.jobs.release.if, "github.ref == 'refs/heads/master'");
  });

  it('skips the changesets publish step on a deploy-only run', () => {
    assert.equal(
      stepNamed('Create Release Pull Request or Publish to npm').if,
      'inputs.deploy_only != true',
    );
  });

  it('narrows the P044 assertion without dropping either original conjunct', () => {
    assert.equal(
      stepNamed('Fail if a publish was expected but did not happen (P044)').if,
      "steps.changesets.outputs.published != 'true' && steps.changesets.outputs.hasChangesets != 'true' && inputs.deploy_only != true",
    );
  });

  it('gates exactly three steps on published OR deploy_only, under success()', () => {
    // The count catches a gate DELETED from a step that is already there —
    // including "Wait for deployment to stabilize", whose body is `sleep 120`
    // and which therefore has no prod-touching content for the predicate below
    // to key on. ADR-040's Confirmation names this count.
    const gated = releaseSteps.filter((s) => s.if === DEPLOY_GATE);
    assert.equal(
      gated.length,
      3,
      `expected 3 deploy gates, found ${gated.length}: ${gated.map((s) => s.name).join(', ')}`,
    );
  });

  it('gates EVERY step that touches production, not merely three of them', () => {
    // This closes the limitation the previous header recorded as accepted: "a
    // FIFTH deploy-path step added without the gate would still not be caught."
    // The count above cannot see a new step; this can, because the predicate is
    // derived from what a step DOES rather than from how many there are.
    //
    // Signals chosen because each is load-bearing rather than incidental: the
    // deploy command, terraform's variable prefix, and the production hostname.
    // A step that reaches prod without at least one of these is possible in
    // principle, which is why the count is retained alongside.
    const touchesProduction = (step) =>
      /deploy:prod|TF_VAR_|backend\.addressr\.io/.test(stepBody(step));
    const unguarded = releaseSteps
      .filter((s) => touchesProduction(s) && s.if !== DEPLOY_GATE)
      .map((s) => s.name ?? s.uses);
    assert.deepStrictEqual(
      unguarded,
      [],
      `these steps reach production without the deploy gate, so they would run on an ordinary push: ${unguarded.join(', ')}`,
    );
  });

  it('never compares deploy_only against the string "true", anywhere', () => {
    // Two instruments, because neither alone is honest.
    //
    // The parsed scan walks EVERY job and EVERY step of every job — not just the
    // release job, which is what an earlier draft of this test did while its
    // comment claimed whole-file coverage. That comment was the reviewer trap
    // P033 catalogues as failure mode 4, written into the commit that documents
    // it: a mis-quote in a job this file does not otherwise name would have gone
    // unread while the assertion's name said otherwise.
    const expressions = Object.values(release.jobs).flatMap((job) => [
      job.if,
      ...(job.steps ?? []).map((s) => s.if),
    ]);
    for (const expression of expressions.filter(Boolean)) {
      assert.doesNotMatch(
        expression,
        /deploy_only\s*[!=]=\s*'true'/,
        `'true' coerces to NaN against a boolean input, so this never fires: ${expression}`,
      );
    }

    // And a raw backstop, because the parsed walk still only sees `if:` values.
    // The mis-quote is equally wrong in a `run:` body, a `with:` input or a
    // comment that someone later copies, and it costs one line to cover all of
    // them. This is the whole-file claim the comment above used to make without
    // the assertion to back it.
    assert.doesNotMatch(
      read('../../../.github/workflows/release.yml'),
      /deploy_only\s*[!=]=\s*'true'/,
      'the quoted comparison must not appear anywhere in the workflow, in any position',
    );
  });

  it('detects a deploy/** change from a step whose id the gate actually names', () => {
    // The gate reads steps.deploy-paths.outputs.changed. Rename the step id and
    // that expression resolves to the empty string FOREVER: the deploy/** axis
    // never fires, and every run stays green while doing nothing. Same
    // silent-green class as the boolean-quoting trap above. Asserting the id ON
    // the named step is what the text form could not do — it checked that the
    // string `id: deploy-paths` appeared somewhere in the file.
    const detect = stepNamed('Detect a deploy/** change in this push');
    assert.equal(detect.id, 'deploy-paths');
    assert.match(
      detect.run,
      /echo "changed=\$\{changed\}" >> "\$GITHUB_OUTPUT"/,
    );
  });

  it('scopes path detection to push events (ADR-040 empty-string trap)', () => {
    // ADR-040 Confirmation: on a deploy_only dispatch a skipped step's output is
    // the EMPTY STRING. The scoping must be explicit, not incidental on "a
    // dispatch happens to touch no paths".
    assert.equal(
      stepNamed('Detect a deploy/** change in this push').if,
      "github.event_name == 'push'",
    );
  });

  it('fails closed on a missing parent commit, and needs full history to do it', () => {
    // All-zeros github.event.before (branch creation) and a force-pushed-away
    // parent both fail this guard, yielding changed=false and NO deploy.
    const detect = stepNamed('Detect a deploy/** change in this push');
    assert.match(
      detect.run,
      /if git cat-file -e "\$\{BEFORE\}\^\{commit\}" 2>\/dev\/null; then/,
    );

    // fetch-depth: 0 is load-bearing, not incidental. A push can carry several
    // commits; at depth 2 a deploy/** change in any but the last is invisible.
    //
    // Scoped to the `release` job STRUCTURALLY. The text form needed a
    // hand-rolled slicer — indexOf on '\n  release:' plus a regex for the next
    // top-level job — because two unrelated test jobs gained their own
    // `fetch-depth: 0` on 2026-08-05 and a bare substring check passed on their
    // occurrences. That slicer was itself the one-assert-many-occurrences defect
    // it was written to fix, moved rather than removed. The parse makes the
    // question exact.
    const checkout = releaseSteps.find((s) =>
      s.uses?.startsWith('actions/checkout'),
    );
    assert.ok(checkout, 'the release job must check out the repository');
    assert.equal(
      checkout.with?.['fetch-depth'],
      0,
      'the release job must fetch full history — deploy/** detection diffs against the push parent',
    );
  });

  it('keeps the provider lockfile from arming a push-tier prod apply', () => {
    // deploy/.terraform.lock.hcl carries no infra intent and is the likeliest
    // file to be swept incidentally into an unrelated push. Excluded here; a
    // deliberate provider upgrade goes through the release-tier deploy_only
    // dispatch instead. The exclusion announces itself so it is never a silent
    // no-deploy.
    const detect = stepNamed('Detect a deploy/** change in this push');
    assert.match(
      detect.run,
      /grep -v '\^deploy\/\\\.terraform\\\.lock\\\.hcl\$'/,
    );
    assert.match(detect.run, /::notice::deploy\/ change is provider-lock only/);
  });

  it('publishes the image on a package release, via workflow_call, exactly once', () => {
    // ADR-040 Confirmation criterion: the release job declares a job-level
    // output for steps.changesets.outputs.published, and the docker publish job
    // reads it via needs.release.outputs. `published` is a STEP output, so
    // without the declaration the reader silently sees the empty string and the
    // image is never published on a release — on a green run.
    assert.equal(
      release.jobs.release.outputs?.published,
      '${{ steps.changesets.outputs.published }}',
    );

    const publish = release.jobs['docker-publish'];
    assert.ok(publish, 'release.yml must declare a docker-publish job');
    assert.deepStrictEqual([publish.needs].flat(), ['release']);
    assert.equal(publish.if, "needs.release.outputs.published == 'true'");
    assert.equal(publish.uses, './.github/workflows/docker-image.yml');

    // The bare :<semver> tag is written ONLY on a package release. This is the
    // assertion the parse improves most: the callee declares `type: boolean`,
    // and a quoted 'true' would be coerced to NaN on comparison. A strict
    // equality against the parsed value IS the type check — `'true'` is a
    // string and fails here, so the old negative regex is no longer needed.
    assert.equal(
      publish.with?.publish_semver,
      true,
      'publish_semver must be a real YAML boolean; the string "true" coerces to NaN against the callee\'s boolean input',
    );

    // Least-privilege token, NOT `secrets: inherit` — the release job holds AWS,
    // Cloudflare and Terraform Cloud credentials the image build has no business
    // seeing. GHCR auth is the built-in GITHUB_TOKEN, so docker-publish grants
    // packages: write (a reusable callee cannot exceed the caller's grant) and
    // passes no Docker Hub secrets.
    assert.deepStrictEqual(publish.permissions, {
      contents: 'read',
      packages: 'write',
    });
    assert.equal(
      publish.secrets,
      undefined,
      'docker-publish must not forward secrets, least of all `inherit`',
    );
    assert.doesNotMatch(
      read('../../../.github/workflows/release.yml'),
      /DOCKER_ID_USER|DOCKER_ID_PASS/,
      'Docker Hub credentials are retired; GHCR uses the built-in GITHUB_TOKEN',
    );
  });

  it('calls a docker workflow whose own master push filter cannot double-fire', () => {
    // The stage-3 double-publish reconciliation is a property of BOTH files, so
    // assert the far half here too rather than trusting it by reference. If
    // package.json returns to docker-image.yml's push filter, a changesets
    // release commit fires that trigger AND this workflow_call at one sha, and
    // the second build re-points the immutable :<version>-<gitsha>.
    //
    // The text form sliced the raw file from '\non:' to '\n  pull_request:' —
    // which silently depended on `push:` being declared before `pull_request:`.
    // Reorder the two blocks, no behaviour change, and the slice inverts: it
    // would have read the pull_request paths as the push paths, where
    // package.json IS legitimately listed, and reported a false failure.
    const pushPaths = dockerImage.on.push.paths;
    assert.ok(
      pushPaths.includes('Dockerfile'),
      'a Dockerfile change must still publish an image on master',
    );
    assert.ok(
      !pushPaths.includes('package.json'),
      'package.json in the push filter double-fires on a changesets release commit',
    );
    // The asymmetry is the guard, so pin that it IS an asymmetry: the PR filter
    // legitimately carries package.json, and a "tidy-up" equalising the two
    // lists would reintroduce the double publish.
    assert.ok(
      dockerImage.on.pull_request.paths.includes('package.json'),
      'the PR filter should still build on a package.json change — it does not push',
    );
  });

  it('holds ADR-001 to the deploy/** push-tier amendment ADR-040 requires', () => {
    // ADR-040's Confirmation: release.yml must contain no deploy/**
    // path-detection step unless ADR-001 carries an amendment naming that entry
    // point AND its push-tier score. Asserted here rather than left to a human
    // grep, which is what ADR-040 asks for by name.
    //
    // Keyed on the co-occurrence of 'deploy/**' and 'push-tier', NOT on a
    // generic 'Amendment' heading: ADR-001 already carried an unrelated
    // 2026-07-26 amendment block, so a heading-keyed assertion would have
    // passed BEFORE the required block was ever written — a vacuous pass that
    // would defeat the whole criterion. Verified failing against ADR-001 as it
    // stood before the block landed.
    //
    // Deliberately UNCONDITIONAL, which is strictly stronger than ADR-040's
    // "only if the step is present" phrasing: the governance record must stand
    // whether or not someone later removes the step.
    assert.ok(
      adr001.includes('deploy/**'),
      'ADR-001 must name the deploy/** entry point',
    );
    assert.ok(
      adr001.includes('push-tier'),
      'ADR-001 must record the deploy/** axis as push-tier governance',
    );
  });
});
describe('release-watch.sh — the watcher invariants (P004 / P085)', () => {
  it('watches every job, so a red docker-publish cannot report as a clean release', () => {
    // P004 false-negative class, new surface. release.yml became MULTI-JOB at
    // ADR-040 stage 3, so a job-name-specific conclusion check would print
    // "completed successfully" while the image publish was red — after npm
    // publish and the prod deploy had already gone through.
    //
    // REWRITTEN 2026-08-03 (P085). This previously pinned the literal jq
    // fragments `select(.conclusion == "failure")` and
    // `select(.name != "check-deps")`. Both are gone: the scan moved to awk and
    // now allow-lists nothing, because testing for the literal "failure" let
    // `cancelled`, `timed_out`, `startup_failure`, `neutral` and an empty jobs
    // array all reach the green path. Pinning the old strings would have
    // blocked the fix, which is what pinning an implementation rather than a
    // property does — the P033 shape. So assert the PROPERTIES instead.
    //
    // Kept as negatives too: re-introducing any of these is silent, because the
    // script still exits 0 and still looks correct.
    //
    // HONEST LIMIT, per the risk scorer's review of this pin: two of the
    // assertions below are awk-LITERAL, so a reimplementation in jq or a `case`
    // statement would hold the property and still break the pin. This is less
    // brittle than the string pins it replaces, not mechanism-independent. The
    // strictly better shape is a fixture test — feed a TSV of conclusions
    // through the predicate and assert the exit code and the named jobs — which
    // needs the predicate extracted from the script first. Recorded on P085.

    // 1. The exit code of `gh run watch` must not be discarded.
    assert.doesNotMatch(
      releaseWatch,
      /gh run watch "\$RUN_ID" \|\| true/,
      "release-watch.sh must not swallow gh run watch's exit code",
    );
    assert.match(
      releaseWatch,
      /gh run watch "\$RUN_ID" --exit-status/,
      'release-watch.sh must run gh run watch with --exit-status',
    );
    // Capturing the status is not the property — ACTING on it is. Without this
    // the `if [ "${WATCH_STATUS:-0}" -ne 0 ]` block could be deleted and every
    // other assertion here would still pass, restoring exactly the discard the
    // two above forbid. Caught by the risk scorer reviewing this pin.
    assert.match(
      releaseWatch,
      /if \[ "\$\{WATCH_STATUS:-0\}" -ne 0 \]/,
      'release-watch.sh must ACT on the captured watch status, not merely capture it',
    );

    // 2. The scan must be default-deny, not an allow-list of failure words.
    //    Anything that is not success or skipped has to fail.
    assert.match(
      releaseWatch,
      /\$1 == "success" \|\| \$1 == "skipped" \{ next \}/,
      'release-watch.sh must treat any non-success, non-skipped conclusion as failure',
    );
    assert.doesNotMatch(
      releaseWatch,
      /select\(\.conclusion == "failure"\)/,
      'the failure-word allow-list must not come back: cancelled and timed_out passed through it',
    );

    // 2b. The default-deny scan is only meaningful once the run has FINISHED.
    //     `gh run watch`'s exit status is deliberately non-fatal, so a transient
    //     that ends it early drops straight into the scan — which then reads
    //     every still-pending job as a failure and reports a GREEN run as red.
    //     Run 30973114823 (2026-08-05), P085's fifth defect. Pin the
    //     precondition, never a weakening of the scan.
    //
    //     Defining the helper is not the property; CALLING it before the scan
    //     is. This mirrors the note at the WATCH_STATUS assertion above —
    //     capturing a status is not acting on it.
    assert.match(
      releaseWatch,
      /--json status,conclusion/,
      'release-watch.sh must poll the run status before scanning jobs',
    );
    assert.match(
      releaseWatch,
      /^wait_for_completion \|\| exit 1$/m,
      'release-watch.sh must ACT on the completion check, not merely define it (a commented-out call must not satisfy this)',
    );
    const waitIndex = releaseWatch.search(/^wait_for_completion \|\| exit 1$/m);
    const scanIndex = releaseWatch.indexOf('JOBS_TSV=');
    assert.ok(
      waitIndex > -1 && scanIndex > -1 && waitIndex < scanIndex,
      'completion must be asserted BEFORE the job scan, not after it',
    );

    // 2c. The run's own conclusion is a verdict the scan never read. A run
    //     concluding non-success while every job reads success/skipped passed
    //     this script until 2026-08-05.
    // Pin the EXIT, not just the condition — the same lesson this file already
    // records for the empty-scan branch. A run concluding `failure` while every
    // job reads success/skipped would otherwise report "completed successfully"
    // with the whole suite green, which is the P085 false-green class exactly.
    assert.match(
      releaseWatch,
      /RUN_CONCLUSION[\s\S]{0,300}?!= "success"[\s\S]{0,400}?exit 1/,
      'release-watch.sh must EXIT non-zero on a non-success run conclusion, not merely test for it',
    );

    // 3. An empty scan must not read as success. This check runs AFTER npm
    //    publish and the prod deploy, so silence is the worst possible pass.
    // Pin the EXIT, not just the message. Printing "UNKNOWN" and then falling
    // through to the success path would satisfy a message-only assertion.
    assert.match(
      releaseWatch,
      /Release status UNKNOWN[\s\S]{0,400}?exit 1/,
      'the empty-job-list branch must exit non-zero, not just print',
    );

    // 4. check-deps stays exempt — advisory per ADR 015, carries
    //    continue-on-error, so a mature-dependency notice must not red a release.
    assert.match(
      releaseWatch,
      /\$2 == "check-deps" \{ next \}/,
      'check-deps must stay exempt from the failure scan',
    );

    // 5. The PR-checks gate must not select a job name that does not exist.
    //    `select(.name == "build")` matched nothing on every run, so the
    //    "no build check found, proceeding" branch fired unconditionally and a
    //    red release PR was never caught.
    assert.doesNotMatch(
      releaseWatch,
      /select\(\.name == "build"\)/,
      'the non-existent "build" job selector must not come back',
    );
  });

  it('holds ADR-001 to the deploy/** push-tier amendment ADR-040 requires', () => {
    // ADR-040's Confirmation: release.yml must contain no deploy/**
    // path-detection step unless ADR-001 carries an amendment naming that entry
    // point AND its push-tier score. Asserted here rather than left to a human
    // grep, which is what ADR-040 asks for by name.
    //
    // Keyed on the co-occurrence of 'deploy/**' and 'push-tier', NOT on a
    // generic 'Amendment' heading: ADR-001 already carried an unrelated
    // 2026-07-26 amendment block, so a heading-keyed assertion would have
    // passed BEFORE the required block was ever written — a vacuous pass that
    // would defeat the whole criterion. Verified failing against ADR-001 as it
    // stood before the block landed.
    //
    // Deliberately UNCONDITIONAL, which is strictly stronger than ADR-040's
    // "only if the step is present" phrasing: the governance record must stand
    // whether or not someone later removes the step.
    assert.ok(
      adr001.includes('deploy/**'),
      'ADR-001 must name the deploy/** entry point',
    );
    assert.ok(
      adr001.includes('push-tier'),
      'ADR-001 must record the deploy/** axis as push-tier governance',
    );
  });
});

describe('push-and-watch.sh — the same watcher invariants (P085)', () => {
  it('scans jobs only after the run has completed, and acts on the check', () => {
    assert.match(
      pushWatch,
      /--json status,conclusion/,
      'must poll the run status',
    );
    assert.match(
      pushWatch,
      /^wait_for_completion \|\| exit 1$/m,
      'must ACT on the completion check, not merely define it (a commented-out call must not satisfy this)',
    );
    const waitIndex = pushWatch.search(/^wait_for_completion \|\| exit 1$/m);
    const scanIndex = pushWatch.indexOf('JOBS_TSV=');
    assert.ok(
      waitIndex > -1 && scanIndex > -1 && waitIndex < scanIndex,
      'completion must be asserted BEFORE the job scan',
    );
  });

  it('keeps the default-deny job scan and fails on a non-success run conclusion', () => {
    // The default-deny predicate IS the P085 remediation. The 2026-08-05 false
    // red was a missing precondition, not a scan that was too strict — so this
    // asserts the scan has not been softened to tolerate `pending`.
    assert.match(
      pushWatch,
      /\$1 == "success" \|\| \$1 == "skipped" \{ next \}/,
      'must treat any non-success, non-skipped conclusion as failure',
    );
    assert.doesNotMatch(
      pushWatch,
      /\$1 == "pending" \{ next \}/,
      'the scan must NOT be weakened to let pending jobs pass',
    );
    // Pin the EXIT, not just the condition — the same lesson this file already
    // records for the empty-scan branch. A run concluding `failure` while every
    // job reads success/skipped would otherwise report "completed successfully"
    // with the whole suite green, which is the P085 false-green class exactly.
    assert.match(
      pushWatch,
      /RUN_CONCLUSION[\s\S]{0,300}?!= "success"[\s\S]{0,400}?exit 1/,
      'push-and-watch.sh must EXIT non-zero on a non-success run conclusion, not merely test for it',
    );
  });

  it('treats an empty job scan as UNKNOWN and exits, never as success', () => {
    // release-watch.sh has carried this pin; push-and-watch.sh never has, so
    // R023's "empty scan is UNKNOWN, not success" control was re-armable here
    // for free. Pin the exit, not the message.
    assert.match(
      pushWatch,
      /Push pipeline status UNKNOWN[\s\S]{0,400}?exit 1/,
      'the empty-job-list branch must exit non-zero, not just print',
    );
  });

  it('does not fail a green run when gh run watch exits non-zero on a transient', () => {
    // The other half of the fifth defect: a transient makes `gh run watch` exit
    // non-zero AND drops into the scan. Fixing the scan alone still left the
    // WATCH_STATUS branch reporting failure on a run that concluded success.
    assert.match(
      pushWatch,
      /WATCH_STATUS:-0[\s\S]{0,400}?RUN_CONCLUSION" = "success"/,
      'a non-zero watch status must defer to a success run conclusion, not override it',
    );
  });
});
