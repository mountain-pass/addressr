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
// RETIRED 2026-08-10 along with its subject. This paragraph read: "Note the
// detection step deliberately carries no `success()` — any `if:` drops GitHub's
// implicit success default, so it runs after an upstream failure. That is
// harmless (it only writes an output, and all three deploy steps carry their own
// `success() &&`) and is NOT to be 'fixed' by adding a conjunct." There is no
// detection step left to carry or omit `success()`. The half that survives and
// is still load-bearing: the three deploy steps each carry their own
// `success() &&`, and the parentheses in DEPLOY_GATE below are what stop
// `success() && A || B` deploying after an upstream failure.
//
// STILL TEXT, deliberately: the assertions over `scripts/release-watch.sh` and
// `scripts/push-and-watch.sh` below. Those are shell, not YAML, and the right
// shape there is a fixture test over an extracted predicate — recorded on P085,
// not solved by this change.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// js-yaml 5 dropped the default export and reorganised the public API
// around flat named exports, so this is `{ load }` rather than `yaml`.
// It also defaults to the YAML 1.2 CORE schema, under which a bare `on:`
// key stays the string "on" instead of resolving to boolean true — the
// `?? parsed[true]` fallbacks below are now belt-and-braces rather than
// load-bearing, and are kept so this file still parses a 1.1-schema
// document correctly if the schema default ever moves again.
import { load } from 'js-yaml';

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/**
 * Parse a workflow.
 *
 * The `?? parsed[true]` WAS load-bearing and is now a fallback, and the change
 * is worth recording rather than silently deleting. Under YAML 1.1 — js-yaml 4's
 * default schema — a bare `on:` key resolves to the boolean `true`, so the
 * trigger block landed under a boolean key rather than the string 'on'. js-yaml
 * 5 defaults to the YAML 1.2 CORE schema, where `on` stays a string, so
 * `parsed.on` now hits and `parsed[true]` is undefined. Verified after the
 * upgrade rather than assumed.
 *
 * Kept because it costs nothing and the schema default has now moved once. Both
 * sibling workflow tests carry the same guard, for the same reason.
 */
