// Every `npm run <script>` in a workflow must resolve to a script declared in
// the scope it actually runs in.
//
// WHY THIS EXISTS, and it is not hypothetical. `.github/workflows/perf-regression.yml`
// — since DELETED, 2026-08-20, see ADR-051 — ran `npm run genversion` for six
// days after that script moved into the `@mountainpass/addressr` workspace with
// the ADR-046 restructure. There is no root `genversion`, so the step failed on
// EVERY scheduled run from 2026-08-12 to 2026-08-17. Nobody noticed, because the
// workflow was `schedule`-triggered: it blocked no push and redded nothing
// anyone waits on.
//
// THE EXEMPLAR IS GONE; THE CLASS IS NOT, and this guard is the highest-value
// survivor of that deletion. Ten scheduled workflows remain, every one of them
// able to rot exactly this way. Do not read a deleted worked example as
// evidence that the guard is vestigial.
//
// The root `pretest:js` WAS repointed to `-w @mountainpass/addressr` when the
// package moved. This workflow was missed. That is the whole failure class —
// a tree move repoints the referrers someone happens to be looking at, and the
// rest rot silently until something reads them.
//
// SO THE GUARD SITS OUTSIDE THE TIER IT PROTECTS. A check living inside the
// workflow it guards would only run when that workflow runs, which is the thing
// that was broken. This runs in the ordinary unit suite on every push, so a
// workflow nobody executes still cannot carry an unresolvable script.
//
// WHAT IT DOES NOT COVER, stated so the green is not read as wider than it is:
// only `npm run <script>` invocations. Bare paths (`scripts/foo.sh`), `npx`,
// and module imports inside `node -e` blocks are out of scope — the same file
// carried a broken `import('./service/address-service.js')` that this would not
// have caught, and it was found by review rather than by test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const workflowDir = path.join(repoRoot, '.github', 'workflows');

const scriptsOf = (manifestPath) => {
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf8')).scripts ?? {};
};

/** Map every workspace package name to its declared scripts. */
const workspaceScripts = () => {
  const root = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const map = new Map();
  for (const glob of root.workspaces ?? []) {
    if (!glob.endsWith('/*')) continue;
    const dir = path.join(repoRoot, glob.slice(0, -2));
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const manifest = path.join(dir, entry, 'package.json');
      const scripts = scriptsOf(manifest);
      if (!scripts) continue;
      const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
      map.set(name, scripts);
    }
  }
  return map;
};

/**
 * Every `npm run <script>` in a workflow file, with the `-w <workspace>` scope
 * if one is present on the same invocation.
 *
 * Deliberately tolerant of the shapes this repo actually uses — `npm run x`,
 * `npm run x -w pkg`, `npm run x --workspace pkg`, and `npx npm@10 run x` — and
 * deliberately NOT a shell parser. A shape it fails to recognise is skipped
 * rather than mis-blamed, which is why the count assertion below exists.
 */
const invocations = (body) => {
  // COMMENT LINES STRIPPED FIRST, and this test caught itself needing it. The
  // repointed `perf-regression.yml` carries a comment explaining the six-day
  // defect, and that prose contains the literal string `npm run genversion` —
  // so the first version of this matcher reported the fix as still broken.
  // Same failure this session's workflow-shape tests hit: an assertion that
  // reads prose ABOUT the code as though it were the code.
  //
  // WHOLE comment lines only, never `s/#.*//`. Blanking from the first `#`
  // would silently eat executable content after a `#` inside a quoted shell
  // string, which for a must-resolve check means an invocation goes UNSEEN —
  // the silent direction. A trailing comment that still gets scanned can only
  // cause a loud false failure, which is the direction to fail in.
  body = body
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

  const out = [];
  const re = /\b(?:npx\s+npm@\d+\s+|npm\s+)run\s+([\w:.-]+)((?:\s+(?:-w|--workspace(?:=|\s+))\s*[@\w/.-]+)?)/g;
  for (const m of body.matchAll(re)) {
    const wsMatch = /(?:-w|--workspace(?:=|\s+))\s*([@\w/.-]+)/.exec(m[2] ?? '');
    out.push({ script: m[1], workspace: wsMatch?.[1] ?? null });
  }
  return out;
};

