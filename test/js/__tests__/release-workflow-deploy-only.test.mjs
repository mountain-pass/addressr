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
    assert.ok(raw.includes('          fetch-depth: 0'));
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
