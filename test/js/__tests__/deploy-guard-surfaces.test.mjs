// The two surfaces of the ADR-045 criterion 5 changeset guard: `.husky/pre-push`
// and `.github/workflows/deploy-guard.yml`.
//
// WHY BOTH ARE PINNED TOGETHER. Criterion 5 requires the guard run "as a
// `pre-push` hook AND as a CI leg… on the grounds that a client-side-only gate
// is bypassable and the failure it guards is silent and green." Either surface
// silently losing its scope, its depth, or its call to the shared predicate
// leaves the other looking like coverage. The failure modes are all quiet:
//
//   - the hook stops blocking      -> `set -e` dropped, or the guard is no
//                                     longer the last statement, so a non-zero
//                                     exit is discarded. Green, silent, and
//                                     indistinguishable from a pass.
//   - the master scoping is lost   -> the guard reds the short-lived-branch
//                                     plan push JTBD-400 explicitly sanctions
//   - `fetch-depth: 0` is dropped  -> `github.event.before` is unreachable, the
//                                     range is indeterminable, and CI refuses
//                                     every push that lacks a qualifying
//                                     changeset. Over-firing, which ADR-045
//                                     names as falsifying the rule.
//   - a surface stops calling the shared script
//                                  -> two predicates, drifting, and the drift
//                                     invisible until an apply silently did or
//                                     did not happen.
//
// The hook's blocking behaviour is asserted BEHAVIOURALLY — a real push to a
// real local remote — not by reading the file's shape. Shape is what made the
// old file look fine while its `|| echo` guaranteed exit 0.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');

const HOOK = '.husky/pre-push';
const WORKFLOW = '.github/workflows/deploy-guard.yml';
const PREDICATE = 'scripts/check-deployment-changeset.sh';

const hookRaw = read(HOOK);
const workflowRaw = read(WORKFLOW);
const workflow = yaml.parse(workflowRaw);
// Comment lines stripped. An assertion that something is ABSENT must not be
// satisfiable by prose EXPLAINING its absence — this workflow's header discusses
// release.yml's concurrency group and the pull_request trigger at length,
// precisely to record why neither is used.
const workflowExec = workflowRaw
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');
const hookExec = hookRaw
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');

describe('deploy guard — both surfaces run the SAME predicate', () => {
  it('the hook calls the shared script', () => {
    assert.match(hookExec, new RegExp(PREDICATE.replace(/[.]/g, '\\.')));
  });

  it('the CI leg calls the shared script', () => {
    assert.match(workflowExec, new RegExp(PREDICATE.replace(/[.]/g, '\\.')));
  });

  it('neither reimplements the predicate inline', () => {
    // Two implementations of "will anything bump the deployment package" would
    // drift, and the drift would be invisible until an apply silently did or did
    // not happen. Same reasoning as release-pr-plan.yml reusing
    // detect-deployment-bump.sh rather than a lookalike.
    for (const [name, body] of [['hook', hookExec], ['workflow', workflowExec]]) {
      assert.doesNotMatch(body, /\.changeset\/\*\.md/, `${name} must not enumerate changesets itself`);
      assert.doesNotMatch(body, /ls-tree/, `${name} must not read the tree itself`);
    }
  });
});

describe('deploy guard — the hook', () => {
  it('sets -e, without which a non-last failure is silently discarded', () => {
    assert.match(hookExec, /^\s*set -e\s*$/m, 'set -e must be present');
  });

  it('keeps the dependency check advisory', () => {
    // Mature dependency updates are information, not a reason to refuse a push.
    //
    // Keyed on the SHAPE, not on the command. This assertion previously matched
    // the literal `check-deps || echo` and went red on 2026-09-04 when the
    // invocation changed to exec the binary directly under a bound — a change
    // that did not weaken the property it guards at all. A test that reds on a
    // faithful refactor of the thing it protects trains people to edit the test,
    // which is how the property gets lost. What matters is that whatever line
    // runs the dependency check contains an `|| ` so its failure is survivable
    // under `set -e`, and that the changeset guard below it still runs.
    const line = hookExec
      .split('\n')
      .find((l) => !l.trimStart().startsWith('#') && /check-deps|dry-aged-deps/.test(l));
    assert.ok(line, 'the hook runs no dependency check — has it moved?');
    assert.match(line, /\|\|/, `the dependency check must stay non-blocking: ${line.trim()}`);
  });

  it('scopes to master, which is what keeps the sanctioned branch push green', () => {
    // JTBD-400 sanctions dispatching the plan workflow against a short-lived
    // branch. That push is a new remote branch (all-zeros), carries files under
    // the watched tree, and usually has no changeset — guarding it would red a
    // documented workflow on day one.
    assert.match(hookExec, /refs\/heads\/master/, 'must scope to master');
  });

  it('skips a branch DELETION, which changes no files', () => {
    assert.match(hookExec, /0000000000000000000000000000000000000000/, 'must skip an all-zeros LOCAL sha');
  });

  it('reads the refs git gives it on stdin rather than @{u}', () => {
    // @{u} would follow whatever the branch happens to track, which is not
    // necessarily the ref being pushed.
    assert.match(hookExec, /while read -r/, 'must consume the stdin ref lines');
    assert.doesNotMatch(hookExec, /@\{u\}/, 'must not resolve the upstream itself');
  });

  it('runs the guard LAST, so its exit status is the hook’s exit status', () => {
    // Belt and braces with `set -e`: even if someone removes set -e, a guard in
    // final position still decides the hook's status. Both together, because
    // either alone has been enough to produce a silently non-blocking hook.
    const statements = hookExec
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const last = statements.slice(-3).join('\n');
    assert.match(last, /check-deployment-changeset\.sh|done/, 'the guard loop must be the final statement');
  });
});

