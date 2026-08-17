// Drives `scripts/check-deployment-changeset.sh` against real git repositories.
//
// WHAT THE SCRIPT DECIDES. ADR-045 confirmation criterion 5: a change to
// `apps/addressr-deployment` infrastructure that will arm no deployment version
// bump must be caught before it can sit unapplied. The rule, in the ADR's own
// words: "BLOCK when nothing pending will bump `apps/addressr-deployment`; PASS
// when an app changeset will cascade."
//
// WHY THE FAILURE IS WORTH A GUARD AT ALL. A Terraform-only change carries no
// changeset for any published package, so NOTHING releases — no release PR
// opens, nothing publishes, nothing deploys — and the author gets a green push
// with no signal. Then it worsens rather than resolves: weeks later an unrelated
// app changeset cascades a bump and the forgotten Terraform applies as a rider
// on a release nobody connected to it. A late surprise apply is worse than a
// loud refusal at push time.
//
// FAIL-CLOSED POLARITY IS INVERTED FROM THE SIBLING, AND MUST STAY THAT WAY.
// `detect-deployment-bump.sh` fails closed by NOT DEPLOYING — exit 0,
// `changed=false` — because exiting non-zero there would red master on every
// ordinary push. This script fails closed by BLOCKING THE PUSH — non-zero exit.
// Two scripts, adjacent in one directory, with OPPOSITE exit-code contracts.
// That is deliberate and it is not a tidy-up opportunity. The exit-code contract
// is asserted directly below so a harmonising edit reds instead of silently
// inverting a guard into a no-op.
//
// WHY BEHAVIOURAL. ADR-045 records that "the predicate is subtler than the one
// it replaces, and subtle predicates rot… which is why each is pinned in test
// rather than described in a comment." A test that greps the script for a flag
// proves the flag is present, not that the predicate blocks. This builds
// throwaway repositories and executes the script against them.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = path.join(repoRoot, 'scripts', 'check-deployment-changeset.sh');
const DEPLOY_DIR = 'apps/addressr-deployment';
const MANIFEST = `${DEPLOY_DIR}/package.json`;

let work;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * Run the guard in `cwd`; return { out, status }.
 *
 * Invoked DIRECTLY, not via `sh SCRIPT`, so a lost exec bit fails these cases.
 * Both call sites run it as a bare path, which needs mode 100755; going through
 * `sh` would pass regardless and mask the loss. This repo lost a shebang to
 * `eslint --fix` once already.
 */
const check = (cwd, beforeRef, headRef = 'HEAD') => {
  try {
    const out = execFileSync(SCRIPT, [beforeRef ?? '', headRef], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { out, status: 0 };
  } catch (e) {
    return { out: `${e.stdout ?? ''}${e.stderr ?? ''}`, status: e.status };
  }
};

const PASS = (r, why) => assert.equal(r.status, 0, `${why}\n--- guard said ---\n${r.out}`);
const BLOCK = (r, why) =>
  assert.notEqual(r.status, 0, `${why}\n--- guard said ---\n${r.out}`);

const write = (dir, rel, body) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), body);
};

const changeset = (pkgs) =>
  `---\n${pkgs.map((p) => `'${p}': patch`).join('\n')}\n---\n\nsummary\n`;

/**
 * A workspace repo: root manifest with the workspaces glob ADR-046 makes
 * load-bearing, the published app package, and the private deployment package
 * whose dependency pin is what makes an app changeset cascade.
 */
const seed = (name) => {
  const dir = path.join(work, name);
  mkdirSync(dir, { recursive: true });
  git(work, 'init', '-q', dir);
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'T');

  write(dir, 'package.json', JSON.stringify({
    name: 'addressr-workspace',
    private: true,
    workspaces: ['packages/*', 'apps/*'],
  }));
  write(dir, 'packages/addressr/package.json', JSON.stringify({
    name: '@mountainpass/addressr',
    version: '3.3.0',
  }));
  write(dir, MANIFEST, JSON.stringify({
    name: '@mountainpass/addressr-deployment',
    version: '1.0.0',
    private: true,
    dependencies: { '@mountainpass/addressr': '3.3.0' },
  }));
  write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "a" {}\n');
  write(dir, '.changeset/README.md', 'readme\n');
  write(dir, '.changeset/config.json', '{}\n');

  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  return dir;
};

