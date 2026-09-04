// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// Two properties of the deployment module that nothing asserted, both named as
// owed in ADR-089's own confirmation criteria rather than claimed as met.
//
// 1. THE NOTIFICATION EGRESS SET. ADR-089 withdrew the SMS subscription, its
//    endpoint variable and the publish role, unapplied. What survived is an
//    email subscription on a topic that is ALSO the action target for the
//    searchable-documents floor alarms. The regression this guards is not
//    someone re-adding SMS on purpose — that would be a decision — but a
//    subscription arriving on that topic without one, which is how the topic
//    acquired a second purpose the first time. The set is enumerated, so
//    adding to it is a deliberate edit here and not a silent one.
//
// 2. THE FILES PARSE AT ALL. On 2026-09-04 a deletion in `main.tf` left an
//    orphaned `)` and `}` behind, and the file was unparseable. Nothing in the
//    suite noticed, because nothing in the suite reads the Terraform as
//    anything but text. It was caught by a risk reviewer, by hand. `terraform`
//    is not on the test path and shelling to it would make this skip wherever
//    the binary is absent — a check that skips is the failure class this
//    project keeps finding — so the balance is counted in process. That is
//    weaker than a parse and it is the specific defect that occurred.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'apps/addressr-deployment';

/**
 * Every `.tf` under the module, submodules INCLUDED. A root-only read misses
 * `modules/cloudflare-worker` and `modules/opensearch` — and the Worker
 * submodule is where a replacement would add code if one is built. The reason
 * to widen is the balance check, not the publish fence: those eight files were
 * getting no syntax check at all, and an orphaned delimiter there breaks a plan
 * exactly as it does at the root. The publish and subscription assertions are
 * AWS-side and the Worker submodule declares no AWS resource, so widening buys
 * little there — stated because the weaker reason is the tempting one and it
 * would not survive a reader who opened the file.
 */
function terraformFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return terraformFiles(`${dir}/${e.name}`, `${prefix}${e.name}/`);
    if (!e.name.endsWith('.tf')) return [];
    return [{ name: `${prefix}${e.name}`, body: readFileSync(`${dir}/${e.name}`, 'utf8') }];
  });
}

const files = terraformFiles(DIR);

/** Every `resource "TYPE" "NAME"` header across the module. */
function resourcesOfType(type) {
  const found = [];
  for (const { name, body } of files) {
    for (const m of body.matchAll(/^resource\s+"([a-z0-9_]+)"\s+"([a-z0-9_]+)"/gm)) {
      if (m[1] === type) found.push({ file: name, name: m[2] });
    }
  }
  return found;
}

/**
 * Delimiter balance outside strings, comments and interpolations. Not a parse —
 * it cannot see a misplaced `=` or an unknown argument. It sees exactly the
 * 2026-09-04 defect: an orphaned delimiter left behind by a deletion.
 *
 * The string scanner understands `${...}`, and that is not a refinement. HCL
 * strings nest quotes inside an interpolation — `main.tf` already carries
 * `"${metric} — ${join(" vs ", …)}"` — and a scanner that stops the string at
 * the first inner quote resumes reading the interpolation's contents AS CODE.
 * That file passes today by luck: the delimiters happen to fall either side of
 * the span it mis-scans. Move one, as in `"${join(") ", x)}"`, and it returns
 * `unmatched )` on a valid file. False reds are the failure this file elsewhere
 * argues is fatal, because a guard that cries wolf gets deleted.
 */
function imbalance(source) {
  const depth = { '{': 0, '(': 0, '[': 0 };
  const close = { '}': '{', ')': '(', ']': '[' };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '#' || (c === '/' && source[i + 1] === '/')) {
      i = source.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2);
      if (i === -1) return 'unterminated block comment';
      i += 2;
      continue;
    }
    const heredoc = /^<<-?([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(i, i + 40));
    if (heredoc) {
      // Heredocs carry arbitrary text, so their delimiters are not code. The
      // terminator is whatever word opened it, on a line of its own — matched
      // generally rather than against the one spelling in use today, because
      // the narrow version would red spuriously on the next `<<EOF` someone
      // adds and a guard that cries wolf gets deleted.
      const term = new RegExp(`^\\s*${heredoc[1]}\\s*$`, 'm');
      const rest = source.slice(i);
      const m = term.exec(rest);
      i = m ? i + m.index + m[0].length : source.length;
      continue;
    }
    if (c === '"') {
      // Skip the whole string, INCLUDING any `${...}` it carries. An
      // interpolation is self-contained, so skipping it cannot unbalance the
      // file, while reading it as code can — see the note on the function.
      i += 1;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          let interp = 1;
          i += 2;
          while (i < source.length && interp > 0) {
            if (source[i] === '\\') i += 2;
            else if (source[i] === '"') {
              // A nested string inside the interpolation.
              i += 1;
              while (i < source.length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1;
              i += 1;
            } else {
              if (source[i] === '{') interp += 1;
              else if (source[i] === '}') interp -= 1;
              i += 1;
            }
          }
          continue;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c in depth) depth[c] += 1;
    else if (c in close) {
      depth[close[c]] -= 1;
      if (depth[close[c]] < 0) return `unmatched ${c}`;
    }
    i += 1;
  }
  const open = Object.entries(depth).find(([, n]) => n !== 0);
  return open ? `${open[1]} unclosed ${open[0]}` : null;
}

