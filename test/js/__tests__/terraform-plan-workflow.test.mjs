// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// Pins .github/workflows/terraform-plan.yml — the read-only plan surface that
// lets a deploy/** change be pre-verified before the push that applies it.
//
// Asserted in test rather than by grep, per ADR-040's Confirmation. This repo
// has been bitten repeatedly by workflow predicates that silently evaluate to
// the wrong thing (the boolean-coercion trap and the empty-string job-output
// trap, both in release.yml), so the properties this workflow's safety rests on
// are pinned here rather than trusted to review.
//
// Two load-bearing properties. First, JTBD-400's "prod is reached through a
// single gated path" outcome: a PLAN_ONLY branch living inside the same script
// that applies is exactly the shape that could erode it, so apply must be
// unreachable. Second, the artifact rule: `terraform show -json` emits EVERY
// root variable value in cleartext — `sensitive = true` flags them, it does not
// redact them — so uploading the raw plan on a public repo would publish the
// production AWS key pair, the ADR-024 proxy-auth secret and the Cloudflare
// token. Only an address+actions projection may leave the runner.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const PATH = '.github/workflows/terraform-plan.yml';
const raw = readFileSync(PATH, 'utf8');
const wf = yaml.load(raw);

// `on:` parses as boolean true in YAML 1.1 — the same coercion trap release.yml
// documents. Read it by either key rather than assuming which one lands.
const triggers = wf.on ?? wf[true];

describe('terraform-plan.yml', () => {
  it('is dispatch-only — never push or pull_request', () => {
    assert.ok(
      Object.hasOwn(triggers, 'workflow_dispatch'),
      'must be dispatchable',
    );
    // A fork PR receives NO secrets, so every TF_VAR_* resolves to empty. That
    // is not a failed plan, it is a confidently wrong one: the proxy-auth pair
    // both default to "", main.tf's precondition passes on the empty pair, and
    // the plan renders as tearing down the ADR-024 enforcement boundary — from
    // a green run. pull_request_target would be worse: it hands fork-authored
    // code the production AWS keys.
    assert.equal(triggers.push, undefined, 'must not run on push');
    assert.equal(
      triggers.pull_request,
      undefined,
      'must not run on pull_request — fork PRs get no secrets',
    );
    assert.equal(
      triggers.pull_request_target,
      undefined,
      'pull_request_target would hand fork code the production AWS keys',
    );
  });

  it('shares the Release concurrency group so it cannot race an in-flight apply', () => {
    // Load-bearing, not cosmetic: the TFC workspace is remote-state /
    // local-execution (proved by prod deploys succeeding with `-out`, which the
    // remote backend rejects under remote execution), so `terraform plan` takes
    // the workspace lock. Keying on github.workflow would give this its own
    // group and would not prevent the race.
    const group = String(wf.concurrency);
    assert.match(group, /^Release-/);
    // Must be ref-INDEPENDENT. release.yml runs only on master, so interpolating
    // github.ref here matches its group only when dispatched on master and forms
    // a separate group on a branch — the very path this workflow recommends.
    // The previous /^Release-/ assertion passed on that buggy value.
    assert.ok(
      !/github\.ref/.test(group),
      'concurrency must not interpolate github.ref',
    );
  });

  it('grants no write permissions', () => {
    assert.deepEqual(wf.permissions, { contents: 'read' });
  });

  const steps = () => wf.jobs.plan.steps;
  const planStep = () => steps().find((x) => /plan/i.test(x.name ?? ''));

  it('runs the plan against the prod workspace', () => {
    const s = planStep();
    assert.ok(s, 'a plan step must exist');
    assert.match(s.with.env, /TF_WORKSPACE=prod/);
    assert.match(s.with.runCmd, /deploy:plan/);
  });

  it('passes the same TF_VAR set as the release Deploy step', () => {
    // The design rests on the plan running under identical inputs to the apply.
    // A plan under different inputs answers a different question. Read out of
    // release.yml at test time so a future TF_VAR_ addition fails here.
    const release = yaml.load(
      readFileSync('.github/workflows/release.yml', 'utf8'),
    );
    const deployStep = release.jobs.release.steps.find((s) =>
      /Deploy new version/i.test(s.name ?? ''),
    );
    const tfVars = (o) =>
      Object.keys(o ?? {})
        .filter((k) => k.startsWith('TF_VAR_') || k.startsWith('TF_TOKEN_'))
        .sort();
    assert.deepEqual(tfVars(planStep().env), tfVars(deployStep.env));
  });

  it('never uploads the raw plan — only an address+actions projection', () => {
    const uploads = steps().filter((s) =>
      String(s.uses ?? '').includes('upload-artifact'),
    );
    for (const u of uploads) {
      const p = String(u.with?.path ?? '');
      assert.ok(
        !/tfplan/.test(p),
        `upload path ${p} would publish cleartext root variable values`,
      );
    }
  });

  it('cannot reach apply — the single gated path stays single', () => {
    // Executable content only. The header comment legitimately discusses
    // `terraform apply` when explaining what this workflow exists to avoid, and
    // an assertion that cannot tell prose from a command would forbid the
    // documentation that makes the workflow comprehensible.
    const code = raw
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    assert.ok(!/terraform\s+apply/.test(code), 'plan workflow must never apply');
    assert.ok(!/deploy:prod/.test(code), 'must not invoke the applying script');
    assert.ok(
      !/deploy_only/.test(code),
      'must not invoke the release deploy path',
    );
  });
});
