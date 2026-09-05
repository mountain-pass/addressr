// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// The notification ADR-089 chose, asserted where it is declared. APPLY 1 WAS
// ATTEMPTED ON 2026-09-06 AND FAILED, so what this file pins has changed shape:
// the three resources are WITHDRAWN and their existence is no longer asserted.
//
// WHY THEY WENT. `cloudflare_email_routing_settings` is broken in the provider —
// it errors converting the API response on a missing `support_subaddress`
// field, upstream issue 7301, present in 5.24.0 which is the latest 5.x and what
// the lockfile carries. And both address creates returned 403: the deploy token
// has no Email Routing write scope. Left declared, they fail EVERY subsequent
// release apply, so the release path stays blocked until they go.
//
// WHAT SURVIVES HERE, and why these two rather than none. Deleting the file
// would drop the credential fence, and that fence matters MORE while the
// terminus is unbuilt, not less: ADR-089 chose Cloudflare's own mail path over a
// vendor on the single ground that it stores no credential, and the cheapest
// wrong way to unblock this is to reach for a vendor API key. The send-binding
// and catch-all absence is the ordering constraint for the rebuild, and it is
// still the right constraint — an unverified destination is exactly what apply 1
// was going to produce.
//
// The three retired cases asserted the resources EXIST. Re-add them with the
// resources, not before: ADR-074, and ADR-089 is still unratified.
//
// Mutation-proved: the credential fence, the send-binding absence, and the
// Email-Routing absence below — re-adding a settings resource reds it and
// nothing else. NOT mutation-proved: the zero-match guard, which is structural.

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

describe('managed-channel notification, apply 1 withdrawn', () => {
  it('finds the Terraform to check, so a zero-match pass is impossible', () => {
    assert.ok(root.length > 5000, `read too little from ${ROOT} — has the module moved?`);
    assert.ok(workerModule.includes('cloudflare_workers_script'), `no Worker script in ${WORKER_MODULE}`);
  });

  it('declares no Email Routing resource, because apply 1 failed and was withdrawn', () => {
    // Not an absence left unmentioned. Re-declaring these without the provider
    // fix and the token scope reds every release apply, and it would look like
    // progress. The comment in main.tf and the problem backlog carry the why.
    for (const name of ['settings', 'address']) {
      assert.doesNotMatch(
        root,
        new RegExp(`resource\\s+"cloudflare_email_routing_${name}"`),
        `cloudflare_email_routing_${name} is declared again. Apply 1 failed on 2026-09-06 — ` +
          'the provider cannot create the settings resource and the deploy token cannot create ' +
          'an address. Re-adding it blocks every release until it is removed again.',
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