const workflow = (relative) => {
  const parsed = load(read(relative));
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
//
// NARROWED 2026-08-10 from three disjuncts to two, when the deploy/** push axis
// was retired. The parenthesis note above is unchanged and still load-bearing.
//
// REPOINTED 2026-08-10 (second revision, same day), per ADR-045. The second
// disjunct was `inputs.deploy_only == true`; it is now the changesets-armed
// deployment version bump. Still TWO disjuncts, still one shared set of steps —
// the change is an `if:` edit on the one gate, which is what ADR-001's
// single-definition doctrine requires and what every prior widening and
// narrowing also did.
const DEPLOY_GATE =
  "success() && (steps.changesets.outputs.published == 'true' || steps.deployment-version.outputs.changed == 'true')";

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
  it('keeps the retired deploy_only input from silently returning', () => {
    // CONVERTED 2026-08-10 from a positive assertion, with its rationale kept.
    // It read: "declares deploy_only as a boolean workflow_dispatch input
    // defaulting to false", keyed BY NAME because a text-form match could not
    // catch the input itself changing type — a quoted "true" comparison never
    // matches a boolean, so the gates would never fire and the run would go
    // GREEN with the deploy silently skipped.
    //
    // ADR-045 supersedes the entry point and it is DELETED, not left declared.
    // Leaving it would have made a dispatch skip the publish, skip P044, skip
    // Deploy/Wait/Smoke — and conclude green. An inert production-deploy
    // affordance reporting success is the same silent-green class the old
    // assertion guarded, arriving from the opposite direction.
    const inputs = release.on?.workflow_dispatch?.inputs ?? {};
    assert.ok(
      !('deploy_only' in inputs),
      'deploy_only is retired (ADR-045): re-adding the input would make a ' +
        'dispatch green-and-inert, because the deploy gate no longer reads it',
    );
  });

  it('keeps the master-HEAD-only job guard (the anti-divergence constraint)', () => {
    assert.equal(release.jobs.release.if, "github.ref == 'refs/heads/master'");
  });

  it('leaves the changesets step ungated, now that nothing must skip it', () => {
    // CONVERTED 2026-08-10. It asserted `if: inputs.deploy_only != true`, which
    // kept a deploy-only dispatch off the registry. With that entry point gone
    // there is no path that must skip this step, and a surviving guard would be
    // a condition with no subject — the shape that rots into a false premise.
    assert.equal(
      stepNamed('Create Release Pull Request or Publish to npm').if,
      undefined,
      'the changesets step must be ungated: the only path that had to skip it is retired',
    );
  });

  it('restores the P044 assertion to its two original conjuncts', () => {
    // It carried a third, `&& inputs.deploy_only != true`, exempting the
    // publish-free dispatch — a run that attempts no publish has no swallowed
    // publish to detect, so the assertion would have passed vacuously while
    // claiming to check something the run was not doing. That input is retired,
    // so the exemption has no subject and is removed rather than left inert.
    //
    // IT NOW RUNS ON A DEPLOYMENT-ONLY RELEASE, and that is intended, not an
    // oversight. Both conjuncts hold on that path, so it fires — and passes,
    // because it reads packages/addressr/package.json, which a deployment-only
    // changeset does not bump: the cascade runs INTO the deployment package,
    // not out of it. This is the likeliest place the new axis goes unexpectedly
    // red, which is why the exact expression is pinned rather than described.
    assert.equal(
      stepNamed('Fail if a publish was expected but did not happen (P044)').if,
      "steps.changesets.outputs.published != 'true' && steps.changesets.outputs.hasChangesets != 'true'",
    );
  });

  it('reads the PUBLISHED manifest for the P044 assertion, never the workspace root', () => {
    // MEASURED FAIL-OPEN, 2026-08-10. This step read `./package.json` for the
    // name and version it compares against npm. The workspace split made that
    // the PRIVATE root `addressr-workspace` with no `version` field, so
    // `npm view` returned empty and the step took its documented
    // warn-and-`exit 0` branch. The guard that makes a swallowed publish LOUD
    // disabled itself, silently, on a green run — and it failed OPEN, which is
    // strictly worse than failing closed.
    //
    // The step's own design is what converts the break into a pass, so the fix
    // cannot be "notice it next time": pin the path. A private root manifest has
    // no `version`, so any future re-point at the root reintroduces exactly this.
    const step = stepNamed(
      'Fail if a publish was expected but did not happen (P044)',
    );
    assert.match(
      step.run,
      /require\('\.\/packages\/addressr\/package\.json'\)\.name/,
      'P044 must read the published package name, not the private workspace root',
    );
    assert.match(
      step.run,
      /require\('\.\/packages\/addressr\/package\.json'\)\.version/,
      'P044 must read the published version, not the private workspace root',
    );
    assert.doesNotMatch(
      step.run,
      /require\('\.\/package\.json'\)/,
      'the workspace root has no `version`, so reading it makes this assertion vacuous and it fails OPEN',
    );
  });

  it('gates exactly three steps on published OR a deployment bump, under success()', () => {
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

  it('pins the two gated step NAMES that only the count would otherwise reach', () => {
    // `Wait for deployment to stabilize` and `Smoke test production` were
    // reachable only via the `s.if === DEPLOY_GATE` count, which is name-blind.
    // Rename either and the suite stayed green — while R015 cites those exact
    // names as stable anchors, having just dropped its `release.yml:NNN` line
    // citations in favour of them.
    //
    // ADDED 2026-08-10 to make that citation true rather than narrowing it. An
    // anchor credited to a pin that does not cover it is WORSE than the
    // coordinate it replaced: a line number rots visibly, a name rots silently.
    stepNamed('Wait for deployment to stabilize');
    stepNamed('Smoke test production');
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

  it('detects a deployment bump via a SCRIPT, not an inline path diff', () => {
    // ADR-045 criterion 2. The logic lives in a script BECAUSE criterion 3
    // requires it be DRIVEN through four fail-closed cases — a rename, an
    // all-zeros before, an unreachable parent, a non-push event — which an
    // inline `run:` block cannot be. detect-deployment-bump.test.mjs does that
    // driving against real git fixtures; this pins the wiring.
    const step = stepNamed('Detect a deployment version bump');
    assert.equal(step.id, 'deployment-version', 'the gate reads this step id');
    assert.match(
      step.run,
      /scripts\/detect-deployment-bump\.sh/,
      'detection must call the script the behavioural test drives',
    );
    assert.match(
      step.run,
      />>\s*"\$GITHUB_OUTPUT"/,
      'the verdict must reach the step output the gate reads',
    );
  });

  it('scopes detection to push events (the non-push fail-closed leg)', () => {
    // ADR-045 criterion 3's fourth case. On any other event the step is skipped,
    // `outputs.changed` is the empty string, and the gate's POSITIVE `== 'true'`
    // comparison is false. The positive form is load-bearing: the empty-string
    // trap bites the NEGATED `!= 'true'` form.
    //
    // This restores, in a new form, an assertion deliberately removed on
    // 2026-08-10 with the retired axis ("scopes path detection to push events").
    // The detector ALSO denies on an empty argument, so the property does not
    // rest on this condition alone — but a future edit dropping this `if:` would
    // run the detector on every pull_request, so it is pinned.
    assert.equal(
      stepNamed('Detect a deployment version bump').if,
      "github.event_name == 'push'",
    );
  });

  it('detects BEFORE the changesets step runs, and binds to the pushed sha', () => {
    // BOTH HALVES OF A REAL DEFECT, pinned because it shipped green.
    //
    // `changesets/action` on a push carrying changesets checks out
    // `changeset-release/master`, runs `changeset version`, commits, and does
    // not switch back. So AFTER it, `HEAD` is the version-bump commit — the
    // deployment version already bumped, the changesets already deleted. A
    // detector reading `HEAD` arms on the SECOND and every subsequent
    // changeset-bearing push of a release cycle: an unreviewed production apply
    // at push-tier, before the release PR is merged. That is the `deploy/**`
    // hazard reconstituted with a wider trigger.
    //
    // The first version of this step had exactly that shape and passed the
    // whole suite, because nothing pinned the head ref. Two independent fixes,
    // both asserted, so the property survives a step reorder OR an env edit.
    const names = releaseSteps.map((s) => s.name);
    const detectAt = names.indexOf('Detect a deployment version bump');
    const changesetsAt = names.indexOf('Create Release Pull Request or Publish to npm');
    assert.ok(detectAt >= 0 && changesetsAt >= 0, 'both steps must exist');
    assert.ok(
      detectAt < changesetsAt,
      'detection must run BEFORE changesets/action moves HEAD onto the version branch',
    );

    const step = stepNamed('Detect a deployment version bump');
    assert.equal(
      step.env?.PUSHED,
      '${{ github.sha }}',
      'the head ref must be the PUSHED sha, never the working HEAD',
    );
    assert.match(
      step.run,
      /detect-deployment-bump\.sh"?\s+"\$BEFORE"\s+"\$PUSHED"/,
      'both refs must be passed explicitly; defaulting the head ref is the defect',
    );
  });

  it('passes the before-ref through env, keeping the run body a fixed literal', () => {
    // Matches the shape the retired detection step used and the rest of the file
    // follows. It also means the `run:` line is a constant that can be asserted
    // exactly, rather than a template whose expansion varies.
    const step = stepNamed('Detect a deployment version bump');
    assert.equal(step.env?.BEFORE, '${{ github.event.before }}');
    assert.doesNotMatch(
      step.run,
      /\$\{\{/,
      'the run body must not interpolate directly; read the ref from env',
    );
  });

  it('keeps the retired deploy/** push axis from silently returning', () => {
    // Phase 0 retired the ADR-040 stage-3 push axis: a push touching deploy/**
    // no longer applies Terraform to production. The axis is gone rather than
    // narrowed, so the guard is that NOTHING reads its step output again.
    //
    // Why this assertion and not merely the DEPLOY_GATE string: re-adding the
    // disjunct to one of the three gated steps would be caught by the gate
    // comparison, but re-adding the detection step alone would not — it would
    // sit there writing an output nobody reads, look harmless in review, and be
    // one character away from live. Keying on the output reference catches both
    // halves, and the raw backstop catches a re-add in a `run:` body or a
    // `with:` input where no `if:` parse would ever look.
    //
    // WHY THE AXIS WENT, recorded here because the diff alone does not say it:
    // release.yml's detection step diffed `-- deploy/`, and a rename OUT of
    // deploy/ shows as deletions under deploy/. So the commit that moves the
    // tree into apps/addressr-deployment/ would itself have set changed=true and
    // fired a push-tier production apply as a rider on a refactor. Verified by
    // replaying the predicate against a real `git mv`, not reasoned about.
    const expressions = Object.values(release.jobs).flatMap((job) => [
      job.if,
      ...(job.steps ?? []).map((s) => s.if),
    ]);
    for (const expression of expressions.filter(Boolean)) {
      assert.doesNotMatch(
        expression,
        /steps\.deploy-paths/,
        `the deploy/** push axis is retired; nothing may read its output again: ${expression}`,
      );
    }
    assert.doesNotMatch(
      read('../../../.github/workflows/release.yml'),
      /deploy-paths/,
      'the deploy-paths step and every reference to it must be gone, in any position',
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

  // REMOVED 2026-08-10, with the deploy/** push axis they pinned:
  //
  //   - 'detects a deploy/** change from a step whose id the gate actually names'
  //   - 'scopes path detection to push events (ADR-040 empty-string trap)'
  //   - the missing-parent half of the fail-closed assertion below
  //   - 'keeps the provider lockfile from arming a push-tier prod apply'
  //
  // Recorded rather than silently deleted, because three of the four were
  // guarding real silent-green traps and a future reader should know the traps
  // went with the mechanism rather than being judged unimportant. The
  // step-id pin, the push-event scoping and the `git cat-file -e` fail-closed
  // guard have no subject once no step reads a path diff. The lockfile
  // exclusion is the one with a live successor: a provider-lock bump now
  // reaches production only by carrying a changeset for the deployment package,
  // which is strictly stronger than the pathspec exclusion it replaces — the
  // exclusion made lockfile churn NOT deploy, whereas the successor makes
  // nothing deploy without an explicit, reviewed declaration.
  //
  // What replaces all four is 'keeps the retired deploy/** push axis from
  // silently returning' above, which is a stronger guard than the four together
  // were: they constrained how the axis behaved, it forbids the axis existing.

  it('fetches full history in the release job, for version-bump detection', () => {
    // RENAMED 2026-08-10. The assertion is unchanged; its REASON is not.
    // Changelog attribution was the only surviving reason after the path-detection
    // step was retired. ADR-045's detection step revives the primary one, and more
    // strongly: it resolves two refs by SHA (`git cat-file -e` on
    // github.event.before, then `git show` against both), so an insufficient depth
    // makes the before-ref unreachable — which the detector treats as a DENIAL.
    // Silent no-deploy rather than the old silent over-deploy, but silent either
    // way. A stale rationale on a live pin is the drift this comment style exists
    // to prevent.
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
      'the release job must fetch full history — changesets/action needs it for changelog attribution',
    );
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
    // THE GATE, pinned BOTH exactly and by property. The exact pin is the
    // control; the property assertions below exist to tell a reader which parts
    // are load-bearing and why.
    //
    // PROPERTY PINS ALONE WERE NOT ENOUGH, and the gap is worth stating because
    // it looked like a strengthening. Four property assertions — contains
    // `!cancelled()`, no `always()`, contains the positive comparison, no
    // negated form — are satisfied by:
    //
    //     !cancelled() || needs.release.outputs.published == 'true'
    //
    // On every master push `!cancelled()` is true, so `||` makes the whole gate
    // true, docker-publish runs with publish_semver: true, and the bare
    // `:<semver>` tag is written on EVERY push — re-pointing a tag a self-hoster
    // has pinned. That falsifies ADR-040's Decision Driver "publishing an image
    // must never silently re-point a tag a self-hoster has already pinned" and
    // its Confirmation criterion that the bare digest is unchanged by a
    // docker-axis publish. Verified: that mutation passed all 24 assertions here.
    //
    // Property pins bind OPERANDS, not the OPERATOR. `DEPLOY_GATE` in this same
    // file is pinned by exact string for exactly this reason, with a comment
    // saying so — moving to properties dropped that control without replacing it.
    assert.equal(
      publish.if,
      "!cancelled() && needs.release.outputs.published == 'true'",
      'the docker-publish gate is pinned exactly: the CONJUNCTION is load-bearing, ' +
        'and an || inversion satisfies every property assertion below while publishing ' +
        'the bare :<semver> tag on every master push',
    );
    //
    // `!cancelled()` REPLACES GitHub's implicit `success()`. ADR-040 accepted a
    // Bad consequence here — the docker axis was not independent of the deploy
    // axis — and it was realised releasing 3.3.2: the publish succeeded, the
    // deploy failed, the implicit success() skipped this job, and a re-run could
    // not recover it because `published` is only 'true' on the run that consumes
    // the changesets. npm and production reached 3.3.2 while the registry stayed
    // on 3.3.1.
    assert.match(
      publish.if,
      /!cancelled\(\)/,
      'the docker publish must not inherit the implicit success() of the release job — ' +
        'a deploy failure after a successful publish would orphan the image, unrecoverably',
    );
    assert.doesNotMatch(
      publish.if,
      /always\(\)/,
      'must be !cancelled(), not always() — a cancelled run must not publish an image',
    );
    // The POSITIVE comparison is retained and is separately load-bearing: when
    // the changesets step publishes nothing the output is the empty string, and
    // `'' == 'true'` is false. The NEGATED form is the trap, so assert it is absent.
    assert.match(publish.if, /needs\.release\.outputs\.published == 'true'/);
    assert.doesNotMatch(
      publish.if,
      /published\s*!=/,
      "the negated form has an empty-string trap: `'' != 'true'` is TRUE, publishing on a run that released nothing",
    );
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

  it('forwards every env var it declares INTO the devcontainer (P095)', () => {
    // A devcontainers/ci step needs each variable declared TWICE: once in the
    // step's `env:` to put it on the runner, and once by bare name in
    // `with: env:` so the action forwards it into the container. deploy.sh runs
    // inside that container, so a variable with only the first declaration is
    // silently invisible to it.
    //
    // This is not hypothetical. ADDRESSR_DEPLOY_JUST_PUBLISHED — the signal that
    // tells deploy.sh a publish just happened on this run, so it should ship the
    // workspace version rather than reading the registry — shipped with only the
    // step declaration. The publish path would have silently taken the registry
    // read the design explicitly rejects, and every existing test passed: the
    // resolver's own test sets the variable directly, so it proves the mechanism
    // and says nothing about the wiring.
    const deploy = stepNamed('Deploy new version');
    const forwarded = new Set(
      String(deploy.with?.env ?? '')
        .split('\n')
        .map((l) => l.trim().split('=', 1)[0])
        .filter(Boolean),
    );
    const declared = Object.keys(deploy.env ?? {});
    const notForwarded = declared.filter((name) => !forwarded.has(name)).sort();
    assert.deepStrictEqual(
      notForwarded,
      [],
      `declared in the step's env: but never forwarded into the devcontainer, so deploy.sh cannot see them: ${notForwarded.join(', ')}`,
    );
  });

  it("holds ADR-001's deploy/** push-tier authorisation as retained history", () => {
    // WHAT THIS PIN IS FOR NOW, because its job changed on 2026-08-10.
    //
    // It began as ADR-040's mechanical prerequisite: release.yml must contain
    // no deploy/** path-detection step unless ADR-001 carries an amendment
    // naming that entry point AND its push-tier score. That prerequisite is now
    // discharged vacuously — the step is gone, so nothing needs authorising.
    //
    // The assertion is KEPT, and inherits a better job: it is the only
    // mechanical guard on the RETAINED HISTORY. DECISION-MANAGEMENT.md makes
    // retain-as-history REQUIRED once a decision is ratified and implemented,
    // and both hold here — ADR-001 carries human-oversight: confirmed and the
    // axis applied to production six times. So the 2026-07-27 authorisation
    // block must survive its own retirement, quoted rather than rewritten.
    //
    // NOT INVERTED, and that was a real option considered and rejected:
    // asserting the text is ABSENT would forbid the very history the governance
    // rule requires be kept — a test mandating a governance violation.
    //
    // STRENGTHENED at the same time, and the reason is subtle enough to be
    // worth spelling out. The old form asserted the co-occurrence of the
    // strings 'deploy/**' and 'push-tier' anywhere in the file. The RETIREMENT
    // amendment necessarily contains both. So from the moment that amendment
    // landed, the old assertion would have passed on the retirement block alone
    // — and someone deleting the 2026-07-27 authorisation block would have gone
    // green. That is precisely the vacuous pass the previous comment recorded
    // having verified against ("failing against ADR-001 as it stood before the
    // block landed"), re-introduced by the fix. Keying on the dated heading
    // co-occurring with the tier is what makes it fail on that deletion.
    assert.match(
      adr001,
      /\*\*Amendment 2026-07-27[^\n]*PUSH-TIER/,
      "ADR-001's 2026-07-27 deploy/** authorisation must be retained as history, not rewritten away — see DECISION-MANAGEMENT.md",
    );
    assert.ok(
      adr001.includes('deploy/**'),
      'ADR-001 must still name the deploy/** entry point it once authorised',
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

    // 2. The scan is default-deny, and it now lives in scripts/lib/scan-jobs.awk.
    //    THIS PIN NOW ASSERTS WIRING, NOT THE DECISION — the decision is
    //    fixture-tested in scan-jobs-awk.test.mjs against real conclusions and
    //    real exit codes. P085 predicted this pin's brittleness in terms: the
    //    awk-literal assertions "would hold the property and still break the
    //    pin" under a reimplementation, and that is exactly what extracting the
    //    filter did. What matters here is that the script loads the shared scan
    //    rather than growing a private copy that drifts from the tested one.
    assert.match(
      releaseWatch,
      /awk -F'\\t' -f "\$SCRIPT_DIR\/lib\/scan-jobs\.awk"/,
      'release-watch.sh must load the shared default-deny scan from scripts/lib/scan-jobs.awk',
    );
    // THE IDIOM, not just the path. The first version of this pin matched
    // `awk … -f "$SCRIPT_DIR/lib/scan-jobs.awk"` and nothing else — which is
    // identical whether the call site is a bare assignment or a guarded one,
    // so it could not fail on the defect the extraction actually introduced.
    //
    // scan-jobs.awk encodes its verdict in the exit code, so a bare
    // `VAR=$(… | awk …)` under `set -euo pipefail` takes awk's status and
    // terminates the script AT THE ASSIGNMENT. Every diagnostic below it
    // becomes unreachable: the failure banner, the job list, and the
    // `show_failure_guidance` block carrying the agent-facing routing line. A
    // loud failure becomes a silent exit 1 — on the release path, after the
    // publish and the apply. Verified by running it, and this file documents
    // the same hazard for the deployment-bump detector.
    assert.match(
      releaseWatch,
      /scan-jobs\.awk"\)\s*&&\s*SCAN_STATUS=0\s*\|\|\s*SCAN_STATUS=\$\?/,
      'release-watch.sh must CAPTURE the scan status, not bare-assign it — a bare assignment under set -e ' +
        'exits at the assignment and skips every diagnostic below',
    );
    // And the status must be READ. Capturing it and then branching only on
    // whether stdout was non-empty collapses UNKNOWN (2) into the success path,
    // which is the empty-scan defect reachable by another route.
    assert.match(
      releaseWatch,
      /\[ "\$SCAN_STATUS" -eq 2 \]/,
      'release-watch.sh must treat an UNKNOWN scan (exit 2) distinctly, not as success',
    );

    assert.doesNotMatch(
      releaseWatch,
      /\$1 == "success" \|\| \$1 == "skipped" \{ next \}/,
      'the scan must not be re-inlined here — one copy, fixture-tested, or it drifts again',
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
      waitIndex > -1 && scanIndex !== -1 && waitIndex < scanIndex,
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
    // The exemption moved with the scan; it is asserted by name and by
    // non-extension (a `check-deps-strict` must NOT inherit it) in
    // scan-jobs-awk.test.mjs, which can prove it rather than match it.
    assert.ok(
      existsSync(fileURLToPath(new URL('../../../scripts/lib/scan-jobs.awk', import.meta.url))),
      'the shared scan carrying the ADR-015 check-deps exemption must exist',
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
      waitIndex > -1 && scanIndex !== -1 && waitIndex < scanIndex,
      'completion must be asserted BEFORE the job scan',
    );
  });

  it('keeps the default-deny job scan and fails on a non-success run conclusion', () => {
    // The default-deny predicate IS the P085 remediation. The 2026-08-05 false
    // red was a missing precondition, not a scan that was too strict — so this
    // asserts the scan has not been softened to tolerate `pending`.
    assert.match(
      pushWatch,
      /awk -F'\\t' -f "\$SCRIPT_DIR\/lib\/scan-jobs\.awk"/,
      'push-and-watch.sh must load the shared default-deny scan from scripts/lib/scan-jobs.awk',
    );
    // THE IDIOM, not just the path. The first version of this pin matched
    // `awk … -f "$SCRIPT_DIR/lib/scan-jobs.awk"` and nothing else — which is
    // identical whether the call site is a bare assignment or a guarded one,
    // so it could not fail on the defect the extraction actually introduced.
    //
    // scan-jobs.awk encodes its verdict in the exit code, so a bare
    // `VAR=$(… | awk …)` under `set -euo pipefail` takes awk's status and
    // terminates the script AT THE ASSIGNMENT. Every diagnostic below it
    // becomes unreachable: the failure banner, the job list, and the
    // `show_failure_guidance` block carrying the agent-facing routing line. A
    // loud failure becomes a silent exit 1 — on the release path, after the
    // publish and the apply. Verified by running it, and this file documents
    // the same hazard for the deployment-bump detector.
    assert.match(
      pushWatch,
      /scan-jobs\.awk"\)\s*&&\s*SCAN_STATUS=0\s*\|\|\s*SCAN_STATUS=\$\?/,
      'push-and-watch.sh must CAPTURE the scan status, not bare-assign it — a bare assignment under set -e ' +
        'exits at the assignment and skips every diagnostic below',
    );
    // And the status must be READ. Capturing it and then branching only on
    // whether stdout was non-empty collapses UNKNOWN (2) into the success path,
    // which is the empty-scan defect reachable by another route.
    assert.match(
      pushWatch,
      /\[ "\$SCAN_STATUS" -eq 2 \]/,
      'push-and-watch.sh must treat an UNKNOWN scan (exit 2) distinctly, not as success',
    );

    // POINTED AT THE FILE THE SCAN NOW LIVES IN. Left aimed at pushWatch this
    // asserted the absence of a line from a file that could never contain it —
    // vacuous, and reading as coverage. The property itself is proven against
    // real input in scan-jobs-awk.test.mjs; this keeps the negative so a
    // re-inline-and-weaken in one step still reds.
    assert.doesNotMatch(
      readFileSync(fileURLToPath(new URL('../../../scripts/lib/scan-jobs.awk', import.meta.url)), 'utf8'),
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
