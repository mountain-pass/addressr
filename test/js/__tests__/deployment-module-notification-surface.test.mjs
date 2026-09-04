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
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.tf'))
  .map((f) => ({ name: f, body: readFileSync(`${DIR}/${f}`, 'utf8') }));

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
 * Delimiter balance outside strings and comments. Not a parse — it cannot see a
 * misplaced `=` or an unknown argument. It sees exactly the 2026-09-04 defect.
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
    if (c === '<' && source.slice(i, i + 4) === '<<-E') {
      // Heredocs carry arbitrary text; skip to the terminator line.
      const end = source.indexOf('\nEOT', i);
      i = end === -1 ? source.length : end + 4;
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < source.length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1;
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

describe('the deployment module’s notification surface and syntactic integrity', () => {
  it('finds Terraform files to check, so a zero-match pass is impossible', () => {
    assert.ok(files.length >= 5, `expected at least 5 .tf files in ${DIR}, found ${files.length}`);
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
      // Mutation-proved: an orphaned `}` reds this, which is the exact shape
      // of the 2026-09-04 defect that reached a commit unnoticed.
      assert.equal(imbalance(body), null, `${name}: ${imbalance(body)}`);
    });
  }
});
