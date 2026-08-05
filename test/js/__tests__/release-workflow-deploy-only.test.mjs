// P039: pin the `deploy_only` predicates in .github/workflows/release.yml.
//
// NOT in scope for P033 (source-inspection tests are an anti-pattern). P033
// targets tests that grep *implementation source* as a proxy for behaviour —
// its own proposed lint is scoped at `readFile(.*service/.*\.js.*)`. A workflow
// `if:` expression has no executable local surface: the declaration IS the
// artefact, and GitHub evaluates that exact string. A semantic YAML parse would
// be weaker, not stronger — it adds a second interpreter that can disagree with
// GitHub's evaluator — and would pull in an undeclared parser dependency. So
// exact-string pinning is the point here, not a smell. Do not delete this file
// in a P033 sweep.
//
// Why it earns its keep: the failure mode is silent. `deploy_only` is declared
// `type: boolean`, and the `inputs` context PRESERVES that type (only
// `github.event.inputs.*` is always-string). GitHub coerces mismatched operands
// to number, so `true == 'true'` becomes `1 == NaN` => false. Writing a gate as
// `inputs.deploy_only == 'true'` would therefore never fire on a deploy-only
// dispatch: the run goes GREEN with the Deploy step skipped and the decoupling
// ships inert. These assertions fail if anyone "fixes" the quoting.
//
// Known limitation, REVISITED at ADR-040 stage 3 (the ADR asks for exactly this
// re-read rather than letting the note go stale). Two changes since it was
// written:
//
// 1. The deploy-bearing surface is now FOUR things, not three — the three gated
//    steps PLUS the ungated `deploy-paths` detection step they all depend on.
//    Deleting or renaming that step makes the third disjunct resolve to the
//    empty string forever, so the deploy/** axis silently never fires and the
//    run stays green. It is pinned below by id, by its `push` scoping, and by
//    its fail-closed guard.
// 2. The original limitation stands unchanged: the occurrence count pins the
//    three gated steps that exist today, so a FIFTH deploy-path step added
//    without the gate would still not be caught.
//
// Note the detection step deliberately carries no `success()` — any `if:` drops
// GitHub's implicit success default, so it runs after an upstream failure. That
// is harmless (it only writes an output, and all three deploy steps carry their
// own `success() &&`) and is NOT to be "fixed" by adding a conjunct, which would
// change the surface count this note describes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = readFileSync(
  fileURLToPath(
    new URL('../../../.github/workflows/release.yml', import.meta.url),
  ),
  'utf8',
);

// ADR-040 makes the ADR-001 amendment a MECHANICAL prerequisite on the
// deploy/** axis, in as many words: "Asserted in
// test/js/__tests__/release-workflow-deploy-only.test.mjs, not left to a human
// grep." That is why this file reads a decision record as well as a workflow.
const adr001 = readFileSync(
  fileURLToPath(
    new URL(
      '../../../docs/decisions/001-risk-gated-release-process.proposed.md',
      import.meta.url,
    ),
  ),
  'utf8',
);

// The stage-3 no-double-publish property spans BOTH workflow files: this one
// calls the image build, and that one must not also self-trigger on the same
// release commit. Asserting only the near half would let the far half regress.
const dockerImage = readFileSync(
  fileURLToPath(
    new URL('../../../.github/workflows/docker-image.yml', import.meta.url),
  ),
  'utf8',
);

// The operator-facing half of the same property: release.yml going multi-job is
// only safe if the watcher can SEE the new job. See the P004 note below.
const releaseWatch = readFileSync(
  fileURLToPath(new URL('../../../scripts/release-watch.sh', import.meta.url)),
  'utf8',
);

// push-and-watch.sh carried the SAME three defects and the same fifth one, and
// until 2026-08-05 had no test coverage at all — the script that actually
// mis-fired in anger was the unpinned one. Pinned here rather than in a new file
// so the two watchers' invariants stay adjacent and cannot drift apart.
const pushWatch = readFileSync(
  fileURLToPath(new URL('../../../scripts/push-and-watch.sh', import.meta.url)),
  'utf8',
);

