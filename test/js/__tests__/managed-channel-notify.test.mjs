// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// The payload half of the withdrawn ADR-088 layer 3, retained by ADR-089 as the
// contract its replacement will use. Deliberately transport-free. An earlier
// version of this pair published to AWS from GitHub Actions; that was withdrawn
// unapplied on 2026-09-04 with no replacement in place. These assertions
// survived the reversal unchanged, which is the sign they were about the right
// thing.
//
// Two properties carry the design and both are asserted here rather than
// trusted, because each fails silently:
//
//   1. A CLEAN report must produce nothing. Notifying on every check trains
//      the reader to ignore the channel — the failure ADR-051 describes as
//      worse than no alert at all.
//   2. The body must carry fixed condition codes, the scope and the observation
//      time, and NOTHING else. This repository is public and the escalation
//      path is not; ADR-088 states the rule and this is where it is enforced.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notificationFor } from '../../../scripts/managed-channel-notify.mjs';

const AT = '2026-09-04T06:00:00.000Z';

const clean = {
  schema: 1,
  scope: 'd1_meter_state',
  checkedAt: AT,
  status: 'observed',
  findings: [],
  limitations: ['workload_and_provider_parity_unverified'],
};
const unhealthy = { ...clean, status: 'unhealthy', findings: ['delivery_exhausted'] };
const unverified = { ...clean, status: 'unverified', findings: ['credentials_unavailable'] };

describe('managed-channel fault notification payload', () => {
  it('stays silent on a clean report', () => {
    // A notification on every check is the shape that trains the reader to
    // ignore it. Silence when there is nothing to say is the feature.
    assert.equal(notificationFor(clean), null);
  });

  it('notifies on a fault and on an unreadable check', () => {
    // Unverified is deliberately NOT treated as clean: a check that could not
    // read is the state this project has shipped a green over before.
    assert.notEqual(notificationFor(unhealthy), null);
    assert.notEqual(notificationFor(unverified), null);
  });

  it('carries only fixed codes, scope and observation time', () => {
    // The positive assertion is that the permitted fields are present.
    // The negative one below is what actually guards the rule.
    const notification = notificationFor(unhealthy);
    const body = JSON.parse(notification.message);
    assert.deepEqual(Object.keys(body).sort(), ['checkedAt', 'findings', 'scope', 'status']);
    assert.equal(body.scope, 'd1_meter_state');
    assert.equal(body.checkedAt, AT);
    assert.deepEqual(body.findings, ['delivery_exhausted']);
  });

  it('drops any field the report carries that the rule does not permit', () => {
    // The real test. A future field added to the report — an organisation id, a
    // usage total, a provider error string — must not ride out to a notification just
    // because it appeared upstream. An allowlist, not a denylist.
    const leaky = {
      ...unhealthy,
      organizationId: 'org_should_never_appear',
      usageTotal: 4321,
      providerMessage: 'Stripe said something verbose',
      apiKey: 'sk_live_should_never_appear',
    };
    const body = JSON.parse(notificationFor(leaky).message);
    assert.deepEqual(Object.keys(body).sort(), ['checkedAt', 'findings', 'scope', 'status']);
    const serialised = notificationFor(leaky).message + notificationFor(leaky).subject;
    for (const forbidden of ['org_should_never_appear', '4321', 'Stripe said', 'sk_live']) {
      assert.ok(
        !serialised.includes(forbidden),
        `notification leaked ${forbidden}`,
      );
    }
  });

  it('keeps the subject free of anything but the scope and status', () => {
    // The subject is the part a reader sees first.
    const notification = notificationFor(unhealthy);
    assert.match(notification.subject, /^Addressr managed channel: unhealthy$/);
  });

  it('rejects a malformed report rather than publishing a half-formed one', () => {
    // Fail loud. A report missing its status is a bug in the reader, and
    // guessing at it would publish a notification nobody can act on.
    assert.throws(() => notificationFor({ scope: 'd1_meter_state' }), /status/);
    assert.throws(() => notificationFor(null), /report/);
  });
});
