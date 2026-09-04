// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// Pins the ADR-088 layer-3 SMS notification adjunct at the declaration level.
// It discharges ADR-088 confirmation criterion 4 — "the SMS subscription's
// endpoint is protected and no phone number appears in the repository" — and
// NOTHING else. In particular it does not discharge criterion 2 (no customer
// identifier, usage total, provider message or credential in a notification
// body) or criterion 8 (a stamped message arrives and an unstamped one does
// not). Those need a live exercise, not a source read.
//
// Asserted in test rather than trusted to review because every failure mode
// here is SILENT:
//
//   - A `default` on the endpoint variable publishes a personal phone number to
//     a public repository, and nothing complains. The sibling ops_alert_email
//     DOES carry a default, so copying the obvious pattern is the mistake.
//   - A missing filter policy delivers every SearchableDocuments alarm
//     transition — alarm AND ok, both wired — to a handset, and the apply still
//     goes green. Worse, it makes CloudWatch a co-publisher whose payloads carry
//     account id, region, metric values and NewStateReason prose, which turns
//     criterion 2 from "untested" into "unestablishable as a channel property".
//   - Renaming the topic forces replacement, which drops the CONFIRMED email
//     subscription carrying the P035 silent-index-wipe trip-wire. An SNS email
//     subscription needs a human to click a link before it delivers again, so a
//     cosmetic rename disarms a live control for as long as nobody notices, and
//     the plan reads as a routine replacement.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set([
  'node_modules',
  '.git',
  '.terraform',
  'coverage',
  'target',
  'test-results',
  'dist',
  '.turbo',
  // Untracked local tooling state. Scanning it couples a committed test to a
  // working tree CI never sees, so a local-only false red is possible where
  // CI is green.
  '.codex',
  '.impeccable',
]);

// Lockfiles carry base64 `sha512-` integrity hashes, and a `+` followed by a
// long digit run inside one matches the E.164 shape. A regenerated lockfile
// would then red the suite reporting "phone-number-shaped literal committed",
// which is both wrong and misleading. They hold no prose and no configuration,
// so excluding them costs no coverage.
const SKIP_FILES = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/;

const VARS = readFileSync('apps/addressr-deployment/vars.tf', 'utf8');
const MAIN = readFileSync('apps/addressr-deployment/main.tf', 'utf8');

/** Extract one brace-balanced HCL block starting at `header`. */
function block(source, header) {
  const start = source.indexOf(header);
  if (start === -1) return null;
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const smsVar = () => block(VARS, 'variable "ops_alert_sms" {');
const smsSub = () =>
  block(MAIN, 'resource "aws_sns_topic_subscription" "managed_channel_sms" {');
const topic = () => block(MAIN, 'resource "aws_sns_topic" "search_ops" {');

describe('ADR-088 managed-channel SMS subscription', () => {
  it('finds every declaration it checks, so a zero-match pass is impossible', () => {
    // Without this, a rename or a move turns every assertion below into a
    // vacuous pass and the whole file exits 0 over nothing.
    assert.ok(smsVar(), 'ops_alert_sms variable not found in vars.tf');
    assert.ok(smsSub(), 'managed_channel_sms subscription not found in main.tf');
    assert.ok(topic(), 'search_ops topic not found in main.tf');
  });

  it('declares no default for the SMS endpoint, so no number rides in the tree', () => {
    const declared = smsVar();
    assert.doesNotMatch(
      declared,
      /^\s*default\s*=/m,
      'ops_alert_sms must not declare a default — a default here puts a phone number in a public repository',
    );
    assert.match(
      declared,
      /^\s*sensitive\s*=\s*true\s*$/m,
      'ops_alert_sms must be sensitive so plan and apply output redact it',
    );
  });

  it('carries no phone-number-shaped literal anywhere in the repository', () => {
    // Scans by SHAPE, not for one known value, so a different number committed
    // later also fires. E.164, bare Australian mobile, and country-code form.
    // The country-code form is deliberately NOT a bare /\b61[45]\d{8}\b/: an AWS
    // account id is exactly 12 digits, so that shape false-reds on any account
    // beginning 614 or 615. Require a leading + or a 0-prefixed trunk form.
    const patterns = [/\+\d{9,15}\b/, /\b04\d{8}\b/, /\b0061[45]\d{8}\b/];
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        // ADR-088 criterion 4 says "the repository", so the scan is repo-wide
        // rather than deployment-only: a number pasted into a doc, a changeset
        // or a problem ticket is committed just the same. Skipped paths are
        // vendored, generated or version-control internals.
        if (SKIP.has(entry)) continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        // Markdown matters most and was missing from the first version of this
        // list: docs, changesets and problem tickets are exactly where a number
        // gets pasted, and a scan that skips them reads as coverage it lacks.
        if (!/\.(tf|tfvars|json|ya?ml|mjs|js|ts|sh|md|txt|env|tpl)$/.test(entry)) continue;
        if (SKIP_FILES.test(path)) continue;
        const text = readFileSync(path, 'utf8');
        for (const pattern of patterns) {
          const hit = text.match(pattern);
          if (hit) offenders.push(`${path}: ${hit[0]}`);
        }
      }
    };
    walk('.');
    assert.deepEqual(
      offenders,
      [],
      `phone-number-shaped literal committed to the repository:\n${offenders.join('\n')}`,
    );
  });

  it('bounds the SMS channel with a message-attribute filter', () => {
    const declared = smsSub();
    assert.match(
      declared,
      /filter_policy_scope\s*=\s*"MessageAttributes"/,
      'the SMS subscription must filter on MessageAttributes — CloudWatch alarm publications carry none, which is exactly what excludes them',
    );
    assert.match(
      declared,
      /filter_policy\s*=\s*jsonencode\(\{\s*channel\s*=\s*\["managed"\]\s*\}\)/,
      'the SMS filter must match only the managed channel attribute',
    );
    assert.match(
      declared,
      /endpoint\s*=\s*var\.ops_alert_sms/,
      'the SMS endpoint must come from the protected variable, never a literal',
    );
  });

  it('refuses replacement of the topic, rather than merely noticing a rename', () => {
    // A name assertion is detective: it catches a rename only once someone
    // writes one, and says nothing about a replacement forced by some other
    // attribute. prevent_destroy makes Terraform REFUSE the apply, which is the
    // control; this asserts the control is declared, not the literal beneath it.
    assert.match(
      topic(),
      /lifecycle\s*\{[^}]*prevent_destroy\s*=\s*true/s,
      'the topic must declare prevent_destroy — replacement drops the confirmed email subscription carrying the silent-index-wipe trip-wire',
    );
  });
});
