// `release-pr-plan.yml` — the Terraform plan on the changesets release PR.
//
// WHAT THIS GUARDS. ADR-045 made merging a release PR that bumps
// `apps/addressr-deployment` the thing that applies Terraform to production.
// This workflow is the only thing on that path that shows the plan first. Its
// failure modes are all silent:
//
//   - the fork guard drops         -> a fork PR plans with EMPTY secrets, and the
//                                     empty proxy-auth pair renders as tearing
//                                     down the ADR-024 boundary, on a green run
//   - the PLAN_ONLY refuse-step is removed or reordered
//                                  -> a ref without the branch APPLIES while the
//                                     workflow calls itself read-only
//   - the env drifts from release.yml's Deploy step
//                                  -> the plan answers a different question than
//                                     the apply, which is worse than no plan
//   - `fetch-depth: 0` is dropped  -> the detector cannot resolve the base ref,
//                                     denies, and the comment says "will NOT
//                                     apply" on every release PR
//   - raw plan JSON reaches the comment
//                                  -> every root variable in CLEARTEXT on a
//                                     public repo (`sensitive = true` flags but
//                                     does not redact `-json`)
//
// None of these reds anything on their own. That is why they are pinned.
//
// HONEST LIMIT. This asserts the workflow's SHAPE. It does not run the workflow,
// so it cannot prove GitHub evaluates the `if:` as intended, nor that a fork PR
// genuinely receives no secrets — those are platform semantics. What it can and
// does prove is that the conditions are present, exact, and ordered.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => yaml.parse(readFileSync(`${repoRoot}${p}`, 'utf8'));
const raw = (p) => readFileSync(`${repoRoot}${p}`, 'utf8');

const PLAN_FILE = '.github/workflows/release-pr-plan.yml';
const planWf = read(PLAN_FILE);
const planRaw = raw(PLAN_FILE);
// Comment lines stripped. An assertion that a string is ABSENT must not be
// satisfiable-or-broken by prose EXPLAINING why the thing is absent — this file's
// header discusses both `terraform show` and `cancel-in-progress` at length,
// precisely to record why neither is used. Scope the check to executable content.
const planExec = planRaw
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');
const releaseWf = read('.github/workflows/release.yml');

const planSteps = planWf.jobs.plan.steps;
const planStep = (name) => {
  const s = planSteps.find((x) => x.name === name);
  assert.ok(s, `release-pr-plan.yml must have a step named "${name}"`);
  return s;
};

describe('release-pr-plan — it cannot reach a production apply', () => {
  it('refuses a ref whose deploy.sh lacks the PLAN_ONLY branch, BEFORE planning', () => {
    // Order is the assertion. A refuse-step that runs after the plan step has
    // already let the apply happen. terraform-plan.yml records that this was
    // the literal state of master for a window: "a guard must land before or
    // with its caller, never after."
    const names = planSteps.map((s) => s.name);
    const refuseAt = names.indexOf('Refuse to run against a ref whose deploy.sh would apply');
    const planAt = names.indexOf('Terraform plan (no apply)');
    assert.ok(refuseAt >= 0, 'the PLAN_ONLY refuse-step must exist');
    assert.ok(planAt >= 0, 'the plan step must exist');
    assert.ok(refuseAt < planAt, 'the refuse-step must precede the plan step');
    assert.match(planStep('Refuse to run against a ref whose deploy.sh would apply').run, /PLAN_ONLY/);
  });

  it('plans via deploy:plan, which is the PLAN_ONLY entry point', () => {
    assert.match(planStep('Terraform plan (no apply)').with.runCmd, /npm run deploy:plan/);
  });
});

describe('release-pr-plan — the fork guard', () => {
  it('requires BOTH the release branch AND the same repository', () => {
    // The second conjunct is not redundant: a FORK can name its branch
    // `changeset-release/master`, so head_ref alone does not separate them. A
    // fork PR gets no secrets, so every TF_VAR resolves empty, main.tf's
    // precondition passes on the empty proxy-auth pair, and the plan renders as
    // tearing down the ADR-024 origin gateway boundary — from a GREEN run.
    const guard = planWf.jobs.plan.if;
    assert.match(
      guard,
      /github\.head_ref == 'changeset-release\/master'/,
      'must be scoped to the changesets release branch',
    );
    assert.match(
      guard,
      /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
      'must require the PR head to be in THIS repository — the fork guard',
    );
    assert.match(guard, /&&/, 'the two conjuncts must both hold, not either');
  });
});