describe('deploy guard — the hook actually blocks a real push', () => {
  // Behavioural, not shape. The old file looked fine and could not block.
  let work;
  before(() => {
    work = mkdtempSync(path.join(tmpdir(), 'guard-hook-'));
  });
  after(() => {
    rmSync(work, { recursive: true, force: true });
  });

  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

  /** A repo with a real bare remote and this repo's hook + predicate installed. */
  const scaffold = (name) => {
    const remote = path.join(work, `${name}.git`);
    const dir = path.join(work, name);
    execFileSync('git', ['init', '-q', '--bare', '-b', 'master', remote]);
    execFileSync('git', ['init', '-q', '-b', 'master', dir]);
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 'T');
    git(dir, 'remote', 'add', 'origin', remote);

    const put = (rel, body) => {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), body);
    };
    put('package.json', JSON.stringify({
      name: 'addressr-workspace', private: true, workspaces: ['packages/*', 'apps/*'],
      scripts: { 'check-deps': 'true' },
    }));
    put('packages/addressr/package.json', JSON.stringify({ name: '@mountainpass/addressr', version: '3.3.0' }));
    put('apps/addressr-deployment/package.json', JSON.stringify({
      name: '@mountainpass/addressr-deployment', version: '1.0.0', private: true,
      dependencies: { '@mountainpass/addressr': '3.3.0' },
    }));
    put('apps/addressr-deployment/main.tf', 'resource "null_resource" "a" {}\n');
    put('.changeset/README.md', 'readme\n');

    mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    copyFileSync(path.join(repoRoot, PREDICATE), path.join(dir, PREDICATE));
    chmodSync(path.join(dir, PREDICATE), 0o755);

    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'base');
    // Establish master BEFORE installing the hook. Deliberate, and it models the
    // real repository rather than dodging an inconvenience: master already
    // exists on `addressr`, so `github.event.before` is a real parent on every
    // push and the all-zeros case cannot arise there. Installing the hook first
    // would test repo CREATION, which is a different scenario — and one that is
    // pinned on its own below rather than left as a side effect of setup.
    git(dir, 'push', '-q', 'origin', 'master');

    // The real hook, copied verbatim — not a rewrite. The dependency check is
    // absent from this fixture, so it exits non-zero and the hook's `|| echo`
    // swallows it, which is exactly the survivable-failure path and leaves the
    // guard below to be exercised. The `check-deps` script stubbed in the
    // manifest above is now vestigial: since 2026-09-04 the hook execs the
    // binary directly rather than going through the package manager, so the
    // script is not consulted. Kept because it costs nothing and documents the
    // intent if the invocation ever routes back through the manifest.
    const hookPath = path.join(dir, '.git', 'hooks', 'pre-push');
    writeFileSync(hookPath, `#!/usr/bin/env sh\n${hookRaw}`);
    chmodSync(hookPath, 0o755);
    return dir;
  };

  const push = (dir, ...args) => {
    try {
      execFileSync('git', ['push', 'origin', ...args], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, out: '' };
    } catch (e) {
      return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };

  it('REFUSES a push of an infrastructure change with nothing pending', () => {
    const dir = scaffold('blocks');
    writeFileSync(path.join(dir, 'apps/addressr-deployment/main.tf'), 'resource "null_resource" "b" {}\n');
    git(dir, 'commit', '-qam', 'terraform only');
    const r = push(dir, 'master');
    assert.notEqual(r.status, 0, `the push must be refused\n--- got ---\n${r.out}`);
    assert.match(r.out, /DEPLOY GUARD/, 'and the author must be told why');
    assert.match(r.out, /@mountainpass\/addressr-deployment/, 'and told the remedy');
  });

  it('ALLOWS the same push once a qualifying changeset is committed', () => {
    const dir = scaffold('allows');
    writeFileSync(path.join(dir, 'apps/addressr-deployment/main.tf'), 'resource "null_resource" "c" {}\n');
    mkdirSync(path.join(dir, '.changeset'), { recursive: true });
    writeFileSync(
      path.join(dir, '.changeset/keen-yaks-run.md'),
      "---\n'@mountainpass/addressr-deployment': patch\n---\n\ninfra\n",
    );
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'terraform + declaration');
    const r = push(dir, 'master');
    assert.equal(r.status, 0, `the declared push must go through\n--- got ---\n${r.out}`);
  });

  it('refuses the push that CREATES master, and that is deliberate', () => {
    // Recorded as its own case because it is the one place an all-zeros parent
    // reaches the guard on master, and because it was found by the scaffold
    // above tripping over it rather than by design.
    //
    // On `addressr` this cannot arise — master exists, so every push carries a
    // real parent. It would arise on a fresh clone-and-recreate, where refusing
    // costs a trailer and buys the property that nothing reaches a virgin master
    // unguarded. The alternative — waving through any push whose parent is
    // unresolvable — is the hole the guard exists to close.
    const remote = path.join(work, 'virgin.git');
    const dir = path.join(work, 'virgin');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'master', remote]);
    execFileSync('git', ['init', '-q', '-b', 'master', dir]);
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 'T');
    git(dir, 'remote', 'add', 'origin', remote);
    const put = (rel, body) => {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), body);
    };
    put('package.json', JSON.stringify({
      name: 'addressr-workspace', private: true, workspaces: ['packages/*', 'apps/*'],
      scripts: { 'check-deps': 'true' },
    }));
    put('packages/addressr/package.json', JSON.stringify({ name: '@mountainpass/addressr', version: '3.3.0' }));
    put('apps/addressr-deployment/package.json', JSON.stringify({
      name: '@mountainpass/addressr-deployment', version: '1.0.0', private: true,
      dependencies: { '@mountainpass/addressr': '3.3.0' },
    }));
    put('apps/addressr-deployment/main.tf', 'resource "null_resource" "z" {}\n');
    put('.changeset/README.md', 'readme\n');
    mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    copyFileSync(path.join(repoRoot, PREDICATE), path.join(dir, PREDICATE));
    chmodSync(path.join(dir, PREDICATE), 0o755);
    const hookPath = path.join(dir, '.git', 'hooks', 'pre-push');
    writeFileSync(hookPath, `#!/usr/bin/env sh\n${hookRaw}`);
    chmodSync(hookPath, 0o755);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'base');

    const r = push(dir, 'master');
    assert.notEqual(r.status, 0, 'creating master with unguarded infra must refuse');
    assert.match(r.out, /Deploy-Guard-Bypass/, 'and must name the route through it');
  });

  it('does NOT refuse a push to a non-master branch', () => {
    // The sanctioned short-lived-branch plan push. This is the case that would
    // fire ADR-045's own "a guard people bypass is worse than none" criterion.
    const dir = scaffold('branch');
    git(dir, 'checkout', '-qb', 'plan-check');
    writeFileSync(path.join(dir, 'apps/addressr-deployment/main.tf'), 'resource "null_resource" "d" {}\n');
    git(dir, 'commit', '-qam', 'infra, planning it');
    const r = push(dir, 'plan-check');
    assert.equal(r.status, 0, `a non-master push must not be guarded\n--- got ---\n${r.out}`);
  });
});