describe('workflows — `node -e` bodies are JavaScript, not shell', () => {
  // WHY: this exact site broke twice, and the second break was self-inflicted
  // while writing a comment explaining the first.
  //
  // `node --input-type=module -e "…"` embeds a JS body inside a DOUBLE-QUOTED
  // shell string. Two things that look harmless there are not:
  //
  //   - a `#` line is NOT a JavaScript comment. There is no shebang at position
  //     0, so node parses it as ESM and throws SyntaxError on the first `#`.
  //   - BACKTICKS inside double quotes are command substitution. Bash expands
  //     them BEFORE node runs, so a comment mentioning `node -e` makes bash run
  //     `node -e`, and one mentioning `-f` makes it run `-f`.
  //
  // Both fired at once on 2026-08-18 in perf-regression.yml. The step is
  // `schedule`-only and cache-masked, so nothing would have surfaced it —
  // P101 records that this workflow's failures went unread for six nights.
  //
  // Explanations belong ABOVE the `if`, as shell comments, which is what
  // release.yml does.
  //
  // SCANS `node -e` AND `node -p`, and does NOT require `--input-type=module`.
  // The first version required it, which made the matcher blind to
  // `release.yml`'s `node -p \"require('./packages/addressr/package.json')…\"` —
  // inline JavaScript carrying a repo-root-relative referrer, on the
  // release-critical workflow rather than the nightly one, at a site that HAS
  // already broken: the workspace split made `./package.json` the private root
  // with no `version`, so the P044 swallowed-publish assertion took its
  // warn-and-exit-0 branch and failed OPEN on a green run. A corpus assertion
  // that counts only the shapes it can see certifies "the matcher has not
  // rotted" while an entire invocation form goes unscanned — the zero-match
  // failure class with a green check in front of it.
  //
  // HONEST LIMIT: this checks the two shapes that actually broke — a `#` line
  // and a backtick. It does not parse the body as JavaScript, and does not
  // resolve `require()` or `import()` specifiers inside it. That is the wider
  // guard ADR-048 lists as NOT COVERED and P103 tracks.
  const files = readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f));

  const bodies = (body) =>
    [...body.matchAll(/\bnode\b[^\n]*?\s-(?:e|p)\s+"([^"]*)"/g)].map((m) => m[1]);

  it('finds `node -e` bodies to check, so a zero-match pass is impossible', () => {
    const total = files.reduce(
      (n, f) => n + bodies(readFileSync(path.join(workflowDir, f), 'utf8')).length,
      0,
    );
    assert.ok(total > 2, `only ${total} inline-JS bodies found across ${files.length} workflows — the matcher has rotted`);
  });

  it('contains no `#` comment lines and no backticks', () => {
    const problems = [];
    for (const file of files) {
      for (const body of bodies(readFileSync(path.join(workflowDir, file), 'utf8'))) {
        for (const [i, line] of body.split('\n').entries()) {
          if (/^\s*#/.test(line)) {
            problems.push(`${file}: \`node -e\` body line ${i + 1} starts with # — not a JS comment; node throws SyntaxError. Move it above the enclosing shell statement.`);
          }
          if (line.includes('`')) {
            problems.push(`${file}: \`node -e\` body line ${i + 1} contains a backtick — command substitution inside the double-quoted shell string; bash expands it before node runs.`);
          }
        }
      }
    }
    assert.deepStrictEqual(problems, [], `\n${problems.join('\n')}\n`);
  });
});