const DEPLOY_GATE =
  "        if: success() && (steps.changesets.outputs.published == 'true' || inputs.deploy_only == true || steps.deploy-paths.outputs.changed == 'true')";

describe('release.yml — P039 publish-free deploy trigger', () => {
  it('declares deploy_only as a boolean workflow_dispatch input defaulting to false', () => {
    assert.ok(raw.includes('      deploy_only:'));
    assert.ok(raw.includes('        type: boolean'));
    assert.ok(raw.includes('        default: false'));
  });

  it('keeps the master-HEAD-only job guard (the anti-divergence constraint)', () => {
    assert.ok(raw.includes("    if: github.ref == 'refs/heads/master'"));
  });

  it('skips the changesets publish step on a deploy-only run', () => {
    assert.ok(raw.includes('        if: inputs.deploy_only != true'));
  });

  it('narrows the P044 assertion without dropping either original conjunct', () => {
    assert.ok(
      raw.includes(
        "        if: steps.changesets.outputs.published != 'true' && steps.changesets.outputs.hasChangesets != 'true' && inputs.deploy_only != true",
      ),
    );
  });

  it('gates all three deploy-bearing steps on published OR deploy_only, under success()', () => {
    // The parentheses are load-bearing: `&&` binds tighter than `||`, so
    // `success() && A || B` parses as `(success() && A) || B` and would deploy
    // on a deploy-only dispatch even after an upstream step failed — strictly
    // worse than the status quo.
    const count = raw.split('\n').filter((l) => l === DEPLOY_GATE).length;
    assert.equal(count, 3, `expected 3 deploy gates, found ${count}`);
  });

  it('never compares deploy_only against the string "true"', () => {
    assert.doesNotMatch(raw, /deploy_only\s*[!=]=\s*'true'/);
  });

  it('detects a deploy/** change from a step whose id the gate actually names', () => {
    // The gate reads steps.deploy-paths.outputs.changed. Rename the step id and
    // that expression resolves to the empty string FOREVER: the deploy/** axis
    // never fires, and every run stays green while doing nothing. Same
    // silent-green class as the boolean-quoting trap this file already guards.
    assert.ok(raw.includes('        id: deploy-paths'));
    assert.ok(raw.includes('      - name: Detect a deploy/** change in this push'));
    assert.ok(raw.includes("echo \"changed=${changed}\" >> \"$GITHUB_OUTPUT\""));
  });

  it('scopes path detection to push events (ADR-040 empty-string trap)', () => {
    // ADR-040 Confirmation: on a deploy_only dispatch a skipped step's output is
    // the EMPTY STRING. The scoping must be explicit, not incidental on "a
    // dispatch happens to touch no paths".
    assert.ok(raw.includes("        if: github.event_name == 'push'"));
  });

  it('fails closed on a missing parent commit, and needs full history to do it', () => {
    // All-zeros github.event.before (branch creation) and a force-pushed-away
    // parent both fail this guard, yielding changed=false and NO deploy.
    assert.ok(raw.includes('if git cat-file -e "${BEFORE}^{commit}" 2>/dev/null; then'));
    // fetch-depth: 0 is load-bearing, not incidental. A push can carry several
    // commits; at depth 2 a deploy/** change in any but the last is invisible.
    // Scoped to the `release` job on purpose. Two test-running jobs gained their
    // own `fetch-depth: 0` on 2026-08-05 (the R028 review-fence check needs full
    // history), so a bare substring check now passes on their occurrences and
    // would stay green if this one were deleted — the pin R021 and R022 both
    // credit as EVIDENCED, satisfied by two checkouts unrelated to the axis.
    // Bounded to the NEXT top-level job, not to EOF: a job defined after
    // `release:` that carried its own `fetch-depth: 0` would otherwise satisfy
    // this assert on the release job's behalf — the same one-assert-many-
    // occurrences defect this fix closes, moved from occurrences above to below.
    const relStart = raw.indexOf('\n  release:');
    const relEnd = raw.slice(relStart + 1).search(/\n {2}[a-z][\w-]*:\n/);
    const releaseJob = raw.slice(relStart, relEnd === -1 ? undefined : relStart + 1 + relEnd);
    assert.ok(
      releaseJob.includes('          fetch-depth: 0'),
      'the release job must fetch full history — deploy/** detection diffs against the push parent',
    );
  });

  it('keeps the provider lockfile from arming a push-tier prod apply', () => {
    // deploy/.terraform.lock.hcl carries no infra intent and is the likeliest
    // file to be swept incidentally into an unrelated push. Excluded here; a
    // deliberate provider upgrade goes through the release-tier deploy_only
    // dispatch instead. The exclusion announces itself so it is never a silent
    // no-deploy.
    assert.ok(raw.includes("grep -v '^deploy/\\.terraform\\.lock\\.hcl$'"));
    assert.match(raw, /::notice::deploy\/ change is provider-lock only/);
  });

  it('publishes the image on a package release, via workflow_call, exactly once', () => {
    // ADR-040 Confirmation criterion: the release job declares a job-level
    // output for steps.changesets.outputs.published, and the docker publish job
    // reads it via needs.release.outputs. `published` is a STEP output, so
    // without the declaration the reader silently sees the empty string and the
    // image is never published on a release — on a green run.
    assert.ok(raw.includes('    outputs:'));
    assert.ok(
      raw.includes('      published: ${{ steps.changesets.outputs.published }}'),
    );

    assert.ok(raw.includes('  docker-publish:'));
    assert.ok(raw.includes('    needs: release'));
    assert.ok(raw.includes("    if: needs.release.outputs.published == 'true'"));
    assert.ok(raw.includes('    uses: ./.github/workflows/docker-image.yml'));
    // The bare :<semver> tag is written ONLY on a package release. Passed as a
    // real YAML boolean: the callee declares `type: boolean`, and a quoted
    // 'true' would be coerced to NaN on comparison.
    assert.ok(raw.includes('      publish_semver: true'));
    assert.doesNotMatch(raw, /publish_semver:\s*'true'/);

    // Least-privilege token, NOT `secrets: inherit` — the release job holds AWS,
    // Cloudflare and Terraform Cloud credentials the image build has no business
    // seeing. GHCR auth is the built-in GITHUB_TOKEN, so the docker-publish job
    // grants packages: write (a reusable callee cannot exceed the caller's grant)
    // and passes no Docker Hub secrets.
    assert.match(raw, /docker-publish:[\s\S]*?permissions:\n\s+contents: read\n\s+packages: write/);
    assert.doesNotMatch(raw, /DOCKER_ID_USER|DOCKER_ID_PASS/);
    assert.doesNotMatch(raw, /secrets:\s*inherit/);
  });

  it('calls a docker workflow whose own master push filter cannot double-fire', () => {
    // The stage-3 double-publish reconciliation is a property of BOTH files, so
    // assert the far half here too rather than trusting it by reference. If
    // package.json returns to docker-image.yml's push filter, a changesets
    // release commit fires that trigger AND this workflow_call at one sha, and
    // the second build re-points the immutable :<version>-<gitsha>.
    const onBlock = dockerImage.slice(
      dockerImage.indexOf('\non:'),
      dockerImage.indexOf('\n  pull_request:'),
    );
    assert.ok(onBlock.includes("      - 'Dockerfile'"));
    assert.ok(!onBlock.includes("      - 'package.json'"));
  });

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
      'release-watch.sh must not swallow gh run watch\'s exit code',
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
    assert.match(pushWatch, /--json status,conclusion/, 'must poll the run status');
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