describe('deploy guard — the CI leg', () => {
  it('triggers on push to master ONLY', () => {
    // Exhaustive, so an ADDED trigger fails as loudly as a swapped one. A
    // `pull_request` trigger here would see no `github.event.before`, refuse,
    // and red every PR — which is criterion 5's stated reason for the workflow
    // being separate in the first place.
    assert.deepEqual(Object.keys(workflow.on), ['push']);
    assert.deepEqual(workflow.on.push.branches, ['master']);
    assert.doesNotMatch(workflowExec, /pull_request/);
  });

  it('checks out full history, or it refuses every push', () => {
    const steps = workflow.jobs['changeset-declared'].steps;
    const checkout = steps.find((s) => String(s.uses ?? '').startsWith('actions/checkout'));
    assert.ok(checkout, 'must check out the repo');
    assert.equal(checkout.with?.['fetch-depth'], 0);
  });

  it('does NOT share release.yml’s concurrency group', () => {
    // Same finding as release-pr-plan.yml: GitHub cancels a PENDING run when a
    // newer one enters its group, so a refusal-only job sitting in the release
    // group can displace a queued production apply.
    assert.doesNotMatch(String(workflow.concurrency), /Release-refs/);
    assert.match(String(workflow.concurrency), /deploy-guard/);
  });

  it('takes read-only permissions, because it only refuses', () => {
    assert.deepEqual(workflow.permissions, { contents: 'read' });
  });

  it('passes the push range, not a hardcoded ref', () => {
    const step = workflow.jobs['changeset-declared'].steps.find((s) =>
      String(s.run ?? '').includes('check-deployment-changeset.sh'));
    assert.ok(step, 'the guard step must exist');
    assert.match(String(step.env?.BEFORE), /github\.event\.before/);
    assert.match(String(step.env?.PUSHED), /github\.sha/);
  });
});