describe('release-pr-plan — it plans what the apply will actually do', () => {
  it('carries the SAME TF_* key set as release.yml Deploy, step env AND with.env', () => {
    // DERIVED, not restated. A hardcoded list here would drift from the apply
    // silently, and a plan run under different inputs than the apply answers a
    // different question — worse than no plan.
    //
    // BOTH SURFACES, not just `env:`. An earlier version of this test read the
    // step-level `env:` only, which left it blind to `with.env` — where the
    // LITERALS live (TF_IN_AUTOMATION=1, TF_VAR_elasticapp=..., TF_WORKSPACE=prod).
    // A literal added to one side's with.env and not the other's changes what
    // Terraform sees while this assertion stays green, which is the exact
    // silent-drift this test exists to prevent. Read the union.
    const tfKeys = (step) => {
      const fromEnv = Object.keys(step.env ?? {});
      const fromWith = String(step.with?.env ?? '')
        .split('\n')
        .map((l) => l.trim().split('=')[0])
        .filter(Boolean);
      return [...new Set([...fromEnv, ...fromWith])]
        .filter((k) => k.startsWith('TF_'))
        .sort();
    };

    const deployStep = releaseWf.jobs.release.steps.find((s) => s.name === 'Deploy new version');
    assert.ok(deployStep, 'release.yml must have a Deploy new version step');

    // The ONLY sanctioned difference, each entry with its reason. Anything else
    // appearing on either side fails, which is the point.
    //
    //   TF_WORKSPACE — the apply derives it inside deploy.sh from
    //   npm_lifecycle_event (`deploy:prod`); PLAN_ONLY hard-refuses that
    //   derivation and demands it explicitly, because the fallback would target a
    //   workspace that does not exist and render a full-create diff that reads
    //   like an answer. Same resolved workspace, stated instead of derived.
    const PLAN_ONLY_EXTRAS = ['TF_WORKSPACE'];

    assert.deepEqual(
      tfKeys(planStep('Terraform plan (no apply)')),
      [...tfKeys(deployStep), ...PLAN_ONLY_EXTRAS].sort(),
      'the plan must receive exactly the TF_ inputs the apply receives, plus only the explained extras',
    );
  });

  it('forwards every TF_ var it declares INTO the devcontainer', () => {
    // The P095 trap: a var declared in the step env but not listed by bare name
    // in `with.env` never reaches the container, so the plan runs without it and
    // renders a difference that is an artefact of the harness.
    const step = planStep('Terraform plan (no apply)');
    const declared = Object.keys(step.env ?? {}).filter((k) => k.startsWith('TF_'));
    const forwarded = String(step.with.env).split('\n').map((l) => l.trim().split('=')[0]);
    for (const key of declared) {
      assert.ok(forwarded.includes(key), `${key} is declared but never forwarded into the devcontainer`);
    }
  });

  it('sets TF_WORKSPACE explicitly, because PLAN_ONLY refuses without it', () => {
    // deploy.sh hard-refuses PLAN_ONLY without an explicit workspace: the
    // fallback derives it from npm_lifecycle_event and would target a workspace
    // that does not exist, yielding a full-create diff that reads like an answer.
    assert.match(String(planStep('Terraform plan (no apply)').with.env), /TF_WORKSPACE=prod/);
  });

  it('does NOT set ADDRESSR_DEPLOY_JUST_PUBLISHED — a decision, not an omission', () => {
    // User-decided 2026-08-10: the plan does not predict the deployed version.
    // Whether the merge publishes cannot be known before the merge, and a plan
    // confidently wrong about the version reads as authoritative. Its absence
    // makes resolve-version.sh take the registry path, which MATCHES the apply
    // exactly on the infra-only disjunct — the case this workflow exists for.
    const step = planStep('Terraform plan (no apply)');
    assert.ok(
      !('ADDRESSR_DEPLOY_JUST_PUBLISHED' in (step.env ?? {})),
      'setting this would make the plan predict a publish outcome it cannot know',
    );
    assert.doesNotMatch(String(step.with.env), /ADDRESSR_DEPLOY_JUST_PUBLISHED/);
  });
});