describe('the delimiter counter itself', () => {
  // These feed `imbalance` synthetic sources, because the real `.tf` corpus
  // cannot reach every path. No committed Terraform here contains a heredoc, a
  // block comment, or an unbalanced delimiter, so all three fault returns and
  // the heredoc and block-comment branches are exercised HERE and nowhere else.
  // A refactor could break any of them with the suite staying green, which is
  // the silent-green class this whole file exists to close.
  //
  // Scoped deliberately narrowly. Earlier wordings of this comment claimed more
  // than the corpus supported — that only the `#`, string and depth paths were
  // covered by real files, when `main.tf` carries `//` comments and
  // `modules/opensearch/variables.tf` carries escaped quotes. Understating
  // coverage is the safer direction and it is still a false claim about the
  // corpus, in the one comment whose subject is not asserting what it cannot
  // support.
  //
  // Two gaps stated rather than hidden, and they qualify the paragraph above
  // rather than sitting beside it. There were three: `${...}` interpolation was
  // the worst, because it failed in the LOUD direction, and it is now handled
  // rather than disclosed. An unterminated HEREDOC does not red:
  // it runs to end-of-source and the depth tally decides, unlike an
  // unterminated block comment which returns a fault. And a comment running to
  // end-of-file with no trailing newline exits the scan early. Both are
  // acceptable for a counter whose job is catching an orphaned delimiter in a
  // formatted file, and neither should be discovered by surprise.
  const cases = [
    ['balanced', 'resource "a" "b" {\n  x = [1, (2)]\n}\n', null],
    ['an unmatched closer', 'resource "a" "b" {\n}\n}\n', 'unmatched }'],
    ['an unclosed opener', 'resource "a" "b" {\n', '1 unclosed {'],
    ['a brace inside a string', 'x = "a } b"\n', null],
    ['a brace inside a hash line comment', '# a } comment\nx = 1\n', null],
    ['a brace inside a slash line comment', '// a } comment\nx = 1\n', null],
    ['a brace inside a block comment', '/* a } comment */\nx = 1\n', null],
    ['a brace inside a heredoc', 'x = <<EOF\nunbalanced } here\nEOF\n', null],
    ['a brace inside an indented heredoc with another word', 'x = <<-JSON\n{ "a": 1\nJSON\n', null],
    ['an escaped quote before a brace', 'x = "a \\" } b"\n', null],
    // The construct `main.tf` already carries, and the one that stresses the
    // string branch hardest: a quote nested inside an interpolation.
    // Passes under the OLD scanner too, by the same quote-parity luck `main.tf`
    // runs on: the delimiters land inside spans it skips. Kept because it is the
    // construct the corpus actually carries, and labelled because a case that
    // pins nothing must not read as one that does.
    ['a nested quote inside an interpolation', 'x = "${join(" vs ", y)}"\n', null],
    // The same construct with a delimiter inside the nested string. The old
    // scanner returned `unmatched )` here, on valid HCL.
    ['an unbalanced delimiter inside an interpolated string', 'x = "${join(") ", y)}"\n', null],
    ['a brace inside an interpolated string', 'x = "${join(" } ", y)}"\n', null],
    // The escape branch INSIDE an interpolation. The trailing `y = )` is what
    // makes this DISCRIMINATE rather than merely reach the branch: without it
    // every mutation of the escape handling still returns null, because the
    // mis-scanned span swallows its own delimiters either way. With it, a broken
    // escape leaves the interpolation open to end-of-source and the stray paren
    // is swallowed too, so the expected fault disappears. A case that reaches a
    // branch without discriminating on it is the thing the label four lines up
    // exists to warn about.
    ['an escaped quote inside an interpolation', 'x = "${trim(\\" } \\", y)}"\ny = )\n', 'unmatched )'],
    // The escape branch inside a NESTED string inside an interpolation, which
    // the case above does not reach: there the backslash is caught by the outer
    // interpolation loop before the nested-string branch sees it. Same trailing
    // fault, same reason — without it, mutating this branch changes nothing.
    ['an escaped quote inside an interpolated string', 'x = "${trim("a\\"", y)}"\n)\n', 'unmatched )'],
    ['an unterminated block comment', 'x = 1\n/* never closed\n', 'unterminated block comment'],
    // The fault returns are parameterised over all three delimiter kinds, so
    // each kind gets a case. Without these, a refactor breaking the `close` map
    // for `(` or `[` alone would stay green on brace cases only.
    ['an unmatched paren', 'x = (1))\n', 'unmatched )'],
    ['an unmatched bracket', 'x = [1]]\n', 'unmatched ]'],
    ['an unclosed paren', 'x = (1\n', '1 unclosed ('],
    ['an unclosed bracket', 'x = [1\n', '1 unclosed ['],
  ];
  for (const [label, source, expected] of cases) {
    it(`reports ${label} correctly`, () => {
      assert.equal(imbalance(source), expected);
    });
  }
});