describe('workflows — every `npm run` resolves to a declared script', () => {
  const files = readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f));
  const rootScripts = scriptsOf(path.join(repoRoot, 'package.json'));
  const byWorkspace = workspaceScripts();

  it('finds workflows and invocations to check, so a zero-match pass is impossible', () => {
    // The failure this repo keeps hitting is a runner that matches nothing and
    // calls it success. Assert the corpus is non-empty before asserting
    // anything about it.
    assert.ok(files.length > 0, 'no workflow files found — the glob has rotted');
    const total = files.reduce(
      (n, f) => n + invocations(readFileSync(path.join(workflowDir, f), 'utf8')).length,
      0,
    );
    assert.ok(total > 5, `only ${total} npm-run invocations found across ${files.length} workflows — the matcher has rotted`);
    assert.ok(byWorkspace.size > 0, 'no workspace packages resolved — the workspaces glob has rotted');
  });

  it('resolves every invocation in the scope it runs in', () => {
    const problems = [];

    for (const file of files) {
      const body = readFileSync(path.join(workflowDir, file), 'utf8');
      for (const { script, workspace } of invocations(body)) {
        if (workspace) {
          const scripts = byWorkspace.get(workspace);
          if (!scripts) {
            problems.push(`${file}: \`npm run ${script} -w ${workspace}\` — no such workspace package`);
          } else if (!(script in scripts)) {
            problems.push(`${file}: \`npm run ${script} -w ${workspace}\` — ${workspace} declares no "${script}" script`);
          }
          continue;
        }
        if (!(script in rootScripts)) {
          // Name where it DOES live, so the fix is obvious from the failure.
          const elsewhere = [...byWorkspace.entries()]
            .filter(([, s]) => script in s)
            .map(([name]) => name);
          const hint = elsewhere.length
            ? ` — it lives in ${elsewhere.join(', ')}; add \`-w ${elsewhere[0]}\``
            : ' — no package in this workspace declares it';
          problems.push(`${file}: \`npm run ${script}\` does not resolve at the repo root${hint}`);
        }
      }
    }

    assert.deepStrictEqual(problems, [], `\n${problems.join('\n')}\n`);
  });
});

describe('workflows — no `job` context inside a step `with:` block', () => {
  // WHY THIS EXISTS. `release-pr-plan.yml` interpolated `${{ toJSON(job.status) }}`
  // into a `github-script` step's `with: script:`. The `job` context is not
  // available there, and GitHub rejects the workflow at PARSE time for it — so
  // the file never ran at all. The failure shape is the problem: the run
  // appears in the Actions list, its single job sits at QUEUED with ZERO steps,
  // and the run concludes `startup_failure` with no annotation and no log.
  // `gh run view --log-failed` returns nothing, because nothing ever executed.
  //
  // It had never run once since being added. That is the same class as the
  // six-day `genversion` outage this file's first guard exists for — a workflow
  // shipped and assumed working — except one level earlier: not a step that
  // fails, a file that never starts.
  //
  // SCOPE: `job` only. `runner`, `steps`, `env`, `secrets`, `github`, `needs`,
  // `matrix` and `inputs` are all legitimately available inside `with:` — the
  // repo uses `runner.temp` there today — so flagging them would be false.
  const files = readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f));

  /** Lines inside a `with:` block, by indentation. Not a YAML parser. */
  const withBlockLines = (body) => {
    const out = [];
    let indent = null;
    for (const [i, line] of body.split('\n').entries()) {
      const opens = /^(\s*)with:\s*$/.exec(line);
      if (opens) {
        indent = opens[1].length;
        continue;
      }
      if (indent === null) continue;
      if (line.trim() && line.search(/\S/) <= indent) {
        indent = null;
        continue;
      }
      out.push({ line, n: i + 1 });
    }
    return out;
  };

  it('finds `with:` blocks to check, so a zero-match pass is impossible', () => {
    const total = files.reduce(
      (n, f) => n + withBlockLines(readFileSync(path.join(workflowDir, f), 'utf8')).length,
      0,
    );
    assert.ok(total > 20, `only ${total} lines found inside \`with:\` blocks — the scanner has rotted`);
  });

  it('never references the `job` context there', () => {
    const problems = [];
    for (const file of files) {
      for (const { line, n } of withBlockLines(readFileSync(path.join(workflowDir, file), 'utf8'))) {
        if (/^\s*#/.test(line)) continue; // prose about the code is not the code
        for (const [, expr] of line.matchAll(/\$\{\{\s*(.*?)\s*\}\}/g)) {
          if (/\bjob\./.test(expr)) {
            problems.push(
              `${file}:${n}: \`${expr}\` uses the \`job\` context inside a \`with:\` block. ` +
                'GitHub rejects the file at parse time, so the workflow never starts — the run ' +
                'concludes `startup_failure` with a QUEUED job and no steps. Use ' +
                '`steps.<id>.outcome` instead.',
            );
          }
        }
      }
    }
    assert.deepStrictEqual(problems, [], `\n${problems.join('\n')}\n`);
  });
});
