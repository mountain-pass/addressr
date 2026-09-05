// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// The notification ADR-089 chose, asserted where it is declared. This is APPLY
// ONE of two, and the split is itself one of the properties pinned here.
//
// WHY SPLIT. Both destination addresses are created unverified; Cloudflare
// emails each a link a human clicks once. A routing rule pointing at an
// unverified address is documented as staying disabled — but that describes the
// RULE'S STATE, not whether the create call succeeds, and nothing establishes
// the second. If it fails, the surviving state is routing enabled with no rule,
// which is REASONED rather than observed to refuse inbound mail: the risky
// resource's failure mode leaves live the exact hazard it exists to prevent.
// Hedged to match `main.tf` and the ledger — three artefacts disagreeing about
// how certain a claim is becomes a defect the moment one is copied outward. Merging the release PR is the apply, so
// that failure lands after the packages publish.
//
// So apply 1 carries only what has no verification dependency. The catch-all
// and the Worker send binding follow once both addresses are verified. Their
// ABSENCE is asserted, not merely unmentioned — adding them early is the
// mistake this ordering exists to prevent, and it would look like progress.
//
// Mutation-proved: the credential fence, the send-binding absence, the
// two-address separation and the prevent_destroy pair. NOT mutation-proved: the
// zero-match guard, which is structural.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = 'apps/addressr-deployment';
const WORKER_MODULE = `${ROOT}/modules/cloudflare-worker`;

const tf = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.tf'))
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .join('\n');

const root = tf(ROOT);
const workerModule = tf(WORKER_MODULE);
const vars = readFileSync(`${ROOT}/vars.tf`, 'utf8');

/** The body of a named resource block, brace-balanced. */
function block(source, type, name) {
  const head = new RegExp(`resource\\s+"${type}"\\s+"${name}"\\s*\\{`);
  const m = head.exec(source);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(m.index, i + 1);
  }
  return null;
}

describe('managed-channel notification, apply 1 of 2', () => {
  it('finds the Terraform to check, so a zero-match pass is impossible', () => {
    assert.ok(root.length > 5000, `read too little from ${ROOT} — has the module moved?`);
    assert.ok(workerModule.includes('cloudflare_workers_script'), `no Worker script in ${WORKER_MODULE}`);
  });

  it('enables Email Routing on the zone', () => {
    assert.ok(
      block(root, 'cloudflare_email_routing_settings', 'zone'),
      'Email Routing is not declared; without it there is no verified destination to send to',
    );
  });

  it('declares two destination addresses, kept apart on purpose', () => {
    // The maintainer chose on 2026-09-05 that inbound mail must NOT land in the
    // alert inbox. Enabling routing moves the zone's mail acceptance from
    // the registrar's forwarder to Cloudflare, and the alert address is the sole
    // delivery path for the P035 search
    // trip-wire — a live control on the paid tier. One inbox for both would let
    // spam degrade a control, silently.
    const ops = block(root, 'cloudflare_email_routing_address', 'ops');
    const inbound = block(root, 'cloudflare_email_routing_address', 'inbound');
    assert.ok(ops, 'no alert destination address declared');
    assert.ok(inbound, 'no inbound destination address declared');
    assert.match(ops, /var\.ops_alert_email/, 'the alert destination does not reuse the existing alert address');
    assert.match(inbound, /var\.inbound_mail_forward_address/, 'the inbound destination is not its own variable');
    assert.doesNotMatch(
      inbound,
      /var\.ops_alert_email/,
      'inbound mail points at the alert address. That is the separation the maintainer chose, ' +
        'because the alert inbox is the only delivery path the search trip-wire has.',
    );
  });

  it('protects both addresses from silent replacement', () => {
    // Each holds human-verified state. Replacement drops the verification and
    // re-arming needs a person to click a link, so a silent replace disarms the
    // notification with nothing to notice. Same reasoning the search-ops topic
    // already carries.
    for (const name of ['ops', 'inbound']) {
      assert.match(
        block(root, 'cloudflare_email_routing_address', name) ?? '',
        /lifecycle\s*\{[^}]*prevent_destroy\s*=\s*true/,
        `the \`${name}\` address has no prevent_destroy; replacing it drops a human verification`,
      );
    }
  });

  it('carries neither the catch-all nor the send binding, which are apply 2', () => {
    assert.doesNotMatch(
      root,
      /resource\s+"cloudflare_email_routing_catch_all"/,
      'the catch-all is in apply 1. It points at an address that is unverified until a human ' +
        'clicks a link, and nothing establishes that its create succeeds against one.',
    );
    assert.doesNotMatch(
      workerModule,
      /type\s*=\s*"send_email"/,
      'the send binding is in apply 1. It lives in the script re-uploaded on every release, so ' +
        'if Cloudflare validates its destination at upload, an unverified address reds every deploy.',
    );
  });

  it('introduces no credential for notification, which is what ADR-089 won on', () => {
    // Broader than a vendor list: a variable named `mail_api_token` is the same
    // defect as one named `sendgrid_api_key`, and the list would miss it.
    const sensitiveMailVars = [...vars.matchAll(/variable\s+"([a-z0-9_]+)"\s*\{([\s\S]*?)\n\}/g)]
      .filter(([, name, body]) => /mail|email|notif|smtp/.test(name) && /sensitive\s*=\s*true/.test(body))
      .map(([, name]) => name);
    assert.deepEqual(
      sensitiveMailVars,
      [],
      `these mail-related variables are marked sensitive: ${sensitiveMailVars.join(', ')}. ` +
        `ADR-089 chose the provider's own mail path over a vendor precisely to store no credential.`,
    );
    const secretMailBindings = [...workerModule.matchAll(/\{[^{}]*?name\s*=\s*"([A-Z0-9_]+)"[^{}]*?type\s*=\s*"secret_text"[^{}]*?\}/g)]
      .map(([, name]) => name)
      .filter((n) => /MAIL|EMAIL|NOTIF|SMTP/.test(n));
    assert.deepEqual(secretMailBindings, [], `these bindings pass a mail credential: ${secretMailBindings.join(', ')}`);
  });
});
