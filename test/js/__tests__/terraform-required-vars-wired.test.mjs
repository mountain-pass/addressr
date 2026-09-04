// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// Every Terraform root variable that declares NO default is required. Terraform
// runs with `-input=false`, so a required variable nobody supplies does not
// prompt — it errors, the plan dies before evaluating a single resource, and
// the deploy step reds. On a publishing release that lands AFTER npm and Docker
// have shipped, so the registry moves and production does not.
//
// This exists because `terraform-plan-workflow.test.mjs` asserts the two
// workflows' TF_VAR sets are EQUAL TO EACH OTHER. That is a real property and
// it stays. But it is satisfied when both are equally wrong, and on 2026-09-04
// it was: `ops_alert_sms` was added with no default and wired into neither, and
// the parity assertion passed green over a deploy that could not plan. Parity
// compares the workflows to one another; this compares them to what the module
// actually requires.
//
// The passthrough list is asserted separately from the step env, and that is
// the whole point rather than belt-and-braces. `devcontainers/ci` forwards ONLY
// the names it is given, so a variable present in `env:` and absent from the
// passthrough is set on the runner and invisible inside the container — the
// same failure with none of the same evidence.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VARS = readFileSync('apps/addressr-deployment/vars.tf', 'utf8');

// Variables Terraform receives by a route other than a workflow secret.
// `elasticapp_version` arrives in a generated .auto.tfvars written by the
// deploy script, so it is required by the module and correctly absent here.
const SUPPLIED_ELSEWHERE = new Set(['elasticapp_version']);

const WORKFLOWS = [
  '.github/workflows/release.yml',
  '.github/workflows/release-pr-plan.yml',
  '.github/workflows/terraform-plan.yml',
];

/** Brace-balanced body of the variable declaration starting at `index`. */
function variableBody(source, index) {
  let depth = 0;
  for (let i = source.indexOf('{', index); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(index, i + 1);
    }
  }
  return null;
}

function declarations(source) {
  return [...source.matchAll(/variable\s+"([a-z0-9_]+)"\s*\{/g)].map((m) => ({
    name: m[1],
    index: m.index,
  }));
}

/** Root variables with no `default`, so Terraform requires a value. */
function requiredVariables(source) {
  return declarations(source)
    .filter((d) => !/^\s*default\s*=/m.test(variableBody(source, d.index) ?? ''))
    .map((d) => d.name);
}

const required = requiredVariables(VARS).filter((n) => !SUPPLIED_ELSEWHERE.has(n));

describe('every required Terraform variable is wired into the deploy and plan paths', () => {
  it('finds required variables and workflows to check, so a zero-match pass is impossible', () => {
    // Without this the suite exits 0 over an empty corpus if vars.tf moves or
    // the declaration syntax changes — green over no coverage at all.
    assert.ok(
      required.length >= 5,
      `expected at least 5 required root variables, found ${required.length} — has vars.tf moved or the parser broken?`,
    );
    for (const path of WORKFLOWS) {
      assert.ok(
        readFileSync(path, 'utf8').includes('TF_VAR_'),
        `${path} carries no TF_VAR_ at all — has the plan step moved?`,
      );
    }
  });

  it('parses each variable body without over-running the next declaration', () => {
    // The brace matcher counts { and } with no regard for string literals. It
    // is balanced today — `{1,124}`, `{3}`, `{7,14}` — but an UNBALANCED brace
    // in a future validation regex would over-extend variable A's body, swallow
    // variable B's `default =`, and silently reclassify A as default-bearing,
    // dropping it from the set this file checks.
    //
    // A sum-of-partitions check CANNOT see that, which is why the first version
    // of this assertion was worthless: B is parsed independently on the next
    // iteration and still classifies correctly, so the totals reconcile and the
    // assertion holds by construction. The falsifiable property is CONTAINMENT
    // — each body must end before the next declaration begins — and that is
    // exactly what over-extension violates.
    const starts = declarations(VARS);
    assert.ok(
      starts.length >= 10,
      `expected at least 10 variable declarations, found ${starts.length}`,
    );
    const overruns = [];
    for (const [i, decl] of starts.entries()) {
      const body = variableBody(VARS, decl.index);
      assert.ok(body, `could not parse a balanced body for ${decl.name}`);
      const next = starts[i + 1];
      if (next && decl.index + body.length > next.index) {
        overruns.push(`${decl.name} body runs past the start of ${next.name}`);
      }
    }
    assert.deepEqual(
      overruns,
      [],
      `variable bodies overran the following declaration — an unbalanced brace has hidden a required variable:\n${overruns.join('\n')}`,
    );
  });

  for (const path of WORKFLOWS) {
    it(`${path} passes every required variable to Terraform`, () => {
      const wf = readFileSync(path, 'utf8');
      const missingEnv = required.filter(
        (name) => !new RegExp(String.raw`^\s*TF_VAR_${name}\s*:`, 'm').test(wf),
      );
      assert.deepEqual(
        missingEnv,
        [],
        `required Terraform variables absent from the step env in ${path}: ${missingEnv.join(', ')}\n` +
          `A required variable nobody supplies makes the plan fail before any resource is evaluated.`,
      );

      const missingPassthrough = required.filter(
        (name) => !new RegExp(String.raw`^\s*TF_VAR_${name}\s*$`, 'm').test(wf),
      );
      assert.deepEqual(
        missingPassthrough,
        [],
        `required Terraform variables absent from the devcontainer passthrough list in ${path}: ${missingPassthrough.join(', ')}\n` +
          `The action forwards only the names it is given, so these are set on the runner and unset inside the container.`,
      );
    });
  }
});
