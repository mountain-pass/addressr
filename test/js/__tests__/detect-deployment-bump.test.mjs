// Drives `scripts/detect-deployment-bump.sh` against real git repositories.
//
// WHY BEHAVIOURAL RATHER THAN A YAML-SHAPE ASSERTION. ADR-045 confirmation
// criterion 3 requires the detection be DRIVEN through a rename, an all-zeros
// `before`, an unreachable parent, and a non-push event. A test that reads
// `release.yml` and asserts the shape of a `run:` block proves the string is
// present, not that the logic denies. This builds throwaway repositories and
// executes the script against them.
//
// WHAT THE SCRIPT DECIDES. Whether a push arms a production Terraform apply,
// per ADR-045: the deployment package's version VALUE must differ between
// `github.event.before` and HEAD, AND the push must have consumed changesets.
// Everything else denies.
//
// THE VALUE-NOT-PATH DISTINCTION IS THE WHOLE POINT. The predecessor axis
// diffed a PATH, so a rename OUT of the watched directory presented as
// deletions UNDER it and would have armed a production apply on a pure
// refactor. That is why this repo retired it (dd9c950b) — and why the rename
// case below is not a curiosity but the defect the design exists to avoid. On a
// rename the HEAD-side read FAILS rather than DIFFERS, which is the structural
// immunity a value comparison buys.
//
// FAIL-CLOSED POLARITY, and it differs from the pre-push guard on purpose.
// Here "fail closed" means DO NOT DEPLOY — the script exits 0 and prints
// `changed=false`. It must not exit non-zero: that would fail the step, fail
// the job, and red master on every ordinary push that does not bump the
// deployment version, which is nearly all of them. The changeset guard's
// fail-closed means BLOCK THE PUSH. Two surfaces, two polarities, both correct.
// Do not harmonise them.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = path.join(repoRoot, 'scripts', 'detect-deployment-bump.sh');
const MANIFEST = 'apps/addressr-deployment/package.json';

let work;

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Run the detector in `cwd`; return { stdout, status }. */
const detect = (cwd, before_) => {
  try {
    const stdout = execFileSync('sh', [SCRIPT, before_ ?? ''], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, status: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? '', status: e.status };
  }
};

const verdict = (r) => r.stdout.trim();

/** A repo with the manifest at `version`, plus optional changeset files. */
const seed = (name, version, changesets = []) => {
  const dir = path.join(work, name);
  mkdirSync(path.join(dir, 'apps', 'addressr-deployment'), { recursive: true });
  mkdirSync(path.join(dir, '.changeset'), { recursive: true });
  git(dir === work ? work : path.dirname(dir), 'init', '-q', dir);
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'T');
  writeFileSync(
    path.join(dir, MANIFEST),
    JSON.stringify({ name: '@mountainpass/addressr-deployment', version }),
  );
  writeFileSync(path.join(dir, '.changeset', 'README.md'), 'readme\n');
  for (const c of changesets) {
    writeFileSync(path.join(dir, '.changeset', c), '---\n---\nsummary\n');
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  return dir;
};

/** Bump the manifest version, optionally consuming the named changesets. */
const bump = (dir, version, consume = []) => {
  writeFileSync(
    path.join(dir, MANIFEST),
    JSON.stringify({ name: '@mountainpass/addressr-deployment', version }),
  );
  for (const c of consume) {
    rmSync(path.join(dir, '.changeset', c));
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'chore: release');
};