/** Commit everything currently in the tree. Returns the new HEAD sha. */
const commit = (dir, message) => {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', message);
  return git(dir, 'rev-parse', 'HEAD');
};

before(() => {
  work = mkdtempSync(path.join(tmpdir(), 'deploy-guard-'));
});
after(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('check-deployment-changeset — the exit-code contract', () => {
  it('is executable, because both call sites run it as a bare path', () => {
    assert.equal(statSync(SCRIPT).mode & 0o111, 0o111, 'must be mode 100755');
  });

  it('PASSES with exit 0 and BLOCKS with non-zero — inverted from the sibling', () => {
    // Stated as its own case because the inversion is the single most likely
    // thing for a well-meaning tidy-up to "fix". If someone harmonises this
    // script's contract with detect-deployment-bump.sh's, the guard becomes a
    // no-op that prints a refusal and allows the push.
    const dir = seed('contract');
    const base = git(dir, 'rev-parse', 'HEAD');
    PASS(check(dir, base), 'an empty range must not block');

    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "b" {}\n');
    commit(dir, 'infra, no changeset');
    BLOCK(check(dir, base), 'infra with nothing pending must exit non-zero');
  });
});

describe('check-deployment-changeset — the trigger set', () => {
  it('PASSES when no infrastructure file changed at all', () => {
    const dir = seed('no-infra');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, 'packages/addressr/index.js', 'export const a = 1;\n');
    commit(dir, 'app only');
    PASS(check(dir, base), 'an app-only change is not this guard’s business');
  });

  it('BLOCKS an infrastructure change with nothing pending to bump the package', () => {
    const dir = seed('infra-bare');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "changed" {}\n');
    commit(dir, 'terraform only');
    BLOCK(check(dir, base), 'this is the whole reason the guard exists');
  });

  it('PASSES on a package.json-only change — the cascade rewrites it', () => {
    // Criterion 5 excludes it by name: it is "the file the cascade rewrites and
    // a human edits to move the pin, covered by criterion 4 instead". Including
    // it would red the release PR's own version commit.
    const dir = seed('manifest-only');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, MANIFEST, JSON.stringify({
      name: '@mountainpass/addressr-deployment',
      version: '1.0.1',
      private: true,
      dependencies: { '@mountainpass/addressr': '3.3.1' },
    }));
    commit(dir, 'cascade bump');
    PASS(check(dir, base), 'the manifest is criterion 4’s business, not this guard’s');
  });

  it('PASSES on a documentation-only change under the tree', () => {
    const dir = seed('docs-only');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/modules/opensearch/README.md`, '# notes\n');
    commit(dir, 'docs');
    PASS(check(dir, base), 'criterion 5 excludes documentation by name');
  });

  it('PASSES on a test-only change, which cannot reach production', () => {
    // A THIRD exclusion, beyond the two criterion 5 names, and recorded as a
    // decision rather than smuggled in. `worker.test.js` sits under the tree but
    // is not bundled by the worker module, so demanding a deployment changeset
    // for it would require a declaration for a change that arms nothing —
    // over-firing, which is why criterion 5 rejected all three of its
    // alternative shapes.
    // TWO fixtures, not one, and the second is the point. The filter is
    // `grep -vE '\.test\.(js|mjs|cjs)$'` — UNANCHORED, so it drops any test file
    // anywhere under the tree. Exercising only `cloudflare-worker/worker.test.js`
    // would pin today's single instance of a pattern-defined set: a later
    // narrowing of the exclusion to `cloudflare-worker/**` would stay green here
    // while over-firing on the first test file added anywhere else under the
    // tree. Same defect the job story had to be amended twice to remove, showing
    // up on the test side rather than the prose side.
    const dir = seed('test-only');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/cloudflare-worker/worker.test.js`, '// nothing\n');
    commit(dir, 'worker test');
    PASS(check(dir, base), 'a test file arms no apply');

    const root = seed('test-only-root');
    const rootBase = git(root, 'rev-parse', 'HEAD');
    write(root, `${DEPLOY_DIR}/resolve-version.test.mjs`, '// nothing\n');
    commit(root, 'a test file directly under the tree root');
    PASS(check(root, rootBase), 'the exclusion is by pattern, not by directory');
  });

  it('BLOCKS a .terraform.lock.hcl change — the deliberate ADR-040 inversion', () => {
    // ADR-040 amendment point 6 excluded this path from the RETIRED push axis,
    // where a provider bump firing an apply was an accident. Under a
    // changeset-armed gate a provider version change is a real apply that should
    // carry a declaration. Criterion 5 records the inversion as intended, so
    // this case is pinned to keep the two records from drifting apart.
    const dir = seed('lockfile');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/.terraform.lock.hcl`, 'provider "aws" { version = "5.1.0" }\n');
    commit(dir, 'provider bump');
    BLOCK(check(dir, base), 'a provider bump is a real apply and needs a declaration');
  });
});

describe('check-deployment-changeset — what counts as pending', () => {
  it('PASSES when a deployment changeset is pending', () => {
    const dir = seed('deploy-cs');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "c" {}\n');
    write(dir, '.changeset/brave-pandas-sing.md', changeset(['@mountainpass/addressr-deployment']));
    commit(dir, 'infra + declaration');
    PASS(check(dir, base), 'the declared case must pass');
  });

  it('PASSES when an APP changeset is pending, because it cascades', () => {
    // The anti-over-fire arm, and the one ADR-045's reassessment criteria watch
    // most closely: "an ordinary MIXED push reds — the cascade-PASS arm is the
    // anti-over-fire concession and a red there means it is not working."
    const dir = seed('app-cs');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "d" {}\n');
    write(dir, 'packages/addressr/index.js', 'export const a = 2;\n');
    write(dir, '.changeset/tidy-otters-wave.md', changeset(['@mountainpass/addressr']));
    commit(dir, 'mixed push');
    PASS(check(dir, base), 'the ordinary mixed push must not red');
  });

  it('BLOCKS when the only pending changeset names an unrelated package', () => {
    // Guards the derivation: the cascade set is the deployment package's own
    // internal dependencies, not "any changeset at all".
    const dir = seed('unrelated-cs');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "e" {}\n');
    write(dir, '.changeset/lazy-mice-run.md', changeset(['@mountainpass/something-else']));
    commit(dir, 'infra + irrelevant changeset');
    BLOCK(check(dir, base), 'a changeset for a package that cascades nothing must not satisfy the guard');
  });

  it('PASSES on a changeset that landed in an EARLIER push and is still pending', () => {
    // Issue 2, and the specific over-fire that would falsify the rule. Reading
    // only changesets ADDED IN THE RANGE would miss this one and red a
    // follow-up infra push that is perfectly well declared.
    const dir = seed('earlier-cs');
    write(dir, '.changeset/quiet-fish-jump.md', changeset(['@mountainpass/addressr-deployment']));
    commit(dir, 'declaration lands first');
    const base = git(dir, 'rev-parse', 'HEAD');

    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "f" {}\n');
    commit(dir, 'infra follows in a later push');
    PASS(check(dir, base), 'a still-pending declaration from an earlier push must satisfy the guard');
  });

  it('BLOCKS when the changeset exists only in the working tree, uncommitted', () => {
    // Issue 2's other half, and it is P011 (`ef66d39`) reappearing INSIDE the
    // guard built to catch it. Reading the filesystem would let the hook pass
    // while the pushed commits carry nothing — and would make the two surfaces
    // disagree, hook green and CI red, which is the worst of both.
    const dir = seed('worktree-cs');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "g" {}\n');
    commit(dir, 'infra only');
    // Written but never committed.
    write(dir, '.changeset/sneaky-cats-hide.md', changeset(['@mountainpass/addressr-deployment']));
    BLOCK(check(dir, base), 'an uncommitted changeset is not pending — it is not pushed');
  });

  it('does not count .changeset/README.md as a declaration', () => {
    const dir = seed('readme-only');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "h" {}\n');
    write(dir, '.changeset/README.md', 'readme, edited\n');
    commit(dir, 'infra + readme touch');
    BLOCK(check(dir, base), 'README.md is not a changeset');
  });
});

describe('check-deployment-changeset — the rename case, replayed against a real git mv', () => {
  it('BLOCKS a move out of the watched tree rather than passing it silently', () => {
    // Replayed against a REAL `git mv`, which is the evidence standard the
    // 2026-08-10 axis retirement used, and which is the reason this comment
    // says something different from what the design review claimed.
    //
    // The review asserted that rename detection (on by default) would leave the
    // trigger set EMPTY on a move out, so a pure refactor passed silently, and
    // that `--no-renames` was the fix. Measured, that is false for this
    // invocation: with a pathspec limiting the diff to the watched directory,
    // `git diff --name-only` prints the SOURCE path with or without the flag.
    // The PATHSPEC does the work. The flag is kept as explicit intent and as
    // cover for a future edit that drops or widens the pathspec.
    //
    // So this case pins the OBSERVABLE behaviour — a move out blocks — rather
    // than a flag whose contribution here is zero. Asserting the flag would have
    // been a test that passes for a reason its own comment gets wrong.
    const dir = seed('rename');
    const base = git(dir, 'rev-parse', 'HEAD');
    mkdirSync(path.join(dir, 'apps/addressr-infra'), { recursive: true });
    git(dir, 'mv', `${DEPLOY_DIR}/main.tf`, 'apps/addressr-infra/main.tf');
    commit(dir, 'move the tree');
    BLOCK(check(dir, base), 'a tree move must be loud, not silently empty');
  });
});

describe('check-deployment-changeset — fail closed means BLOCK here', () => {
  it('BLOCKS on an empty before-ref', () => {
    const dir = seed('empty-ref');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "i" {}\n');
    commit(dir, 'infra');
    BLOCK(check(dir, ''), 'an indeterminable range must not be waved through');
  });

  it('BLOCKS on an all-zeros before-ref — deliberate, not merely fail-closed', () => {
    // Framed as a DECISION rather than as generic fail-closed, because on master
    // an all-zeros parent means one specific thing: this push CREATES the branch.
    // Keeping the refusal there is a choice with a recorded reason (P039
    // implementation note 3a) — the exemption would have to key on a signal that
    // cannot distinguish a benign fresh clone from a recreation after a history
    // rewrite, and the second is a case where infrastructure genuinely arrives on
    // master unarmed. Without that framing the next reader takes this for a rough
    // edge in the fail-closed branch and files it as a bug.
    const dir = seed('zeros-ref');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "j" {}\n');
    commit(dir, 'infra');
    BLOCK(check(dir, '0000000000000000000000000000000000000000'), 'all-zeros is not a range');
  });

  it('BLOCKS an indeterminable range even when the push touches NO infrastructure', () => {
    // ISOLATES the variant the other fail-closed cases do not: each of those
    // writes an infra file into the fixture first, so they pin that the block
    // happens without showing that it happens INDEPENDENTLY of the trigger set.
    // Nothing therefore contradicted a reading in which these refusals only
    // apply to infra-bearing pushes — and that reading leads somewhere bad.
    //
    // The order in the script is the point: the indeterminable-range block fires
    // BEFORE `CHANGED` is ever computed, because an indeterminable range is not
    // evidence of safety. It is the absence of evidence either way.
    //
    // This is the FAIL-OPEN direction, which is why it is pinned separately from
    // the over-fire cases. "Tightening" these branches to exit 0 when no infra
    // change is detected is exactly the harmonisation with
    // detect-deployment-bump.sh's polarity that the script header forbids — and
    // unlike an over-fire, it would be silent.
    const dir = seed('indeterminable-no-infra');
    write(dir, 'packages/addressr/index.js', 'export const a = 4;\n');
    commit(dir, 'app-only change, nothing under the deployment tree');
    BLOCK(
      check(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
      'an unresolvable range must refuse regardless of what this push appears to touch',
    );
  });

  it('BLOCKS on an unreachable before-ref', () => {
    const dir = seed('unreachable-ref');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "k" {}\n');
    commit(dir, 'infra');
    BLOCK(check(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), 'an unreachable parent is not a range');
  });

  it('PASSES an unresolvable range when a qualifying changeset is pending anyway', () => {
    // The refinement that keeps fail-closed from over-firing, and it is a strict
    // SUBSET of the blocks above rather than a relaxation of them.
    //
    // An unresolvable parent means you cannot determine WHAT CHANGED. It does
    // not mean you cannot determine WHAT IS PENDING. The rule is "BLOCK when
    // nothing pending will bump the deployment package" — so if a qualifying
    // changeset is sitting at HEAD, something pending WILL bump it and the
    // rule's own answer is PASS, parent or no parent.
    //
    // Blocking here would red an author who did everything right: valid local
    // range, hook passed, correct changeset committed, and CI refusing on a ref
    // condition they did not cause. That is over-firing, which ADR-045's
    // reassessment criteria nominate as falsifying the rule.
    //
    // Nothing the guard exists to catch escapes through this: in the
    // Terraform-change-with-no-changeset case the positive evidence is absent by
    // construction, so that push still blocks.
    const dir = seed('unresolvable-but-declared');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "p" {}\n');
    write(dir, '.changeset/eager-swans-glide.md', changeset(['@mountainpass/addressr-deployment']));
    commit(dir, 'infra + declaration');
    PASS(
      check(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
      'positive evidence of a pending bump outranks an unreadable parent',
    );
  });

  it('still BLOCKS an unresolvable range when the pending changeset cascades nothing', () => {
    const dir = seed('unresolvable-unrelated');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "q" {}\n');
    write(dir, '.changeset/odd-frogs-leap.md', changeset(['@mountainpass/something-else']));
    commit(dir, 'infra + irrelevant changeset');
    BLOCK(
      check(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
      'the exemption is positive evidence of a BUMP, not the mere presence of a changeset',
    );
  });

  it('BLOCKS LOUDLY when the cascade set resolves to nothing in the workspace', () => {
    // A SEPARATE case from the unreadable-manifest one below, and it exists
    // because mutation testing found its branch unreachable from every other
    // test: the manifest read fails first, so the cascade-resolution guard was
    // never exercised and would have shipped as protection that had never run.
    //
    // Reached here by a readable manifest whose packages resolve to nothing
    // internal — the shape a tree move produces when it leaves the manifest
    // behind but moves the package out from under the workspaces glob.
    const dir = seed('unresolvable-cascade');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, 'package.json', JSON.stringify({
      name: 'addressr-workspace',
      private: true,
      // Covers neither package. `packages/*` alone is NOT enough to reach this
      // branch — the app package still resolves through it and leaves the
      // cascade set non-empty. Verified by mutation: with `packages/*` here,
      // deleting the fail-loud below changes nothing.
      workspaces: ['third-party/*'],
    }));
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "r" {}\n');
    write(dir, '.changeset/warm-bees-hum.md', changeset(['@mountainpass/addressr-deployment']));
    commit(dir, 'workspace glob no longer covers the deployment package');
    const r = check(dir, base);
    BLOCK(r, 'an unresolvable cascade set must refuse, not silently allow');
    assert.match(r.out, /cascade/i, 'the refusal must say WHY it could not decide');
  });

  it('BLOCKS LOUDLY when the deployment manifest cannot be read at HEAD', () => {
    // Fail loud, not empty. A silently empty cascade set would degrade the guard
    // into always-require-a-deployment-changeset — one of the three shapes
    // criterion 5 explicitly REJECTED, for over-firing on every mixed push.
    const dir = seed('no-manifest');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "l" {}\n');
    git(dir, 'rm', '-q', MANIFEST);
    write(dir, '.changeset/bold-lions-roar.md', changeset(['@mountainpass/addressr']));
    commit(dir, 'infra with the manifest gone');
    const r = check(dir, base);
    BLOCK(r, 'an unreadable manifest must not silently empty the cascade set');
    assert.match(r.out, /manifest|cascade/i, 'the refusal must say WHY it could not decide');
  });
});

describe('check-deployment-changeset — the bypass trailer', () => {
  it('PASSES on a Deploy-Guard-Bypass trailer', () => {
    const dir = seed('bypass');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "m" {}\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'infra\n\nDeploy-Guard-Bypass: recovering a force-pushed parent');
    PASS(check(dir, base), 'the sanctioned route must work');
  });

  it('finds the trailer on ANY commit in the range, not only the tip', () => {
    // Criterion 5 supplies the trailer for the force-pushed-away-parent case.
    // If only the tip were scanned, a recovery push of several commits would
    // need the trailer duplicated onto the last one — friction that would push
    // people to `--no-verify` instead, which also drops the risk-score and
    // external-comms gates.
    const dir = seed('bypass-mid');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "n" {}\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'infra\n\nDeploy-Guard-Bypass: parent was force-pushed away');
    write(dir, 'packages/addressr/index.js', 'export const a = 3;\n');
    commit(dir, 'unrelated follow-up with no trailer');
    PASS(check(dir, base), 'the trailer must be found anywhere in the range');
  });
});

describe('check-deployment-changeset — what the refusal says', () => {
  const refusal = () => {
    const dir = seed('message');
    const base = git(dir, 'rev-parse', 'HEAD');
    write(dir, `${DEPLOY_DIR}/main.tf`, 'resource "null_resource" "o" {}\n');
    commit(dir, 'terraform only');
    const r = check(dir, base);
    BLOCK(r, 'setup: this must block for the message to be worth asserting');
    return r.out;
  };

  it('names the remedy literally — the package, not just "add a changeset"', () => {
    // The refusal message IS the artefact that replaces memory, per JTBD-400's
    // "checkable artefacts, not memory" outcome. The test is whether an author
    // who has never read ADR-045 can act correctly from the message alone. A
    // remedy that sends them to open a manifest or an ADR to find the package
    // name fails the job even when the rule fires correctly.
    const out = refusal();
    assert.match(out, /changeset/i, 'must tell the author what to do');
    assert.match(out, /@mountainpass\/addressr-deployment/, 'must name the package literally');
  });

  it('says what happens if it is ignored, which is what makes bypass a judgement', () => {
    // An anti-bypass control, not padding. A rule with no stated reason gets
    // bypassed reflexively — the failure ADR-045's reassessment criteria
    // nominate. It is also what lets an author judge whether their own bypass is
    // legitimate: you cannot ask someone to use an escape hatch responsibly
    // while withholding why the door exists.
    assert.match(
      refusal(),
      /unapplied|rider|sit(s)? (there|on|unapplied)|nothing (will )?releases?/i,
      'must state the consequence, not just the rule',
    );
  });

  it('names BOTH recovery routes, because a red CI leg can block the fix (P052)', () => {
    // `@windyroad/risk-scorer`'s check_ci_status denies a push whenever master's
    // latest run concluded failure, with no ancestor carve-out. So a red
    // deploy-guard can block the very follow-up push that adds the missing
    // changeset, forcing `--no-verify` — which also drops the risk-score and
    // external-comms gates. The message has to name the way out of that.
    const out = refusal();
    assert.match(out, /changeset/i, 'route 1: add the declaration');
    assert.match(out, /Deploy-Guard-Bypass/, 'route 2: the sanctioned trailer');
  });

  it('does NOT name deploy_only, which no longer exists', () => {
    // Criterion 5's sequencing paragraph requires naming `deploy_only` ONLY IF
    // the guard shipped ahead of the gate repoint. It shipped behind, and
    // `deploy_only` was deleted at 8199e5b9 — but that sentence is still in the
    // ADR, so a future reader implementing from the text alone would put it
    // back, and the message would name a dispatch that no longer exists.
    assert.doesNotMatch(refusal(), /deploy_only/, 'that dispatch input is deleted');
  });

  it('names the tree move explicitly when the trigger set is deletions', () => {
    // So the operator reads "this is a tree move, use the trailer" rather than
    // "the guard is broken".
    const dir = seed('move-message');
    const base = git(dir, 'rev-parse', 'HEAD');
    mkdirSync(path.join(dir, 'apps/addressr-infra'), { recursive: true });
    git(dir, 'mv', `${DEPLOY_DIR}/main.tf`, 'apps/addressr-infra/main.tf');
    commit(dir, 'move');
    const r = check(dir, base);
    BLOCK(r, 'setup');
    assert.match(r.out, /mov(e|ed)|renam/i, 'a move must be named as a move');

    // THE NEGATIVE HALF, and it is here because its absence let a falsified
    // claim survive in this exact message. The rationale that `--no-renames` is
    // what stops a move passing silently was measured FALSE for this invocation
    // — the pathspec preserves the source path either way. It was corrected in
    // the script header and in this file's rename case, but NOT in the
    // operator's refusal, which is the one site read under pressure and the only
    // branch that fires against real repository history. The positive assertion
    // above was satisfied by the stale sentence, so this test PINNED the error
    // rather than catching it.
    //
    // That is R015's and R020's own recorded failure shape — one fact restated
    // across three sites and corrected at two. Asserting the absence closes the
    // third, so a reintroduction reds instead of being held in place.
    assert.doesNotMatch(
      r.out,
      /rename detection is off|pass(es)? silently|empty change set/i,
      'the refusal must not re-assert the measured-false rename rationale',
    );
  });
});
