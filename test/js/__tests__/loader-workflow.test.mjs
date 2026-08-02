// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// Pins the quarterly G-NAF loader's caller/callee contract — the nine
// `update-{state}.yml` crons and `populate-search-domain.yml` calling into
// `reusable-update.yml`.
//
// WHY THIS EXISTS. A break here is SILENT. GitHub errors when a caller passes a
// secret the callee does not declare, but nothing surfaces that until a cron
// actually fires — and the crons are QUARTERLY. The 2026-08-02 v3 decommission
// had to remove the `TF_VAR_ELASTIC_V3_HOST` declaration from the callee and the
// matching pass-through from all nine callers in one commit, because removing
// either side alone breaks every loader for up to three months before anyone
// finds out. That is the failure shape this file exists to shorten.
//
// This fills ADR-034's Confirmation section, which is a stub — the literal text
// is "(deferred to /wr-architect:create-adr canonical review)". The properties
// asserted below are the checkable subset of ADR-034's own Decision Outcome:
// a least-privilege per-generation loader role, reached over OIDC, with the
// caller granting the token the callee cannot grant itself.
//
// SCOPING RULE, inherited from the sibling workflow pins: assert a property when
// its failure mode is silent-and-wrong, not merely broken. A workflow that fails
// to parse is caught by the first run; a workflow that resolves the wrong role,
// or drops a token the callee cannot request for itself, is not.
//
// WHERE THIS RUNS. `test:js` runs from the pre-commit hook AND, since
// 2026-08-02, as the "Workflow and unit pins" step in release.yml's
// build-and-test job on both matrix legs. The CI leg is the load-bearing one:
// `--no-verify` bypasses the hook and a GitHub-UI edit never touches it, and
// for a contract whose breakage surfaces a quarter later, hook-only enforcement
// was the wrong tier.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import yaml from 'js-yaml';

const WF = '.github/workflows';
const load = (f) => yaml.load(readFileSync(`${WF}/${f}`, 'utf8'));

// The CALLING job, not jobs[0]. populate-search-domain.yml has a `resolve-states`
// job ahead of the caller, so indexing the first job silently checks the wrong
// one — which this test did on its first run, and reported a defect that was its
// own. Select on `uses:` pointing at the callee.
const callingJob = (f) => {
  const jobs = Object.values(load(f).jobs);
  const caller = jobs.find((j) => String(j.uses ?? '').includes(CALLEE));
  assert.ok(caller, `${f} has no job calling ${CALLEE}`);
  return caller;
};

// `on:` parses as boolean true under YAML 1.1 — the coercion trap the
// terraform-plan pin documents. Read it by either key.
const triggers = (wf) => wf.on ?? wf[true];

const CALLEE = 'reusable-update.yml';
const callee = load(CALLEE);
const stateCrons = readdirSync(WF).filter((f) => /^update-[a-z]+\.yml$/.test(f));
const explicitCallers = stateCrons; // populate-search-domain uses `secrets: inherit`

describe('loader workflow contract', () => {
  it('has all nine state crons', () => {
    // If a state is dropped the quarterly refresh silently stops covering it.
    assert.equal(
      stateCrons.length,
      9,
      `expected 9 update-{state}.yml crons, found ${stateCrons.length}: ${stateCrons.join(', ')}`,
    );
  });

  it('every caller passes only secrets the callee declares', () => {
    // The load-bearing one. GitHub fails the run when a caller passes an
    // undeclared secret, so the two sides must move together — which is exactly
    // what the v3 decommission had to do across twelve files.
    const declared = new Set(Object.keys(callee.on?.workflow_call?.secrets ?? {}));
    assert.ok(declared.size > 0, 'callee must declare its secrets explicitly');

    for (const f of explicitCallers) {
      const job = callingJob(f);
      // `secrets: inherit` is a string, not a map — see the dedicated test below.
      if (typeof job.secrets === 'string') continue;
      for (const name of Object.keys(job.secrets ?? {})) {
        assert.ok(
          declared.has(name),
          `${f} passes secret '${name}' which ${CALLEE} does not declare — this fails the run, and only when the cron fires`,
        );
      }
    }
  });

  it('populate-search-domain uses `secrets: inherit` deliberately', () => {
    // Special-cased on purpose. `inherit` has no per-secret list, so the check
    // above iterates zero entries and passes vacuously. Pinning the `inherit`
    // means a future edit to an explicit map re-enters the checked path rather
    // than silently leaving it.
    const job = callingJob('populate-search-domain.yml');
    assert.equal(
      job.secrets,
      'inherit',
      'populate-search-domain.yml must use `secrets: inherit`; an explicit map here is unchecked by the contract test above unless this assertion is updated too',
    );
  });

  it('every caller grants id-token: write', () => {
    // A reusable workflow's own id-token permission is CAPPED by the caller's
    // token, so the callee cannot grant this to itself. Without it the loader
    // role assumption fails on the cron path — and it has bitten this repo
    // before, because the direct-dispatch canary did not exercise it.
    for (const f of [...stateCrons, 'populate-search-domain.yml']) {
      const job = callingJob(f);
      assert.equal(
        job.permissions?.['id-token'],
        'write',
        `${f} must grant id-token: write — the callee cannot grant it to itself, and the failure only appears on the cron path`,
      );
    }
  });

  it('the resolver fails closed on an unknown target', () => {
    // Positive form, per the architect's note: a bare absence assertion ("no v3
    // arm") passes identically whether the arm was removed or the whole resolve
    // step was deleted. Assert the else-branch errors and exits instead.
    const raw = readFileSync(`${WF}/${CALLEE}`, 'utf8');
    assert.match(raw, /::error::Unsupported target/);
    assert.match(
      raw,
      /::error::Unsupported target[\s\S]{0,120}?exit 1/,
      'the unknown-target branch must exit non-zero, not fall through',
    );
  });

  it('every declared target default resolves to an arm that exists', () => {
    // Four independent surfaces that can drift apart: the callee declares a
    // default under workflow_call AND under workflow_dispatch, and
    // populate-search-domain carries a third plus an options enum.
    const raw = readFileSync(`${WF}/${CALLEE}`, 'utf8');
    const arms = new Set([...raw.matchAll(/\$TARGET"?\s*=\s*"(v\d+)"/g)].map((m) => m[1]));
    assert.ok(arms.size > 0, 'could not parse any resolver arms');

    const t = triggers(callee);
    const defaults = [
      ['workflow_call', t.workflow_call?.inputs?.target?.default],
      ['workflow_dispatch', t.workflow_dispatch?.inputs?.target?.default],
    ];
    const populate = load('populate-search-domain.yml');
    const pIn = triggers(populate).workflow_dispatch.inputs.target;
    defaults.push(['populate-search-domain', pIn.default]);

    for (const [where, value] of defaults) {
      assert.ok(
        arms.has(value),
        `${where} default target '${value}' has no arm in ${CALLEE} (arms: ${[...arms].join(', ')})`,
      );
    }
    for (const option of pIn.options ?? []) {
      assert.ok(
        arms.has(option),
        `populate-search-domain offers '${option}' in its dispatch dropdown but ${CALLEE} has no arm for it — an operator would pick a target that cannot resolve, during exactly the recovery scenario where they would believe the dropdown`,
      );
    }
  });
});