describe('release-pr-plan — the raw plan never leaves the runner', () => {
  it('projects to a whitelist of address and actions, never the raw document', () => {
    // `terraform show -json` emits every root variable value in CLEARTEXT.
    // `sensitive = true` flags but does not redact the JSON form. This repo is
    // public. A whitelist cannot fail open when a new sensitive variable is
    // added to the root module; a denylist would.
    const project = planStep('Project the plan to addresses and actions');
    assert.match(project.run, /\{address, actions/, 'must project address + actions only');
  });

  it('never emits the raw plan into the PR comment', () => {
    // Scoped to THIS FILE. `deploy.sh` itself runs `terraform show -no-color`
    // into the job log — a pre-existing, deliberate posture (human-readable
    // `show` DOES redact sensitive values; only `-json` does not). What must
    // never happen is the raw document reaching the comment.
    assert.doesNotMatch(
      planExec,
      /terraform show/,
      'this workflow must not invoke terraform show; the projection is the only plan surface it emits',
    );

    // A WHITELIST of interpolations, not a regex for one leak shape. The
    // previous version matched `tfplan.json` immediately before a `}}` — which
    // is only ONE way the document reaches the comment, and not the likely one.
    // `cat tfplan.json >> "$GITHUB_OUTPUT"` in the projection step puts the raw
    // JSON into `steps.project.outputs.summary`, and the comment then
    // interpolates it under a name that looks projected. That passes a
    // shape-matching regex and passes the `{address, actions` check on the
    // surviving jq. Enumerate what MAY be interpolated instead: a new expression
    // in the comment body fails until it is named here.
    const script = String(planStep('Upsert the plan comment').with.script);
    const ALLOWED_INTERPOLATIONS = [
      'toJSON(steps.arms.outputs.changed)',
      'toJSON(job.status)',
      'toJSON(steps.project.outputs.summary)',
    ];
    const used = [...script.matchAll(/\$\{\{\s*(.*?)\s*\}\}/g)].map((m) => m[1]);
    assert.ok(used.length > 0, 'the comment step must interpolate something; the regex may have rotted');
    for (const expr of used) {
      assert.ok(
        ALLOWED_INTERPOLATIONS.includes(expr),
        `\`\${expr}\` is interpolated into the PR comment but is not on the whitelist. `
          + 'If it is safe, add it here WITH its reason; if it carries plan attribute '
          + 'values or root variables, it must not reach a public PR comment.',
      );
    }
  });

  it('lets nothing but jq read the plan file, so `summary` cannot BE the raw plan', () => {
    // The other half of the whitelist above. `steps.project.outputs.summary` is
    // trusted by the comment step, so what writes it has to be constrained here
    // or the trust is unearned. jq with the projecting filter is the only
    // sanctioned reader; a passthrough would hand the comment the whole document
    // under a name that reads as already-projected.
    const run = String(planStep('Project the plan to addresses and actions').run);
    assert.doesNotMatch(
      run,
      /\b(cat|tee|head|tail|cp|mv|xxd|base64|awk|sed|grep)\b[^\n]*tfplan\.json/,
      'only jq may read tfplan.json; a passthrough command would emit the raw document',
    );
    // And the jq that does read it must project, not select-all.
    assert.match(run, /\{address, actions/, 'the jq filter must project to address + actions');
    assert.doesNotMatch(run, /jq[^\n]*'\s*\.\s*'/, 'jq must not emit the whole document');

    // HONEST LIMIT: this constrains the shapes a leak is likely to take, not
    // every shape it could take — a sufficiently creative shell line could still
    // route the file to stdout. The structural guarantee is the whitelist in the
    // comment step above; this narrows the remaining surface behind it.
  });
});

describe('release-pr-plan — the artefact exists in both outcomes', () => {
  it('comments even when the plan fails', () => {
    // The "checkable artefacts, not memory" outcome is satisfied by a comment
    // that EXISTS. Without always(), a job that fails on TFC lock contention or
    // a devcontainer error leaves NO comment — indistinguishable from "hasn't
    // run yet" — and the merge proceeds with no artefact at all.
    assert.equal(planStep('Upsert the plan comment').if, 'always()');
    assert.equal(planStep('Project the plan to addresses and actions').if, 'always()');
  });

  it('upserts on a marker rather than appending', () => {
    // changeset-release/master is force-pushed on every push to master. Without
    // an upsert the PR accumulates one comment per push and the current plan is
    // buried.
    assert.match(planStep('Upsert the plan comment').with.script, /release-pr-plan/);
    assert.match(planStep('Upsert the plan comment').with.script, /updateComment/);
  });
});

describe('release-pr-plan — the detector, and the depth it needs', () => {
  it('reuses the deploy gate’s own predicate rather than a lookalike', () => {
    // Two implementations of "did this arm a deploy" would drift, and the drift
    // would be invisible until an apply silently did or did not happen.
    assert.match(planStep('Will merging this arm a production apply?').run, /detect-deployment-bump\.sh/);
  });

  it('checks out full history, or the detector denies on every release PR', () => {
    // Under the default depth 1 the base ref is unreachable, the detector's
    // fail-closed branch fires, and the comment reports "will NOT apply" every
    // time — silently, and in the direction of under-warning.
    const checkout = planSteps.find((s) => String(s.uses ?? '').startsWith('actions/checkout'));
    assert.ok(checkout, 'the job must check out the repo');
    assert.equal(checkout.with?.['fetch-depth'], 0);
  });
});

describe('release-pr-plan — concurrency must NOT be shared with the apply', () => {
  it('uses a per-PR group, because sharing release.yml’s cancels a QUEUED apply', () => {
    // This assertion is INVERTED from what it originally said, and the reason is
    // the whole point of it.
    //
    // Sharing `Release-refs/heads/master` looks protective: release.yml sets no
    // cancel-in-progress, so a plan entering the group queues rather than
    // cancelling an in-flight apply. But GitHub ALSO cancels a previously
    // PENDING run when a newer one enters the group. So: a multi-minute plan
    // holds the group -> the release PR merges and its release.yml run queues ->
    // any further push to master enters the group and cancels that queued run ->
    // the replacement run sees the deployment version unchanged, the detector
    // says changed=false, Deploy/Wait/Smoke skip, and P044 passes because it
    // reads packages/addressr, which a deployment-only changeset never bumps.
    //
    // A merged infrastructure release applies NOTHING, on green, with no signal.
    // The exact class ADR-045 exists to remove, arriving via the workflow built
    // to illuminate it.
    //
    // The real serialiser was never the group: local execution takes the TFC
    // workspace lock, so a plan racing an apply fails LOUDLY on a locked
    // workspace. Red beats silent green.
    assert.match(
      String(planWf.concurrency),
      /github\.event\.pull_request\.number/,
      'the group must be per-PR, so plan runs can never occupy release.yml’s group',
    );
    assert.doesNotMatch(
      String(planWf.concurrency),
      /Release-refs/,
      'sharing release.yml’s group silently cancels a QUEUED production apply',
    );
    assert.doesNotMatch(planExec, /cancel-in-progress/);
  });

  it('grants only the permissions it needs', () => {
    assert.deepEqual(planWf.permissions, { contents: 'read', 'pull-requests': 'write' });
  });
});

describe('release-pr-plan — the trigger surface itself', () => {
  it('triggers on pull_request ONLY, never pull_request_target', () => {
    // NOTHING pinned this before, so every other assertion in this file passed
    // identically under `pull_request_target` — which runs in the BASE repo's
    // context WITH SECRETS, executing the PR head's code. The fork guard would
    // still hold, but the reason it can be relied on ("a fork PR receives no
    // secrets") would silently stop being true, and this workflow runs
    // `npm ci` + a devcontainer + deploy.sh from the checked-out ref.
    //
    // Asserted as an exhaustive key set, not a presence check: an ADDED trigger
    // (`push`, `workflow_dispatch`, `schedule`) is just as much a change to the
    // surface as a swapped one.
    assert.deepEqual(Object.keys(planWf.on), ['pull_request'], 'exactly one trigger');
    assert.deepEqual(planWf.on.pull_request.branches, ['master']);
    assert.doesNotMatch(planExec, /pull_request_target/);
  });

  it('checks out the PR ref with no explicit `ref:`, so it plans the MERGE result', () => {
    // Default `actions/checkout` on a pull_request event resolves
    // `refs/pull/N/merge` — the merge of head into base. That is the correct
    // subject for "what would merging do", and it is what makes the PLAN_ONLY
    // refuse-step inspect the POST-merge deploy.sh rather than the base one.
    // An explicit `ref: head.sha` would quietly change the question to "what
    // would this branch alone do", so the absence is a decision.
    const checkout = planSteps.find((s) => String(s.uses ?? '').startsWith('actions/checkout'));
    assert.ok(!('ref' in (checkout.with ?? {})), 'no explicit ref — the merge ref is the subject');
    assert.match(
      String(planStep('Upsert the plan comment').with.script),
      /MERGE of/,
      'the comment must name the merge, not the head commit alone',
    );
  });
});
