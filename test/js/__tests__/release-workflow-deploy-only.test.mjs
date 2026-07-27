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
// Known limitation (accepted): the occurrence count below pins the three
// deploy-bearing steps that exist today. A fourth deploy-path step added
// without the gate would not be caught. Cheap to harden if that day comes.

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
  "        if: success() && (steps.changesets.outputs.published == 'true' || inputs.deploy_only == true)";

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