describe('the deployment module’s notification surface and syntactic integrity', () => {
  it('finds Terraform files to check, so a zero-match pass is impossible', () => {
    // Two assertions doing different jobs, and the second is the real one.
    //
    // The floor is a coarse backstop against an empty or collapsed corpus. It
    // is deliberately loose and it cannot carry the property on its own: at 12
    // against 15 files it tolerates losing three, and it would go on passing if
    // the walk regressed to root-only in a repository that later grew a few
    // more root files. An earlier version of this comment claimed the floor had
    // been REPLACED, while the code still asserted it — a comment disowning a
    // live assertion, which is worse than either instrument alone.
    //
    // What must hold is that the walk reaches BOTH submodules. A root-only read
    // finds 7 and misses 8, and those 8 were getting no syntax check at all
    // until 2026-09-04 — an orphaned delimiter there breaks a plan exactly as
    // it does at the root. That, rather than the publish fence, is what the
    // widening buys: the Worker submodule declares no AWS resource.
    assert.ok(files.length >= 12, `expected at least 12 .tf files under ${DIR}, found ${files.length}`);
    for (const submodule of ['modules/cloudflare-worker/', 'modules/opensearch/']) {
      assert.ok(
        files.some((f) => f.name.startsWith(submodule)),
        `no .tf found under ${submodule} — has the walk regressed to the deployment root?`,
      );
    }
    assert.ok(
      resourcesOfType('aws_sns_topic').length >= 1,
      'no SNS topic found — has the module moved, or the parser broken?',
    );
  });

  it('carries exactly the notification subscriptions that were decided', () => {
    // Enumerated, not counted. A count is satisfied by the wrong set.
    const subscriptions = resourcesOfType('aws_sns_topic_subscription').map((r) => r.name).sort();
    assert.deepEqual(
      subscriptions,
      ['search_ops_email'],
      `the module declares notification subscriptions that no decision covers.\n` +
        `The email subscription carries the searchable-documents floor alarm. ` +
        `Anything else on that topic needs a decision first — ADR-089 withdrew the last one that did not have one.`,
    );
  });

  it('grants no permission to publish notifications', () => {
    // The withdrawn publish role is the thing this keeps absent. A role that
    // can publish to the operations topic is an egress path, and an egress
    // path with no decision behind it is what ADR-089 removed.
    const grants = files.flatMap(({ name, body }) =>
      body.includes('sns:Publish') ? [name] : [],
    );
    assert.deepEqual(
      grants,
      [],
      `these files grant sns:Publish: ${grants.join(', ')}. ` +
        `No decision currently sanctions publishing to the operations topic.`,
    );
  });

  for (const { name, body } of files) {
    it(`${name} has balanced delimiters`, () => {
      // Mutation-proved on 2026-09-04, in the deployment root and again in the
      // Worker submodule: an orphaned `}` reds this, which is the exact shape
      // of the defect that reached a commit unnoticed that day. Dated because
      // it records what was done rather than a property the tree re-establishes
      // — the branches themselves are held by the unit cases above.
      assert.equal(imbalance(body), null, `${name}: ${imbalance(body)}`);
    });
  }
});