before(() => {
  work = mkdtempSync(path.join(tmpdir(), 'detect-bump-'));
});
after(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('detect-deployment-bump — the positive case', () => {
  it('ARMS when the version changed AND a changeset was consumed', () => {
    const dir = seed('arm', '1.0.0', ['fuzzy-pandas.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    bump(dir, '1.0.1', ['fuzzy-pandas.md']);
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=true');
  });

  it('arms on a locally-run `changeset version` pushed direct to master', () => {
    // Recorded rather than treated as a hole. This deletes changesets and bumps
    // the version, so it arms — and it should: a changeset was genuinely
    // consumed. It is NOT the hand edit the second conjunct exists to reject.
    // Do not "fix" this case.
    const dir = seed('local-version', '2.0.0', ['a.md', 'b.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    bump(dir, '2.1.0', ['a.md', 'b.md']);
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=true');
  });
});

describe('detect-deployment-bump — the explicit head ref', () => {
  it('compares against an explicit head ref when given one', () => {
    // release-watch.sh passes `origin/master` because at the point it checks,
    // the LOCAL HEAD is still behind the merge it just made. Defaulting to HEAD
    // there would answer about the wrong commit — silently, and in the
    // direction of not warning. This is the second argument's whole reason.
    const dir = seed('head-ref', '1.0.0', ['x.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    bump(dir, '1.0.1', ['x.md']);
    const armedSha = git(dir, 'rev-parse', 'HEAD');
    // Move HEAD backwards, as a not-yet-pulled local checkout would be.
    git(dir, 'checkout', '-q', beforeSha);
    // Default (HEAD) now sees no bump...
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=false');
    // ...but the explicit ref still does.
    assert.equal(
      verdict(
        (() => {
          try {
            return {
              stdout: execFileSync('sh', [SCRIPT, beforeSha, armedSha], {
                cwd: dir,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
              }),
            };
          } catch (e) {
            return { stdout: e.stdout ?? '' };
          }
        })(),
      ),
      'changed=true',
    );
  });
});

describe('detect-deployment-bump — the changeset-release branch shape', () => {
  // THE DEFECT THIS CASE EXISTS FOR, in its real geometry.
  //
  // `changesets/action` checks out `changeset-release/master` FROM the pushed
  // commit, runs `changeset version` (bumping the deployment package and
  // DELETING the consumed changesets), commits, and does not switch back. A
  // detector that lets its head ref DEFAULT to HEAD then reads that commit —
  // sees a bumped version and deleted changesets — and ARMS a production apply
  // for a push that merely ADDED a changeset to the queue.
  //
  // Concretely: the queue already holds one changeset, you push a second.
  // Nothing about that push should deploy. This shipped green because nothing
  // pinned the head ref.
  //
  // WHAT THIS PAIR CANNOT PROVE. This file proves the SCRIPT denies given the
  // right ref; release-workflow-deploy-only.test.mjs proves the WORKFLOW
  // supplies it. Neither can prove that `github.sha` is the pushed commit
  // rather than the version-bump commit — that is a GitHub semantics fact, not
  // a testable one here. Do not read the pair as closing the question.
  it('the trap is real: the DEFAULT head ref reads the version branch and arms', () => {
    // The sanity leg. It calls the detector with ONE argument, letting HEAD_REF
    // default, with the repo checked out on the version branch — which is the
    // literal defect. Passing a wrong ref explicitly would prove only that a
    // wrong explicit ref arms, which nobody was going to do.
    //
    // IF THIS EVER FLIPS TO changed=false the denial leg below is proving
    // nothing and must be re-derived, not deleted.
    const dir = seed('trap-leg', '1.0.0', ['already-queued.md']);
    const pushedBase = git(dir, 'rev-parse', 'HEAD');
    writeFileSync(path.join(dir, '.changeset', 'newly-pushed.md'), '---\n---\nnew\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'feat: something, with a changeset');
    const pushedSha = git(dir, 'rev-parse', 'HEAD');
    // Branch FROM the pushed sha, as changesets/action does — so the branch tip
    // is a descendant and `git diff BEFORE HEAD` sees BOTH deletions.
    git(dir, 'checkout', '-q', '-b', 'changeset-release/master', pushedSha);
    bump(dir, '1.1.0', ['already-queued.md', 'newly-pushed.md']);

    assert.equal(
      verdict(detect(dir, pushedBase)),
      'changed=true',
      'the default head ref must still read the branch tip — otherwise the ' +
        'denial leg below passes for the wrong reason',
    );
  });

  it('answers about the PUSHED sha when given it, and DENIES', () => {
    const dir = seed('pushed-sha', '1.0.0', ['already-queued.md']);
    const pushedBase = git(dir, 'rev-parse', 'HEAD');
    writeFileSync(path.join(dir, '.changeset', 'newly-pushed.md'), '---\n---\nnew\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'feat: something, with a changeset');
    const pushedSha = git(dir, 'rev-parse', 'HEAD');
    git(dir, 'checkout', '-q', '-b', 'changeset-release/master', pushedSha);
    bump(dir, '1.1.0', ['already-queued.md', 'newly-pushed.md']);

    const explicit = (() => {
      try {
        return execFileSync('sh', [SCRIPT, pushedBase, pushedSha], {
          cwd: dir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        return e.stdout ?? '';
      }
    })();
    assert.equal(
      explicit.trim(),
      'changed=false',
      'a push that only ADDS a changeset must never arm a production apply',
    );
  });
});

describe('detect-deployment-bump — the changesets-consumed conjunct', () => {
  it('DENIES a hand-edited version bump that consumed no changeset', () => {
    // The case the user chose this conjunct for: a hand edit pushed straight to
    // master must arm nothing.
    const dir = seed('hand-edit', '1.0.0', ['pending.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    bump(dir, '9.9.9');
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=false');
  });

  it('does not count .changeset/README.md as a consumed changeset', () => {
    // Anti-vacuity on the exclusion: deleting only the README must not arm.
    const dir = seed('readme-only', '1.0.0');
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    rmSync(path.join(dir, '.changeset', 'README.md'));
    bump(dir, '1.0.1');
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=false');
  });

  it('counts a consumed changeset even when another is added in the same push', () => {
    // Guards the unquoted-pathspec trap: an unquoted `.changeset/*.md` is
    // expanded by the SHELL against the working tree before git sees it, so a
    // pending changeset present at HEAD would restrict the diff to files that
    // were ADDED and the deletions would vanish — denying silently.
    const dir = seed('mixed', '1.0.0', ['consumed.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    writeFileSync(path.join(dir, '.changeset', 'new-one.md'), '---\n---\nnext\n');
    bump(dir, '1.0.1', ['consumed.md']);
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=true');
  });
});

describe('detect-deployment-bump — fail closed (ADR-045 criterion 3)', () => {
  it('DENIES when the version did not change', () => {
    const dir = seed('unchanged', '1.0.0', ['x.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    bump(dir, '1.0.0', ['x.md']);
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=false');
  });

  it('DENIES on an all-zeros before (branch creation)', () => {
    const dir = seed('zeros', '1.0.0', ['x.md']);
    bump(dir, '1.0.1', ['x.md']);
    assert.equal(
      verdict(detect(dir, '0000000000000000000000000000000000000000')),
      'changed=false',
    );
  });

  it('DENIES on an unreachable parent (force-pushed away)', () => {
    const dir = seed('unreachable', '1.0.0', ['x.md']);
    bump(dir, '1.0.1', ['x.md']);
    // A well-formed SHA that is not an object in this repo.
    assert.equal(
      verdict(detect(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')),
      'changed=false',
    );
  });

  it('DENIES on a RENAME — the defect that retired the predecessor axis', () => {
    // The manifest moves out from under the watched path. A PATH diff would
    // report this as a change and ARM a production apply on a pure refactor. A
    // VALUE comparison cannot: the HEAD-side read fails, so the script denies.
    const dir = seed('rename', '1.0.0', ['x.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    mkdirSync(path.join(dir, 'apps', 'renamed-deployment'), { recursive: true });
    git(dir, 'mv', MANIFEST, 'apps/renamed-deployment/package.json');
    rmSync(path.join(dir, '.changeset', 'x.md'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'refactor: move the deployment package');
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=false');
  });

  it('DENIES when the manifest did not exist at the before ref', () => {
    const dir = seed('absent-before', '1.0.0', ['x.md']);
    git(dir, 'rm', '-q', MANIFEST);
    git(dir, 'commit', '-qm', 'remove');
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    mkdirSync(path.join(dir, 'apps', 'addressr-deployment'), { recursive: true });
    bump(dir, '1.0.1', ['x.md']);
    assert.equal(verdict(detect(dir, beforeSha)), 'changed=false');
  });

  it('DENIES on an empty before argument', () => {
    // The non-push case has a BEHAVIOURAL leg as well as the workflow-level
    // `if: github.event_name == 'push'`. Without this the fail-closed property
    // would rest entirely on a YAML guard a future edit could drop.
    const dir = seed('empty-arg', '1.0.0', ['x.md']);
    bump(dir, '1.0.1', ['x.md']);
    assert.equal(verdict(detect(dir, '')), 'changed=false');
  });

  it('DENIES on a malformed before argument', () => {
    const dir = seed('malformed', '1.0.0', ['x.md']);
    bump(dir, '1.0.1', ['x.md']);
    assert.equal(verdict(detect(dir, 'not-a-sha')), 'changed=false');
  });
});

describe('detect-deployment-bump — the stdout contract', () => {
  it('never exits non-zero, on any path', () => {
    // Load-bearing. A non-zero exit fails the step, fails the job, and reds
    // master on every ordinary push. Fail-closed here means DO NOT DEPLOY.
    const dir = seed('exit-code', '1.0.0', ['x.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    bump(dir, '1.0.0', ['x.md']);
    assert.equal(detect(dir, beforeSha).status, 0);
    assert.equal(detect(dir, '').status, 0);
    assert.equal(detect(dir, 'not-a-sha').status, 0);
  });

  it('emits exactly one line, matching the output contract', () => {
    // The workflow appends stdout to $GITHUB_OUTPUT, so a stray line would
    // inject an arbitrary step output. Reasons go to stderr.
    const dir = seed('stdout', '1.0.0', ['x.md']);
    const beforeSha = git(dir, 'rev-parse', 'HEAD');
    bump(dir, '1.0.1', ['x.md']);
    for (const arg of [beforeSha, '', 'not-a-sha']) {
      const lines = detect(dir, arg).stdout.split('\n').filter(Boolean);
      assert.equal(lines.length, 1, `expected one line, got ${JSON.stringify(lines)}`);
      assert.match(lines[0], /^changed=(true|false)$/);
    }
  });
});
